/**
 * Collapses an issuer's merchant description into a stable key.
 *
 * The same purchase is described differently by the authorization alert and by
 * the posted transaction — terminal ids, store numbers and trailing city or
 * province codes all move around. This produces something that survives those
 * differences, because it is half of the deduplication key and the lookup key
 * for a learned category.
 *
 * Stability is the whole point, not readability: `7-ELEVEN #38104 TORONTO ON`
 * and `7 ELEVEN 38104, TORONTO, ON` have to land on the same string even if
 * that string is not what anyone would choose to display. The untouched
 * description is kept alongside it as `merchantRaw`, and that is what the UI
 * shows.
 */

/**
 * Payment processors prefix the merchant with their own tag, which identifies
 * the terminal rather than the business.
 */
const PROCESSOR_PREFIX = /^(?:SQ|TST|SP|PY|POS|IC|PAYPAL|WWW|AMZN)\s*\*+\s*/;

const PROVINCES_AND_STATES = new Set([
  'AB',
  'BC',
  'MB',
  'NB',
  'NL',
  'NS',
  'NT',
  'NU',
  'ON',
  'PE',
  'QC',
  'SK',
  'YT',
  'CA',
  'CAN',
  'US',
  'USA',
]);

/**
 * Three digits or more, so a store number is dropped but a digit that is part
 * of the name (`7 ELEVEN`, `A&W`) is not.
 */
const isStoreNumber = (token: string): boolean => /^\d{3,}$/.test(token);

export function sanitizeMerchant(raw: string): string {
  const tokens = raw
    .toUpperCase()
    .replace(PROCESSOR_PREFIX, '')
    // Punctuation and separators are the least consistent part of these
    // descriptions, so none of it survives.
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token !== '' && !isStoreNumber(token));

  // Only trailing location codes go: `ON` at the end is a province, but `ON`
  // inside a name is a word.
  while (tokens.length > 1 && PROVINCES_AND_STATES.has(tokens[tokens.length - 1] as string)) {
    tokens.pop();
  }

  return tokens.join(' ');
}
