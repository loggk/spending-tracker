import type { SESEvent, SESMessage } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  s3Send: vi.fn(),
  resolveAlias: vi.fn(),
  listCategories: vi.fn(),
  getMapping: vi.fn(),
  createPending: vi.fn(),
  parseAlertEmail: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = mocks.s3Send;
  },
  GetObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
}));

vi.mock('../repositories/ingest-aliases', () => ({ resolveAlias: mocks.resolveAlias }));
vi.mock('../repositories/categories', () => ({ listCategories: mocks.listCategories }));
vi.mock('../repositories/merchant-mappings', () => ({ getMapping: mocks.getMapping }));
vi.mock('../repositories/pending-transactions', () => ({ createPending: mocks.createPending }));
vi.mock('../lib/bedrock', () => ({ parseAlertEmail: mocks.parseAlertEmail }));

const { checkSender, findToken, handler } = await import('./ingest-email');

const PASS = { status: 'PASS' as const };

const AMEX_ALERT = [
  'From: "American Express" <AmericanExpress@welcome.americanexpress.com>',
  'Subject: Transaction Approved',
  'Content-Type: text/plain; charset=UTF-8',
  '',
  'Amount: $38.60',
  'Merchant: TIM HORTONS #1234',
  'Date: November 11, 2026',
].join('\r\n');

function message(overrides: {
  recipients?: string[];
  source?: string;
  headerFrom?: string;
  verdicts?: Partial<Record<'spam' | 'virus' | 'spf' | 'dkim', 'PASS' | 'FAIL'>>;
}): SESMessage {
  const verdict = (name: 'spam' | 'virus' | 'spf' | 'dkim') => ({
    status: overrides.verdicts?.[name] ?? 'PASS',
  });

  return {
    mail: {
      timestamp: '2026-11-12T15:04:00.000Z',
      source: overrides.source ?? 'americanexpress@welcome.americanexpress.com',
      messageId: 'msg-1',
      destination: overrides.recipients ?? ['tx-abc123@ingest.example.com'],
      headersTruncated: false,
      headers: [],
      commonHeaders: {
        returnPath: '',
        date: '',
        messageId: 'msg-1',
        from: [
          overrides.headerFrom ??
            '"American Express" <AmericanExpress@welcome.americanexpress.com>',
        ],
      },
    },
    receipt: {
      timestamp: '2026-11-12T15:04:00.000Z',
      processingTimeMillis: 1,
      recipients: overrides.recipients ?? ['tx-abc123@ingest.example.com'],
      spamVerdict: verdict('spam'),
      virusVerdict: verdict('virus'),
      spfVerdict: verdict('spf'),
      dkimVerdict: verdict('dkim'),
      dmarcVerdict: PASS,
      action: { type: 'Lambda', functionArn: 'arn', invocationType: 'Event' },
    },
  } satisfies SESMessage;
}

const event = (message: SESMessage): SESEvent => ({
  Records: [{ eventSource: 'aws:ses', eventVersion: '1.0', ses: message }],
});

const ALIAS = {
  token: 'abc123',
  userId: 'user-1',
  createdAt: '2026-11-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

  process.env['INBOUND_BUCKET'] = 'inbound-bucket';

  mocks.resolveAlias.mockResolvedValue(ALIAS);
  mocks.listCategories.mockResolvedValue([{ id: 'cat-food', name: 'Food' }]);
  mocks.getMapping.mockResolvedValue(null);
  mocks.createPending.mockResolvedValue('created');
  mocks.s3Send.mockResolvedValue({ Body: { transformToString: async () => AMEX_ALERT } });
});

describe('findToken', () => {
  it('picks the ingest recipient out of the envelope', () => {
    expect(findToken(['someone@example.com', 'TX-ABC123@Ingest.Example.com'])).toBe('abc123');
  });

  it.each([[[]], [['someone@example.com']], [['tx-@ingest.example.com']]])(
    'returns null for %j',
    (recipients) => {
      expect(findToken(recipients)).toBeNull();
    },
  );
});

