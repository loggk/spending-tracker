/**
 * Key construction for the single-table design.
 *
 * Every item is partitioned by user, so a query can never cross user boundaries.
 * Sort keys are type-prefixed, which lets one query target a single entity type,
 * and transactions embed the date so a range query filters by period without a
 * secondary index.
 *
 * Because the date is part of a transaction's sort key, its public id carries
 * both parts (`<date>_<ulid>`). That keeps the id a complete, URL-safe handle:
 * clients pass it back verbatim and the server can locate the row from it alone.
 */

export const TRANSACTION_PREFIX = 'TXN#';
export const CATEGORY_PREFIX = 'CAT#';

/** Sorts after any character a date or ULID can contain. */
const HIGH_CHAR = '￿';

export const userPk = (userId: string): string => `USER#${userId}`;

export const categorySk = (id: string): string => `${CATEGORY_PREFIX}${id}`;

export const transactionId = (date: string, ulid: string): string => `${date}_${ulid}`;

export const transactionSk = (date: string, ulid: string): string =>
  `${TRANSACTION_PREFIX}${date}#${ulid}`;

/** Splits a public transaction id, returning null if it is malformed. */
export function parseTransactionId(id: string): { date: string; ulid: string } | null {
  const separator = id.indexOf('_');
  if (separator <= 0 || separator === id.length - 1) {
    return null;
  }

  const date = id.slice(0, separator);
  const ulid = id.slice(separator + 1);

  if (ulid.includes('#') || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  return { date, ulid };
}

/** Sort key for a public transaction id, or null if the id is malformed. */
export function transactionSkFromId(id: string): string | null {
  const parsed = parseTransactionId(id);
  return parsed && transactionSk(parsed.date, parsed.ulid);
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
