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

/**
 * Lowercase so the alphabet survives a round trip through mail systems that
 * normalise the local part of an address, and without the ambiguous letters for
 * the same reason `createId` omits them — this ends up being read aloud and
 * retyped into a bank's alert settings.
 */
const TOKEN_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const TOKEN_LENGTH = 16;

/**
 * An unguessable token for a public ingest address (~80 bits).
 *
 * Deliberately not `createId`: that one leads with a timestamp, and a
 * predictable prefix in an address anyone can mail is a liability.
 */
export function createToken(): string {
  return Array.from(randomBytes(TOKEN_LENGTH), (byte) =>
    TOKEN_ALPHABET.charAt(byte % TOKEN_ALPHABET.length),
  ).join('');
}
