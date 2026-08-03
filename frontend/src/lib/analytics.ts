import type { Category, Transaction } from '@spending-tracker/shared';
import { FALLBACK_COLOR } from './palette';

export type RangeKey = 'month' | 'quarter' | 'ytd' | 'all';

export const RANGE_LABELS: Record<RangeKey, string> = {
  month: 'This month',
  quarter: 'Last 3 months',
  ytd: 'Year to date',
  all: 'All time',
};

const iso = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Start and end dates for a named range, in UTC so the boundaries match the
 * dates stored on transactions rather than the viewer's timezone.
 */
export function resolveRange(key: RangeKey, today = new Date()): { from?: string; to?: string } {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const to = iso(today);

  switch (key) {
    case 'month':
      return { from: iso(new Date(Date.UTC(year, month, 1))), to };
    case 'quarter':
      return { from: iso(new Date(Date.UTC(year, month - 2, 1))), to };
    case 'ytd':
      return { from: iso(new Date(Date.UTC(year, 0, 1))), to };
    case 'all':
      return {};
  }
}

export const totalCents = (transactions: Transaction[]): number =>
  transactions.reduce((sum, transaction) => sum + transaction.amountCents, 0);

export interface CategoryTotal {
  categoryId: string;
  name: string;
  color: string;
  cents: number;
  share: number;
}

/**
 * Spend per category, largest first. Transactions whose category was deleted are
 * collected under a single "Uncategorized" entry rather than dropped.
 */
export function byCategory(transactions: Transaction[], categories: Category[]): CategoryTotal[] {
  const lookup = new Map(categories.map((category) => [category.id, category]));
  const totals = new Map<string, number>();

  for (const transaction of transactions) {
    const key = lookup.has(transaction.categoryId) ? transaction.categoryId : '';
    totals.set(key, (totals.get(key) ?? 0) + transaction.amountCents);
  }

  const total = totalCents(transactions);

  return [...totals.entries()]
    .map(([categoryId, cents]) => {
      const category = lookup.get(categoryId);
      return {
        categoryId,
        name: category?.name ?? 'Uncategorized',
        color: category?.color ?? FALLBACK_COLOR,
        cents,
        share: total === 0 ? 0 : cents / total,
      };
    })
    .sort((a, b) => b.cents - a.cents);
}

export interface MonthTotal {
  /** `YYYY-MM`. */
  month: string;
  label: string;
  cents: number;
}

const monthLabel = (month: string): string => {
  const [year, index] = month.split('-').map(Number);
  if (!year || !index) {
    return month;
  }
  return new Date(Date.UTC(year, index - 1, 1)).toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });
};

/**
 * Spend per calendar month, oldest first. Months with no spending are included as
 * zero so gaps read as gaps instead of collapsing the time axis.
 */
export function byMonth(transactions: Transaction[]): MonthTotal[] {
  if (transactions.length === 0) {
    return [];
  }

  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    const month = transaction.date.slice(0, 7);
    totals.set(month, (totals.get(month) ?? 0) + transaction.amountCents);
  }

  const months = [...totals.keys()].sort();
  const first = months[0];
  const last = months[months.length - 1];
  if (!first || !last) {
    return [];
  }

  const [startYear, startMonth] = first.split('-').map(Number);
  const [endYear, endMonth] = last.split('-').map(Number);
  if (!startYear || !startMonth || !endYear || !endMonth) {
    return [];
  }

  const filled: MonthTotal[] = [];
  const cursor = new Date(Date.UTC(startYear, startMonth - 1, 1));
  const end = new Date(Date.UTC(endYear, endMonth - 1, 1));

  while (cursor <= end) {
    const month = cursor.toISOString().slice(0, 7);
    filled.push({ month, label: monthLabel(month), cents: totals.get(month) ?? 0 });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return filled;
}
