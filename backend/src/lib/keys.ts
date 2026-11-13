/**
 * Key construction for the single-table design.
 *
 * Every item is partitioned by user, so a query can never cross user boundaries.
 * Sort keys are type-prefixed, which lets one query target a single entity type,
 * and transactions embed the date so a range query filters by period without a
 * secondary index.
 *
 * Because the date is part of a transaction's sort key, its public id carries
 * both parts (`<date>_<suffix>`). That keeps the id a complete, URL-safe handle:
 * clients pass it back verbatim and the server can locate the row from it alone.
 */

export const TRANSACTION_PREFIX = 'TXN#';
export const CATEGORY_PREFIX = 'CAT#';
export const RECEIPT_PREFIX = 'RCPT#';

/** Sorts after any character a date or id suffix can contain. */
const HIGH_CHAR = '￿';

export const userPk = (userId: string): string => `USER#${userId}`;

export const categorySk = (id: string): string => `${CATEGORY_PREFIX}${id}`;

export const receiptSk = (id: string): string => `${RECEIPT_PREFIX}${id}`;

export const transactionId = (date: string, suffix: string): string => `${date}_${suffix}`;

export const transactionSk = (date: string, suffix: string): string =>
  `${TRANSACTION_PREFIX}${date}#${suffix}`;

/** Splits a public transaction id, returning null if it is malformed. */
export function parseTransactionId(id: string): { date: string; suffix: string } | null {
  const separator = id.indexOf('_');
  if (separator <= 0 || separator === id.length - 1) {
    return null;
  }

  const date = id.slice(0, separator);
  const suffix = id.slice(separator + 1);

  if (suffix.includes('#') || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  return { date, suffix };
}

/** Sort key for a public transaction id, or null if the id is malformed. */
export function transactionSkFromId(id: string): string | null {
  const parsed = parseTransactionId(id);
  return parsed && transactionSk(parsed.date, parsed.suffix);
}

/**
 * Inclusive sort-key bounds for a date range, used as the `BETWEEN` condition
 * of a query.
 */
export function transactionRange(from?: string, to?: string): { start: string; end: string } {
  return {
    start: `${TRANSACTION_PREFIX}${from ?? ''}`,
    end: `${TRANSACTION_PREFIX}${to ?? HIGH_CHAR}${HIGH_CHAR}`,
  };
}

export const PENDING_PREFIX = 'PEND#';
export const MERCHANT_PREFIX = 'MERCH#';
export const DEDUP_PREFIX = 'DEDUP#';

/** Inbox row awaiting review. Ids come from `createId`, so these sort oldest first. */
export const pendingSk = (id: string): string => `${PENDING_PREFIX}${id}`;

/** A learned merchant -> category association, keyed by the sanitized merchant. */
export const merchantSk = (sanitizedMerchant: string): string =>
  `${MERCHANT_PREFIX}${sanitizedMerchant}`;

/**
 * Guard against ingesting the same purchase twice. Written conditionally in the
 * same transaction as the inbox row, which is what collapses an authorization
 * alert and the later posted-amount alert for one purchase into a single row.
 */
export const dedupSk = (date: string, amountCents: number, sanitizedMerchant: string): string =>
  `${DEDUP_PREFIX}${date}#${amountCents}#${sanitizedMerchant}`;

/**
 * Ingest aliases live in their own partition rather than under a user, because
 * the lookup runs the other way: an inbound email knows only the token. Keeping
 * it out of `USER#` means no secondary index is needed to resolve one.
 */
export const ingestAliasPk = (token: string): string => `INGEST#${token}`;

export const INGEST_ALIAS_SK = 'ALIAS';

/** Points a user at their current token, so the UI can show the address in one read. */
export const USER_ALIAS_SK = 'INGEST#ALIAS';
