import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { IngestParser, IngestSource } from '@spending-tracker/shared';
import type { SESHandler, SESMessage } from 'aws-lambda';
import { detectSource, parseAlert } from '../lib/alert-parsers';
import { parseAlertEmail } from '../lib/bedrock';
import { sanitizeMerchant } from '../lib/merchant';
import { extractAddress, parseEmail } from '../lib/mime';
import { listCategories } from '../repositories/categories';
import type { AliasRecord } from '../repositories/ingest-aliases';
import { resolveAlias } from '../repositories/ingest-aliases';
import { getMapping } from '../repositories/merchant-mappings';
import { createPending } from '../repositories/pending-transactions';

const s3 = new S3Client({});

/** Local parts of ingest addresses are `tx-<token>`. */
const LOCAL_PART_PREFIX = 'tx-';

const bucketName = (): string => {
  const name = process.env['INBOUND_BUCKET'];
  if (!name) {
    throw new Error('INBOUND_BUCKET environment variable is not set');
  }
  return name;
};

const objectPrefix = (): string => process.env['INBOUND_PREFIX'] ?? 'inbound/';

/**
 * Receives alert emails through the SES receipt rule.
 *
 * Invoked by the rule's Lambda action rather than by an S3 event, because the
 * address the mail was actually delivered to only exists in the SMTP envelope,
 * which SES passes here as `receipt.recipients`. A forwarded alert has the
 * user's own mailbox in its `To` header, so reading the stored message alone
 * cannot tell you whose ingest address it arrived at. The same event carries
 * the spam, virus, SPF and DKIM verdicts, which saves re-deriving them from
 * headers.
 *
 * Nothing here throws on bad input. There is no user waiting on a response and
 * no record to attach an error to — they never asked for this email to arrive —
 * so a message that cannot be used is logged and dropped. Lambda would only
 * retry it into the same outcome, and the CloudWatch alarm covers the case where
 * these start failing for a reason worth looking at.
 */
export const handler: SESHandler = async (event) => {
  for (const record of event.Records) {
    try {
      await ingest(record.ses);
    } catch (error) {
      console.error('Failed to ingest an alert email', {
        messageId: record.ses.mail.messageId,
        error,
      });
    }
  }
};

async function ingest(message: SESMessage): Promise<void> {
  const { mail, receipt } = message;

  const token = findToken(receipt.recipients);
  if (token === null) {
    console.warn('No ingest address among the recipients', { messageId: mail.messageId });
    return;
  }

  const alias = await resolveAlias(token);
  if (alias === null) {
    // Silent on purpose: replying would confirm which addresses exist to anyone
    // willing to guess at them.
    console.warn('Unknown ingest token', { messageId: mail.messageId });
    return;
  }

  const rejection = checkSender(message, alias);
  if (rejection !== null) {
    console.warn('Rejected an alert email', { messageId: mail.messageId, reason: rejection });
    return;
  }

  const raw = await fetchMessage(mail.messageId);
  if (raw === null) {
    return;
  }

  const email = parseEmail(raw);
  const receivedAt = new Date(mail.timestamp);
  const templated = parseAlert(email, receivedAt);

  const categories = await listCategories(alias.userId);
  const parsed =
    fromTemplate(templated) ??
    (await fromModel(email.text === '' ? raw : email.text, categories, email.from, receivedAt));

  if (parsed === null) {
    console.warn('Could not read a transaction from this email', { messageId: mail.messageId });
    return;
  }

  const merchantSanitized = sanitizeMerchant(parsed.merchantRaw);

  // What the user has already decided beats what the model guessed, and costs a
  // single read.
  const learned = await getMapping(alias.userId, merchantSanitized);
  const suggestedCategoryId = learned ?? parsed.suggestedCategoryId;

  const outcome = await createPending(alias.userId, {
    date: parsed.date,
    amountCents: parsed.amountCents,
    currency: parsed.currency,
    merchantRaw: parsed.merchantRaw,
    merchantSanitized,
    suggestedCategoryId:
      suggestedCategoryId !== null &&
      categories.some((category) => category.id === suggestedCategoryId)
        ? suggestedCategoryId
        : null,
    source: parsed.source,
    parser: parsed.parser,
  });

  console.info('Ingested an alert email', {
    messageId: mail.messageId,
    source: parsed.source,
    parser: parsed.parser,
    outcome,
  });
}

