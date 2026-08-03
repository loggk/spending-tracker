import { describe, expect, it } from 'vitest';
import {
  categorySk,
  parseTransactionId,
  transactionId,
  transactionRange,
  transactionSk,
  transactionSkFromId,
  userPk,
} from './keys';

describe('key construction', () => {
  it('namespaces partition keys by user', () => {
    expect(userPk('abc')).toBe('USER#abc');
  });

  it('orders transaction sort keys by date', () => {
    expect(transactionSk('2026-01-15', '01ABC') < transactionSk('2026-06-01', '01ABC')).toBe(true);
  });

  it('separates transactions from categories', () => {
    expect(transactionSk('2026-01-01', 'x').startsWith('TXN#')).toBe(true);
    expect(categorySk('x').startsWith('CAT#')).toBe(true);
  });
});

describe('transaction ids', () => {
  it('round-trips through the public id', () => {
    const id = transactionId('2026-01-15', '01ABCDEF');

    expect(parseTransactionId(id)).toEqual({ date: '2026-01-15', ulid: '01ABCDEF' });
    expect(transactionSkFromId(id)).toBe(transactionSk('2026-01-15', '01ABCDEF'));
  });

  it('produces a URL-safe id', () => {
    const id = transactionId('2026-01-15', '01ABCDEF');

    expect(encodeURIComponent(id)).toBe(id);
  });

  it.each([
    ['no separator', '2026011501ABC'],
    ['empty date', '_01ABC'],
    ['empty ulid', '2026-01-15_'],
    ['malformed date', 'jan-2026_01ABC'],
    ['key injection via #', '2026-01-15_01#ABC'],
  ])('rejects a malformed id: %s', (_label, id) => {
    expect(parseTransactionId(id)).toBeNull();
    expect(transactionSkFromId(id)).toBeNull();
  });
});

describe('transactionRange', () => {
  it('covers every transaction on the final day', () => {
    const { start, end } = transactionRange('2026-01-01', '2026-01-31');
    const lastOfMonth = transactionSk('2026-01-31', 'zzzzzzzzzzzzzzzzzzzzzzzzzz');

    expect(lastOfMonth >= start && lastOfMonth <= end).toBe(true);
  });

  it('excludes transactions outside the range', () => {
    const { start, end } = transactionRange('2026-02-01', '2026-02-28');

    expect(transactionSk('2026-01-31', 'x') >= start).toBe(false);
    expect(transactionSk('2026-03-01', 'x') <= end).toBe(false);
  });

  it('defaults to an unbounded range', () => {
    const { start, end } = transactionRange();

    expect(transactionSk('1999-01-01', 'x') >= start).toBe(true);
    expect(transactionSk('2999-12-31', 'x') <= end).toBe(true);
  });

  it('never matches a category key', () => {
    const { start, end } = transactionRange();
    const category = categorySk('x');

    expect(category >= start && category <= end).toBe(false);
  });
});
