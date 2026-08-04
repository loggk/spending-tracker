import { describe, expect, it } from 'vitest';
import { parseKey } from './parse-receipt';

describe('parseKey', () => {
  it('reads the user and receipt from an upload key', () => {
    expect(parseKey('receipts/user-123/rcpt-456')).toEqual({
      userId: 'user-123',
      receiptId: 'rcpt-456',
    });
  });

  it.each([
    ['a different prefix', 'uploads/user/rcpt'],
    ['a missing segment', 'receipts/user'],
    ['extra nesting', 'receipts/user/sub/rcpt'],
    ['an empty key', ''],
  ])('ignores %s', (_label, key) => {
    expect(parseKey(key)).toBeNull();
  });
});