interface IngestedAlert {
  source: IngestSource;
  date: string;
  amountCents: number;
  currency: string;
  merchantRaw: string;
  parser: IngestParser;
  suggestedCategoryId: string | null;
}

/** Narrows a template match to the shape the rest of the flow uses. */
function fromTemplate(parsed: ReturnType<typeof parseAlert>): IngestedAlert | null {
  return parsed === null
    ? null
    : {
        source: parsed.source,
        date: parsed.date,
        amountCents: parsed.amountCents,
        currency: parsed.currency,
        merchantRaw: parsed.merchantRaw,
        parser: 'template',
        suggestedCategoryId: null,
      };
}

/**
 * The fallback for an alert no template matched. It is also given the chance to
 * suggest a category, since the call is being made anyway — the template path
 * leaves that to the learned mapping instead of paying for a model call per
 * alert.
 */
async function fromModel(
  body: string,
  categories: { id: string; name: string }[],
  from: string,
  receivedAt: Date,
): Promise<IngestedAlert | null> {
  const source = detectSource(from);
  if (source === null) {
    return null;
  }

  try {
    const result = await parseAlertEmail(
      body,
      categories.map(({ id, name }) => ({ id, name })),
    );

    return {
      source,
      date: result.date ?? receivedAt.toISOString().slice(0, 10),
      amountCents: result.amountCents,
      currency: result.currency,
      merchantRaw: result.merchant,
      parser: 'model',
      suggestedCategoryId: result.suggestedCategoryId,
    };
  } catch (error) {
    console.error('The model could not read this alert', error);
    return null;
  }
}

/** The first recipient that looks like one of ours, lowercased. */
export function findToken(recipients: string[]): string | null {
  for (const recipient of recipients) {
    const localPart = recipient.toLowerCase().split('@')[0] ?? '';

    if (localPart.startsWith(LOCAL_PART_PREFIX)) {
      const token = localPart.slice(LOCAL_PART_PREFIX.length);
      if (token !== '') {
        return token;
      }
    }
  }

  return null;
}

/**
 * The security boundary. The ingest address is public by necessity — it is typed
 * into a bank's alert settings — so without this check anyone who learned one
 * could write transactions into someone's ledger.
 *
 * Two senders are accepted: an issuer mailing the address directly, and the
 * user's own forwarding mailbox, which is only trusted when the message it
 * forwarded still carries an issuer in its `From` header. That second condition
 * is what stops a trusted forwarder from being used to inject anything it likes.
 *
 * Returns the reason for rejection, or null when the message is acceptable.
 */
export function checkSender(message: SESMessage, alias: AliasRecord): string | null {
  const { mail, receipt } = message;

  if (receipt.spamVerdict.status === 'FAIL' || receipt.virusVerdict.status === 'FAIL') {
    return 'failed a spam or virus check';
  }

  // One of the two is enough: a forwarded message passes SPF for the forwarder
  // while keeping the issuer's DKIM signature, and a direct message passes SPF
  // for the issuer.
  if (receipt.spfVerdict.status !== 'PASS' && receipt.dkimVerdict.status !== 'PASS') {
    return 'passed neither SPF nor DKIM';
  }

  const envelopeFrom = mail.source.toLowerCase();
  const headerFrom = extractAddress(mail.commonHeaders.from?.[0] ?? '');

  if (detectSource(envelopeFrom) !== null) {
    return null;
  }

  if (alias.forwardFrom === undefined) {
    return `sender ${envelopeFrom} is not an issuer, and no forwarding address is configured`;
  }

  if (envelopeFrom !== alias.forwardFrom) {
    return `sender ${envelopeFrom} is neither an issuer nor the configured forwarding address`;
  }

  if (detectSource(headerFrom) === null) {
    return `forwarded message is not from an issuer (From: ${headerFrom || 'absent'})`;
  }

  return null;
}

/** Null when the stored message could not be read, which is logged by the caller. */
async function fetchMessage(messageId: string): Promise<string | null> {
  const key = `${objectPrefix()}${messageId}`;

  const object = await s3.send(new GetObjectCommand({ Bucket: bucketName(), Key: key }));
  const body = await object.Body?.transformToString();

  if (!body) {
    console.error('The stored message was empty', { key });
    return null;
  }

  return body;
}
