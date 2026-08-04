const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export const formatAmount = (cents: number): string => currency.format(cents / 100);

/**
 * Parses user input like "12.99", "$1,299" or the accounting form "(12.99)",
 * which spreadsheets use for negatives, into integer cents.
 */
export function parseAmountToCents(input: string): number | null {
  const trimmed = input.trim();
  const parenthesised = /^\(.*\)$/.test(trimmed);
  const cleaned = (parenthesised ? trimmed.slice(1, -1) : trimmed).replace(/[$,\s]/g, '');

  if (!/^-?\d*\.?\d{0,2}$/.test(cleaned) || cleaned === '' || cleaned === '-') {
    return null;
  }

  const cents = Math.round(Number(cleaned) * 100) * (parenthesised ? -1 : 1);
  return Number.isFinite(cents) && cents !== 0 ? cents : null;
}

/** Renders an ISO date without shifting it into the local timezone. */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) {
    return isoDate;
  }

  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export const today = (): string => new Date().toISOString().slice(0, 10);
