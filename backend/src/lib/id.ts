import { randomBytes } from 'node:crypto';

// Crockford base32 — excludes I, L, O and U so ids have no ambiguous characters.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIMESTAMP_LENGTH = 10;
const RANDOM_LENGTH = 16;

/**
 * A time-sortable, URL-safe identifier: a base32 millisecond timestamp followed
 * by cryptographic randomness. Ids generated later sort after earlier ones, so
 * transactions recorded on the same day keep their insertion order.
 */
export function createId(now: number = Date.now()): string {
  let timestamp = '';
  let remaining = now;

  for (let i = 0; i < TIMESTAMP_LENGTH; i += 1) {
    timestamp = ALPHABET.charAt(remaining % 32) + timestamp;
    remaining = Math.floor(remaining / 32);
  }

  // 256 is a multiple of 32, so reducing a random byte introduces no bias.
  const random = Array.from(randomBytes(RANDOM_LENGTH), (byte) => ALPHABET.charAt(byte % 32)).join(
    '',
  );

  return timestamp + random;
}
