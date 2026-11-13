import { describe, expect, it } from 'vitest';
import { detectSource, parseAlert } from './alert-parsers';
import type { ParsedEmail } from './mime';

const RECEIVED = new Date('2026-11-12T15:04:00Z');

const email = (overrides: Partial<ParsedEmail>): ParsedEmail => ({
  from: 'americanexpress@welcome.americanexpress.com',
  subject: '',
  text: '',
  headers: {},
  ...overrides,
});

describe('detectSource', () => {
  it.each([
    ['americanexpress@welcome.americanexpress.com', 'amex'],
    ['alerts@aexp.com', 'amex'],
    ['alerts@rbc.com', 'rbc'],
    ['notify@notifications.royalbank.com', 'rbc'],
  ])('recognises %s', (address, expected) => {
    expect(detectSource(address)).toBe(expected);
  });

  it.each(['someone@gmail.com', 'phish@americanexpress.com.evil.net', 'alerts@notrbc.com', ''])(
    'does not recognise %s',
    (address) => {
      expect(detectSource(address)).toBeNull();
    },
  );
});

describe('parseAlert', () => {
  it('reads a labelled Amex authorization', () => {
    const parsed = parseAlert(
      email({
        subject: 'Large Purchase Approved',
        text: ['Amount: $38.60*', 'Merchant: TIM HORTONS #1234', 'Date: November 11, 2026'].join(
          '\n',
        ),
      }),
      RECEIVED,
    );

    expect(parsed).toEqual({
      source: 'amex',
      date: '2026-11-11',
      amountCents: 3860,
      currency: 'CAD',
      merchantRaw: 'TIM HORTONS #1234',
      kind: 'authorization',
    });
  });

  it('reads the sentence form', () => {
    const parsed = parseAlert(
      email({
        text: 'A charge of $1,204.99 at APPLE STORE was approved on Nov 2, 2026.',
      }),
      RECEIVED,
    );

    expect(parsed?.amountCents).toBe(120_499);
    expect(parsed?.merchantRaw).toBe('APPLE STORE');
    expect(parsed?.date).toBe('2026-11-02');
  });

  it('reads an RBC debit', () => {
    const parsed = parseAlert(
      email({
        from: 'alerts@rbc.com',
        subject: 'RBC Alert: a debit was made',
        text: ['Transaction amount: $62.10', 'Description: LOBLAWS 1055', 'Date: 2026-11-12'].join(
          '\n',
        ),
      }),
      RECEIVED,
    );

    expect(parsed).toMatchObject({
      source: 'rbc',
      amountCents: 6210,
      merchantRaw: 'LOBLAWS 1055',
      date: '2026-11-12',
      kind: 'debit',
    });
  });

  it('records a refund as a negative amount', () => {
    const parsed = parseAlert(
      email({ text: 'A refund of $20.00 at INDIGO was credited on Nov 5, 2026.' }),
      RECEIVED,
    );

    expect(parsed?.amountCents).toBe(-2000);
    expect(parsed?.kind).toBe('credit');
  });

  it('picks up a stated currency', () => {
    const parsed = parseAlert(
      email({ text: 'Amount: USD $15.00\nMerchant: STEAM GAMES' }),
      RECEIVED,
    );

    expect(parsed?.currency).toBe('USD');
  });

  it('falls back to the received date when the body has none', () => {
    const parsed = parseAlert(email({ text: 'Amount: $9.99\nMerchant: SPOTIFY' }), RECEIVED);

    expect(parsed?.date).toBe('2026-11-12');
  });

  it('ignores an all-numeric date rather than guessing the order', () => {
    // 03/04/2026 is either 3 April or 4 March depending on the issuer, and
    // reading it wrong moves the transaction into another month.
    const parsed = parseAlert(
      email({ text: 'Amount: $9.99\nMerchant: SPOTIFY\nDate: 03/04/2026' }),
      RECEIVED,
    );

    expect(parsed?.date).toBe('2026-11-12');
  });

  it('rejects an impossible date', () => {
    const parsed = parseAlert(
      email({ text: 'Amount: $9.99\nMerchant: SPOTIFY\nDate: 2026-02-30' }),
      RECEIVED,
    );

    expect(parsed?.date).toBe('2026-11-12');
  });

  it.each([
    ['a sender that is not an issuer', email({ from: 'friend@gmail.com', text: 'Amount: $5.00' })],
    ['no amount', email({ text: 'Merchant: TIM HORTONS' })],
    ['no merchant', email({ text: 'Amount: $5.00' })],
    ['an unrelated email', email({ subject: 'Your statement is ready', text: 'Sign in to view.' })],
  ])('returns null for %s, leaving it to the model', (_label, input) => {
    expect(parseAlert(input, RECEIVED)).toBeNull();
  });
});