describe('checkSender', () => {
  it('accepts an issuer mailing the address directly', () => {
    expect(checkSender(message({}), ALIAS)).toBeNull();
  });

  it('accepts a forward from the configured mailbox when the original is an issuer', () => {
    const forwarded = message({ source: 'logan@gmail.com', verdicts: { dkim: 'FAIL' } });

    expect(checkSender(forwarded, { ...ALIAS, forwardFrom: 'logan@gmail.com' })).toBeNull();
  });

  it('rejects a forward whose original sender is not an issuer', () => {
    const forwarded = message({ source: 'logan@gmail.com', headerFrom: 'stranger@example.com' });

    expect(checkSender(forwarded, { ...ALIAS, forwardFrom: 'logan@gmail.com' })).toMatch(
      /not from an issuer/,
    );
  });

  it('rejects a stranger when no forwarding address is configured', () => {
    expect(checkSender(message({ source: 'stranger@example.com' }), ALIAS)).toMatch(
      /no forwarding address/,
    );
  });

  it('rejects a mailbox other than the configured one', () => {
    expect(
      checkSender(message({ source: 'stranger@example.com' }), {
        ...ALIAS,
        forwardFrom: 'logan@gmail.com',
      }),
    ).toMatch(/neither an issuer nor/);
  });

  it.each([['spam'], ['virus']] as const)('rejects a failed %s verdict', (name) => {
    expect(checkSender(message({ verdicts: { [name]: 'FAIL' } }), ALIAS)).toMatch(/spam or virus/);
  });

  it('rejects a message that passes neither SPF nor DKIM', () => {
    expect(checkSender(message({ verdicts: { spf: 'FAIL', dkim: 'FAIL' } }), ALIAS)).toMatch(
      /neither SPF nor DKIM/,
    );
  });
});

describe('handler', () => {
  it('writes a pending row from a templated alert', async () => {
    await handler(event(message({})), {} as never, () => undefined);

    expect(mocks.parseAlertEmail).not.toHaveBeenCalled();
    expect(mocks.createPending).toHaveBeenCalledWith('user-1', {
      date: '2026-11-11',
      amountCents: 3860,
      currency: 'CAD',
      merchantRaw: 'TIM HORTONS #1234',
      merchantSanitized: 'TIM HORTONS',
      suggestedCategoryId: null,
      source: 'amex',
      parser: 'template',
    });
  });

  it('prefers a learned category over the model', async () => {
    mocks.getMapping.mockResolvedValue('cat-food');

    await handler(event(message({})), {} as never, () => undefined);

    expect(mocks.createPending.mock.calls[0]?.[1]).toMatchObject({
      suggestedCategoryId: 'cat-food',
    });
  });

  it('discards a learned category that no longer exists', async () => {
    mocks.getMapping.mockResolvedValue('cat-deleted');

    await handler(event(message({})), {} as never, () => undefined);

    expect(mocks.createPending.mock.calls[0]?.[1]).toMatchObject({
      suggestedCategoryId: null,
    });
  });

  it('falls back to the model when no template matches', async () => {
    mocks.s3Send.mockResolvedValue({
      Body: {
        transformToString: async () =>
          [
            'From: AmericanExpress@welcome.americanexpress.com',
            'Subject: Something new',
            '',
            'We have redesigned this email entirely.',
          ].join('\r\n'),
      },
    });
    mocks.parseAlertEmail.mockResolvedValue({
      date: '2026-11-12',
      amountCents: 1500,
      currency: 'CAD',
      merchant: 'NEW FORMAT CAFE',
      suggestedCategoryId: 'cat-food',
    });

    await handler(event(message({})), {} as never, () => undefined);

    expect(mocks.parseAlertEmail).toHaveBeenCalledOnce();
    expect(mocks.createPending.mock.calls[0]?.[1]).toMatchObject({
      parser: 'model',
      merchantRaw: 'NEW FORMAT CAFE',
      suggestedCategoryId: 'cat-food',
    });
  });

  it('writes nothing when the model cannot read it either', async () => {
    mocks.s3Send.mockResolvedValue({
      Body: { transformToString: async () => 'From: AmericanExpress@aexp.com\n\nnothing useful' },
    });
    mocks.parseAlertEmail.mockRejectedValue(new Error('no amount'));

    await handler(event(message({})), {} as never, () => undefined);

    expect(mocks.createPending).not.toHaveBeenCalled();
  });

  it('drops an unknown token without reading the message', async () => {
    mocks.resolveAlias.mockResolvedValue(null);

    await handler(event(message({})), {} as never, () => undefined);

    expect(mocks.s3Send).not.toHaveBeenCalled();
    expect(mocks.createPending).not.toHaveBeenCalled();
  });

  it('drops a rejected sender without reading the message', async () => {
    await handler(event(message({ source: 'stranger@example.com' })), {} as never, () => undefined);

    expect(mocks.s3Send).not.toHaveBeenCalled();
    expect(mocks.createPending).not.toHaveBeenCalled();
  });

  it('drops mail with no ingest recipient', async () => {
    await handler(
      event(message({ recipients: ['postmaster@ingest.example.com'] })),
      {} as never,
      () => undefined,
    );

    expect(mocks.resolveAlias).not.toHaveBeenCalled();
  });

  it('does not throw when a message fails, so SES is not retried into the same error', async () => {
    mocks.s3Send.mockRejectedValue(new Error('access denied'));

    await expect(
      handler(event(message({})), {} as never, () => undefined),
    ).resolves.toBeUndefined();
  });
});
