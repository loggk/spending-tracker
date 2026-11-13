/**
 * Per-issuer templates for reading a transaction alert email.
 *
 * These are regex templates over the plain-text body, which is free and
 * deterministic and can be unit-tested against saved messages. They are also
 * brittle by nature: an issuer redesigning its alert silently stops matching.
 * That is why `parseAlert` returns null rather than guessing — the caller falls
 * back to the model, which is slower and costs a fraction of a cent but does
 * not care about layout.
 *
 * Each issuer is tried label-first (`Amount: $12.34`) and then against the
 * sentence forms these alerts use, because both shapes are in circulation.
 */

import type { IngestSource } from '@spending-tracker/shared';
import type { ParsedEmail } from './mime';

/**
 * `credit` covers refunds and reversals, which are recorded as a negative
 * amount the way a refund typed in by hand would be.
 */
export type AlertKind = 'authorization' | 'debit' | 'credit';

export interface ParsedAlert {
  source: IngestSource;
  date: string;
  amountCents: number;
  currency: string;
  merchantRaw: string;
  kind: AlertKind;
}

const ISSUERS: { source: IngestSource; domain: RegExp }[] = [
  { source: 'amex', domain: /(?:^|\.)(?:americanexpress|aexp)\.(?:com|ca)$/ },
  { source: 'rbc', domain: /(?:^|\.)(?:rbc|royalbank)\.com$/ },
];

/** Alerts quote Canadian dollars unless they say otherwise. */
const DEFAULT_CURRENCY = 'CAD';

const AMOUNT_LABELLED =
  /\b(?:amount|amount charged|transaction amount|charge of|purchase of|debit of|credit of|refund of)\b[:\s]*(?:(CAD|USD|EUR|GBP)\s*)?(?:US)?\$?\s*([\d,]+\.\d{2})/i;
const AMOUNT_BARE =
  /(?:(CAD|USD|EUR|GBP)\s*)?(?:US)?\$\s*([\d,]+\.\d{2})(?:\s*(CAD|USD|EUR|GBP))?/i;

const MERCHANT_LABELLED = /\b(?:merchant|merchant name|description|payee|where)\b[:\s]*(.+)/i;
const MERCHANT_SENTENCE = /\bat\s+(.+?)(?:\s+(?:on|for|was|has been|using|with)\b|[.!\n]|\s*$)/i;

const DATE_LABELLED = /\b(?:date|transaction date|posted|date and time)\b[:\s]*(.+)/i;
const DATE_ISO = /\b(\d{4}-\d{2}-\d{2})\b/;
const DATE_MONTH_FIRST = /\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/;
const DATE_DAY_FIRST = /\b(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})\b/;

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const CREDIT_WORDS = /\b(?:refund|refunded|credit|credited|reversal|reversed|returned)\b/i;
const DEBIT_WORDS = /\b(?:debit|debited|withdrawal|withdrawn|e-?transfer|bill payment)\b/i;

/** Null when the sender is not an issuer this code knows how to read. */
export function detectSource(from: string): IngestSource | null {
  const domain = from.slice(from.indexOf('@') + 1).toLowerCase();

  return ISSUERS.find((issuer) => issuer.domain.test(domain))?.source ?? null;
}

/**
 * Reads an alert, or returns null when nothing matched confidently enough to
 * be worth writing down.
 *
 * `receivedAt` stands in when the body carries no date. These alerts are sent
 * within seconds of the purchase, so the delivery time is a better guess than
 * discarding the transaction — and the user confirms the date either way.
 */
export function parseAlert(email: ParsedEmail, receivedAt: Date): ParsedAlert | null {
  const source = detectSource(email.from);
  if (source === null) {
    return null;
  }

  const body = `${email.subject}\n${email.text}`;

  const amount = findAmount(body);
  const merchantRaw = findMerchant(body);

  // An amount with no merchant is not usable: the merchant is half the
  // deduplication key, and a row saying only "$12.34" tells the user nothing.
  if (amount === null || merchantRaw === null) {
    return null;
  }

  const kind = findKind(body);

  return {
    source,
    date: findDate(body) ?? toIsoDate(receivedAt),
    // Refunds are negative, matching how a refund is entered by hand.
    amountCents: kind === 'credit' ? -amount.cents : amount.cents,
    currency: amount.currency,
    merchantRaw,
    kind,
  };
}

function findAmount(body: string): { cents: number; currency: string } | null {
  const match = AMOUNT_LABELLED.exec(body) ?? AMOUNT_BARE.exec(body);
  if (!match?.[2]) {
    return null;
  }

  const cents = Math.round(Number(match[2].replace(/,/g, '')) * 100);
  if (!Number.isFinite(cents) || cents === 0) {
    return null;
  }

  const currency = match[1] ?? match[3] ?? (/\bUS\$/.test(body) ? 'USD' : DEFAULT_CURRENCY);

  return { cents, currency: currency.toUpperCase() };
}

function findMerchant(body: string): string | null {
  const match = MERCHANT_LABELLED.exec(body) ?? MERCHANT_SENTENCE.exec(body);
  const captured = match?.[1];
  if (captured === undefined) {
    return null;
  }

  // Amex marks a pending amount with a trailing asterisk, and label forms often
  // run to the end of the line with punctuation attached.
  const merchant = captured
    .replace(/[*.,;:\s]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  return merchant === '' ? null : merchant.slice(0, 200);
}

function findKind(body: string): AlertKind {
  if (CREDIT_WORDS.test(body)) {
    return 'credit';
  }

  return DEBIT_WORDS.test(body) ? 'debit' : 'authorization';
}

/**
 * Only unambiguous formats are accepted. All-numeric dates like `11/12/2026`
 * are deliberately ignored: Amex Canada and RBC do not agree on whether the day
 * or the month comes first, and reading one wrong moves a transaction into
 * another month of the user's dashboard. The received date is the safer answer.
 */
function findDate(body: string): string | null {
  const labelled = DATE_LABELLED.exec(body)?.[1];

  for (const candidate of [labelled, body]) {
    if (candidate === undefined) {
      continue;
    }

    const iso = DATE_ISO.exec(candidate)?.[1];
    if (iso !== undefined && isRealDate(iso)) {
      return iso;
    }

    const monthFirst = DATE_MONTH_FIRST.exec(candidate);
    if (monthFirst) {
      const date = fromParts(monthFirst[3], monthFirst[1], monthFirst[2]);
      if (date !== null) {
        return date;
      }
    }

    const dayFirst = DATE_DAY_FIRST.exec(candidate);
    if (dayFirst) {
      const date = fromParts(dayFirst[3], dayFirst[2], dayFirst[1]);
      if (date !== null) {
        return date;
      }
    }
  }

  return null;
}

function fromParts(
  year: string | undefined,
  monthName: string | undefined,
  day: string | undefined,
): string | null {
  const month = MONTHS[(monthName ?? '').slice(0, 3).toLowerCase()];
  if (month === undefined || year === undefined || day === undefined) {
    return null;
  }

  const iso = `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`;

  return isRealDate(iso) ? iso : null;
}

function isRealDate(iso: string): boolean {
  const parsed = new Date(`${iso}T00:00:00Z`);

  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(iso);
}

export const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);
