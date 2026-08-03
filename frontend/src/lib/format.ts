const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export const formatAmount = (cents: number): string => currency.format(cents / 100);

/** Parses user input like "12.99" or "$1,299" into integer cents. */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!/^-?\d*\.?\d{0,2}$/.test(cleaned) || cleaned === '' || cleaned === '-') {
    return null;
  }

  const cents = Math.round(Number(cleaned) * 100);
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
