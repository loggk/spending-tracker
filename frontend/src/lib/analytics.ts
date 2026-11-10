import type { Category, Transaction } from '@spending-tracker/shared';
import { FALLBACK_COLOR } from './palette';

export type RangeKey = 'month' | 'year' | 'all';

export const RANGE_LABELS: Record<RangeKey, string> = {
  month: 'This month',
  year: 'This year',
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
    case 'year':
      // January 1 through today, not a rolling twelve months.
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

export interface TrendPoint {
  label: string;
  cents: number;
  totals: Record<string, number>;
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

export interface MonthRange {
  from?: string;
  to?: string;
}

/**
 * Spend per calendar month, oldest first. Months with no spending are included as
 * zero so gaps read as gaps instead of collapsing the time axis.
 */
export function byMonth(transactions: Transaction[], range: MonthRange = {}): MonthTotal[] {
  if (transactions.length === 0) {
    return [];
  }

  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    const month = transaction.date.slice(0, 7);
    totals.set(month, (totals.get(month) ?? 0) + transaction.amountCents);
  }

  const months = [...totals.keys()].sort();
  let first = months[0];
  let last = months[months.length - 1];
  if (!first || !last) {
    return [];
  }

  const fromMonth = range.from?.slice(0, 7);
  const toMonth = range.to?.slice(0, 7);
  if (fromMonth && fromMonth < first) {
    first = fromMonth;
  }
  if (toMonth && toMonth > last) {
    last = toMonth;
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

export interface StackedMonthTotal extends MonthTotal {
  totals: Record<string, number>;
}

export interface MonthCategoryBreakdown {
  months: StackedMonthTotal[];
  series: CategoryTotal[];
}

/**
 * Spend per month broken down by category, for the stacked view of the monthly
 * chart. Reuses {@link byMonth} for the month spine so gaps stay visible, and
 * {@link byCategory} for a series order that is fixed across the whole range.
 */
export function byMonthAndCategory(
  transactions: Transaction[],
  categories: Category[],
  range: MonthRange = {},
): MonthCategoryBreakdown {
  const known = new Set(categories.map((category) => category.id));
  const perMonth = new Map<string, Record<string, number>>();

  for (const transaction of transactions) {
    const month = transaction.date.slice(0, 7);
    const key = known.has(transaction.categoryId) ? transaction.categoryId : '';
    const bucket = perMonth.get(month) ?? {};
    bucket[key] = (bucket[key] ?? 0) + transaction.amountCents;
    perMonth.set(month, bucket);
  }

  return {
    months: byMonth(transactions, range).map((entry) => ({
      ...entry,
      totals: perMonth.get(entry.month) ?? {},
    })),
    series: byCategory(transactions, categories),
  };
}

export interface DayTotal {
  /** `YYYY-MM-DD`. */
  date: string;
  label: string;
  cents: number;
}

export const dayLabel = (date: string): string => {
  const [year, index, day] = date.split('-').map(Number);
  if (!year || !index || !day) {
    return date;
  }
  return new Date(Date.UTC(year, index - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
};

export interface DayRange {
  from?: string;
  to?: string;
}

/**
 * Spend per calendar day, oldest first. Days with no spending are included as
 * zero so gaps read as gaps instead of collapsing the time axis.
 */
export function byDay(transactions: Transaction[], range: DayRange = {}): DayTotal[] {
  if (transactions.length === 0) {
    return [];
  }

  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    const day = transaction.date.slice(0, 10);
    totals.set(day, (totals.get(day) ?? 0) + transaction.amountCents);
  }

  const days = [...totals.keys()].sort();
  let first = days[0];
  let last = days[days.length - 1];
  if (!first || !last) {
    return [];
  }

  const fromDay = range.from?.slice(0, 10);
  const toDay = range.to?.slice(0, 10);
  if (fromDay && fromDay < first) {
    first = fromDay;
  }
  if (toDay && toDay > last) {
    last = toDay;
  }

  const [startYear, startMonth, startDay] = first.split('-').map(Number);
  const [endYear, endMonth, endDay] = last.split('-').map(Number);
  if (!startYear || !startMonth || !startDay || !endYear || !endMonth || !endDay) {
    return [];
  }

  const filled: DayTotal[] = [];
  const cursor = new Date(Date.UTC(startYear, startMonth - 1, startDay));
  const end = new Date(Date.UTC(endYear, endMonth - 1, endDay));

  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    filled.push({ date, label: dayLabel(date), cents: totals.get(date) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return filled;
}

export interface StackedDayTotal extends DayTotal {
  totals: Record<string, number>;
}

export interface DayCategoryBreakdown {
  days: StackedDayTotal[];
  series: CategoryTotal[];
}

/**
 * Spend per day broken down by category, for the stacked view of the daily
 * chart. Reuses {@link byDay} for the day spine so gaps stay visible, and
 * {@link byCategory} for a series order that is fixed across the whole range.
 */
export function byDayAndCategory(
  transactions: Transaction[],
  categories: Category[],
  range: DayRange = {},
): DayCategoryBreakdown {
  const known = new Set(categories.map((category) => category.id));
  const perDay = new Map<string, Record<string, number>>();

  for (const transaction of transactions) {
    const day = transaction.date.slice(0, 10);
    const key = known.has(transaction.categoryId) ? transaction.categoryId : '';
    const bucket = perDay.get(day) ?? {};
    bucket[key] = (bucket[key] ?? 0) + transaction.amountCents;
    perDay.set(day, bucket);
  }

  return {
    days: byDay(transactions, range).map((entry) => ({
      ...entry,
      totals: perDay.get(entry.date) ?? {},
    })),
    series: byCategory(transactions, categories),
  };
}

/**
 * Decides whether the time series should display daily or monthly granularity.
 * Ranges shorter than 90 days (e.g. "This month" or short custom spans) show daily;
 * larger spans ("This year", "All time", or >= 90 days) show monthly.
 */
export function isDayGranularity(
  range: { from?: string; to?: string },
  preset?: RangeKey,
): boolean {
  if (preset === 'month') {
    return true;
  }
  if (preset === 'year' || preset === 'all') {
    return false;
  }
  if (!range.from || !range.to) {
    return false;
  }
  const fromMs = Date.parse(`${range.from}T00:00:00Z`);
  const toMs = Date.parse(`${range.to}T00:00:00Z`);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    return false;
  }
  const days = Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24)) + 1;
  return days > 0 && days < 90;
}

export const DEFAULT_PURCHASE_SIZE_THRESHOLDS = [15, 50, 150, 500] as const;

export type PurchaseSizeThresholds = [number, number, number, number];

export type PurchaseSizeKey = 'micro' | 'small' | 'medium' | 'large' | 'major';

export interface PurchaseSizeBucket {
  key: PurchaseSizeKey;
  name: string;
  rangeLabel: string;
  minCents: number;
  maxCents: number | null;
  count: number;
  cents: number;
  countShare: number;
  centsShare: number;
}

/** Formats a cutoff dollar value cleanly (e.g. 15 -> "$15", 15.5 -> "$15.50", 1500 -> "$1,500"). */
export function formatThreshold(dollars: number): string {
  return `$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Validates that thresholds are four strictly increasing positive numbers. */
export function validateThresholds(thresholds: unknown): PurchaseSizeThresholds | null {
  if (!Array.isArray(thresholds) || thresholds.length !== 4) {
    return null;
  }
  const [t1, t2, t3, t4] = thresholds;
  if (
    typeof t1 !== 'number' ||
    typeof t2 !== 'number' ||
    typeof t3 !== 'number' ||
    typeof t4 !== 'number' ||
    !Number.isFinite(t1) ||
    !Number.isFinite(t2) ||
    !Number.isFinite(t3) ||
    !Number.isFinite(t4)
  ) {
    return null;
  }
  if (t1 <= 0 || t2 <= t1 || t3 <= t2 || t4 <= t3) {
    return null;
  }
  return [t1, t2, t3, t4];
}

/**
 * Groups purchases (transactions where amountCents > 0) into 5 size brackets:
 * Micro (<T1), Small (T1–T2), Medium (T2–T3), Large (T3–T4), Major (>T4).
 */
export function byPurchaseSize(
  transactions: Transaction[],
  thresholds: PurchaseSizeThresholds = [
    DEFAULT_PURCHASE_SIZE_THRESHOLDS[0],
    DEFAULT_PURCHASE_SIZE_THRESHOLDS[1],
    DEFAULT_PURCHASE_SIZE_THRESHOLDS[2],
    DEFAULT_PURCHASE_SIZE_THRESHOLDS[3],
  ],
): PurchaseSizeBucket[] {
  const valid = validateThresholds(thresholds) ?? [
    DEFAULT_PURCHASE_SIZE_THRESHOLDS[0],
    DEFAULT_PURCHASE_SIZE_THRESHOLDS[1],
    DEFAULT_PURCHASE_SIZE_THRESHOLDS[2],
    DEFAULT_PURCHASE_SIZE_THRESHOLDS[3],
  ];

  const c1 = Math.round(valid[0] * 100);
  const c2 = Math.round(valid[1] * 100);
  const c3 = Math.round(valid[2] * 100);
  const c4 = Math.round(valid[3] * 100);

  const buckets: PurchaseSizeBucket[] = [
    {
      key: 'micro',
      name: 'Micro',
      rangeLabel: `<${formatThreshold(valid[0])}`,
      minCents: 0,
      maxCents: c1,
      count: 0,
      cents: 0,
      countShare: 0,
      centsShare: 0,
    },
    {
      key: 'small',
      name: 'Small',
      rangeLabel: `${formatThreshold(valid[0])}–${formatThreshold(valid[1])}`,
      minCents: c1,
      maxCents: c2,
      count: 0,
      cents: 0,
      countShare: 0,
      centsShare: 0,
    },
    {
      key: 'medium',
      name: 'Medium',
      rangeLabel: `${formatThreshold(valid[1])}–${formatThreshold(valid[2])}`,
      minCents: c2,
      maxCents: c3,
      count: 0,
      cents: 0,
      countShare: 0,
      centsShare: 0,
    },
    {
      key: 'large',
      name: 'Large',
      rangeLabel: `${formatThreshold(valid[2])}–${formatThreshold(valid[3])}`,
      minCents: c3,
      maxCents: c4,
      count: 0,
      cents: 0,
      countShare: 0,
      centsShare: 0,
    },
    {
      key: 'major',
      name: 'Major',
      rangeLabel: `>${formatThreshold(valid[3])}`,
      minCents: c4,
      maxCents: null,
      count: 0,
      cents: 0,
      countShare: 0,
      centsShare: 0,
    },
  ];

  let totalPurchasesCount = 0;
  let totalPurchasesCents = 0;

  for (const transaction of transactions) {
    if (transaction.amountCents <= 0) {
      continue;
    }

    totalPurchasesCount += 1;
    totalPurchasesCents += transaction.amountCents;

    let target = buckets[4];
    if (transaction.amountCents < c1) {
      target = buckets[0];
    } else if (transaction.amountCents < c2) {
      target = buckets[1];
    } else if (transaction.amountCents < c3) {
      target = buckets[2];
    } else if (transaction.amountCents < c4) {
      target = buckets[3];
    }

    if (target) {
      target.count += 1;
      target.cents += transaction.amountCents;
    }
  }

  if (totalPurchasesCount > 0) {
    for (const bucket of buckets) {
      bucket.countShare = bucket.count / totalPurchasesCount;
    }
  }

  if (totalPurchasesCents > 0) {
    for (const bucket of buckets) {
      bucket.centsShare = bucket.cents / totalPurchasesCents;
    }
  }

  return buckets;
}
