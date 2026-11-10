import type { Category, Transaction } from '@spending-tracker/shared';
import { describe, expect, it } from 'vitest';
import {
  byCategory,
  byDay,
  byDayAndCategory,
  byDayOfWeek,
  byHeatmap,
  byMonth,
  byMonthAndCategory,
  byPurchaseSize,
  dayLabel,
  formatThreshold,
  isDayGranularity,
  largestPurchase,
  resolveRange,
  totalCents,
  validateThresholds,
} from './analytics';

const transaction = (date: string, amountCents: number, categoryId = 'food'): Transaction => ({
  id: `${date}_x`,
  date,
  amountCents,
  description: 'x',
  categoryId,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const categories: Category[] = [
  { id: 'food', name: 'Food', color: '#2a78d6', createdAt: '' },
  { id: 'fun', name: 'Fun', color: '#eb6834', createdAt: '' },
];

describe('resolveRange', () => {
  const today = new Date('2026-08-03T12:00:00Z');

  it('starts this month on the first', () => {
    expect(resolveRange('month', today)).toEqual({ from: '2026-08-01', to: '2026-08-03' });
  });

  it('starts this year on January 1', () => {
    expect(resolveRange('year', today)).toEqual({ from: '2026-01-01', to: '2026-08-03' });
  });

  it('leaves all time unbounded', () => {
    expect(resolveRange('all', today)).toEqual({});
  });
});

describe('totalCents', () => {
  it('sums amounts', () => {
    expect(totalCents([transaction('2026-01-01', 100), transaction('2026-01-02', 250)])).toBe(350);
  });

  it('is zero for no transactions', () => {
    expect(totalCents([])).toBe(0);
  });
});

describe('byCategory', () => {
  it('totals per category, largest first', () => {
    const result = byCategory(
      [
        transaction('2026-01-01', 100, 'food'),
        transaction('2026-01-02', 500, 'fun'),
        transaction('2026-01-03', 200, 'food'),
      ],
      categories,
    );

    expect(result.map((entry) => [entry.name, entry.cents])).toEqual([
      ['Fun', 500],
      ['Food', 300],
    ]);
  });

  it('computes each share of the total', () => {
    const result = byCategory(
      [transaction('2026-01-01', 750, 'food'), transaction('2026-01-02', 250, 'fun')],
      categories,
    );

    expect(result[0]?.share).toBeCloseTo(0.75);
    expect(result[1]?.share).toBeCloseTo(0.25);
  });

  it('groups transactions whose category was deleted', () => {
    const result = byCategory([transaction('2026-01-01', 100, 'deleted')], categories);

    expect(result).toEqual([expect.objectContaining({ name: 'Uncategorized', cents: 100 })]);
  });

  it('does not divide by zero when amounts cancel out', () => {
    const result = byCategory(
      [transaction('2026-01-01', 100, 'food'), transaction('2026-01-02', -100, 'fun')],
      categories,
    );

    expect(result.every((entry) => Number.isFinite(entry.share))).toBe(true);
  });

  it('returns nothing for no transactions', () => {
    expect(byCategory([], categories)).toEqual([]);
  });
});

describe('byMonth', () => {
  it('totals per month, oldest first', () => {
    const result = byMonth([
      transaction('2026-03-15', 300),
      transaction('2026-01-10', 100),
      transaction('2026-01-20', 50),
    ]);

    expect(result.map((entry) => [entry.month, entry.cents])).toEqual([
      ['2026-01', 150],
      ['2026-02', 0],
      ['2026-03', 300],
    ]);
  });

  it('fills empty months so gaps stay visible', () => {
    const result = byMonth([transaction('2026-01-01', 100), transaction('2026-05-01', 100)]);

    expect(result).toHaveLength(5);
    expect(result.filter((entry) => entry.cents === 0)).toHaveLength(3);
  });

  it('spans a year boundary', () => {
    const result = byMonth([transaction('2025-11-01', 100), transaction('2026-02-01', 100)]);

    expect(result.map((entry) => entry.month)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('returns nothing for no transactions', () => {
    expect(byMonth([])).toEqual([]);
  });

  it('widens the spine to a range that reaches past the data', () => {
    const result = byMonth([transaction('2026-03-15', 300)], {
      from: '2026-01-01',
      to: '2026-05-31',
    });

    expect(result.map((entry) => [entry.month, entry.cents])).toEqual([
      ['2026-01', 0],
      ['2026-02', 0],
      ['2026-03', 300],
      ['2026-04', 0],
      ['2026-05', 0],
    ]);
  });

  it('ignores range bounds inside the data', () => {
    const result = byMonth([transaction('2026-01-01', 100), transaction('2026-03-01', 100)], {
      from: '2026-02-01',
      to: '2026-02-28',
    });

    expect(result.map((entry) => entry.month)).toEqual(['2026-01', '2026-02', '2026-03']);
  });
});

describe('byMonthAndCategory', () => {
  it('breaks each month down by category', () => {
    const { months } = byMonthAndCategory(
      [
        transaction('2026-01-05', 100, 'food'),
        transaction('2026-01-20', 200, 'fun'),
        transaction('2026-02-01', 50, 'food'),
      ],
      categories,
    );

    expect(months.map((entry) => entry.totals)).toEqual([{ food: 100, fun: 200 }, { food: 50 }]);
  });

  it('orders series by overall spend so stacks paint alike', () => {
    const { series } = byMonthAndCategory(
      [transaction('2026-01-05', 100, 'food'), transaction('2026-02-01', 500, 'fun')],
      categories,
    );

    expect(series.map((entry) => entry.name)).toEqual(['Fun', 'Food']);
  });

  it('keeps empty months and buckets deleted categories', () => {
    const { months, series } = byMonthAndCategory(
      [transaction('2026-01-01', 100, 'gone'), transaction('2026-03-01', 200, 'food')],
      categories,
    );

    expect(months.map((entry) => entry.totals)).toEqual([{ '': 100 }, {}, { food: 200 }]);
    expect(series.map((entry) => entry.name)).toEqual(['Food', 'Uncategorized']);
  });
});

describe('isDayGranularity', () => {
  it('chooses daily view for month preset', () => {
    expect(isDayGranularity({ from: '2026-08-01', to: '2026-08-15' }, 'month')).toBe(true);
  });

  it('chooses monthly view for year and all presets', () => {
    expect(isDayGranularity({ from: '2026-01-01', to: '2026-08-15' }, 'year')).toBe(false);
    expect(isDayGranularity({}, 'all')).toBe(false);
  });

  it('chooses daily view for custom range under 90 days', () => {
    expect(isDayGranularity({ from: '2026-06-01', to: '2026-06-30' })).toBe(true);
    expect(isDayGranularity({ from: '2026-06-01', to: '2026-08-28' })).toBe(true);
  });

  it('chooses monthly view for custom range of 90 days or more', () => {
    expect(isDayGranularity({ from: '2026-06-01', to: '2026-08-30' })).toBe(false);
    expect(isDayGranularity({ from: '2026-01-01', to: '2026-06-01' })).toBe(false);
  });

  it('returns false for incomplete ranges', () => {
    expect(isDayGranularity({ from: '2026-06-01' })).toBe(false);
    expect(isDayGranularity({ to: '2026-06-01' })).toBe(false);
    expect(isDayGranularity({})).toBe(false);
  });
});

describe('dayLabel', () => {
  it('formats dates into short readable strings', () => {
    expect(dayLabel('2026-08-03')).toBe('Aug 3');
    expect(dayLabel('2026-12-25')).toBe('Dec 25');
  });

  it('falls back to raw string for invalid dates', () => {
    expect(dayLabel('invalid')).toBe('invalid');
  });
});

describe('byDay', () => {
  it('totals per day, oldest first', () => {
    const result = byDay([
      transaction('2026-08-03', 300),
      transaction('2026-08-01', 100),
      transaction('2026-08-01', 50),
    ]);

    expect(result.map((entry) => [entry.date, entry.cents])).toEqual([
      ['2026-08-01', 150],
      ['2026-08-02', 0],
      ['2026-08-03', 300],
    ]);
  });

  it('fills empty days so gaps stay visible', () => {
    const result = byDay([transaction('2026-08-01', 100), transaction('2026-08-05', 100)]);

    expect(result).toHaveLength(5);
    expect(result.filter((entry) => entry.cents === 0)).toHaveLength(3);
  });

  it('spans a month boundary', () => {
    const result = byDay([transaction('2026-07-30', 100), transaction('2026-08-02', 200)]);

    expect(result.map((entry) => entry.date)).toEqual([
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ]);
  });

  it('returns nothing for no transactions', () => {
    expect(byDay([])).toEqual([]);
  });

  it('widens the spine to a range that reaches past the data', () => {
    const result = byDay([transaction('2026-08-03', 300)], {
      from: '2026-08-01',
      to: '2026-08-05',
    });

    expect(result.map((entry) => [entry.date, entry.cents])).toEqual([
      ['2026-08-01', 0],
      ['2026-08-02', 0],
      ['2026-08-03', 300],
      ['2026-08-04', 0],
      ['2026-08-05', 0],
    ]);
  });

  it('ignores range bounds inside the data', () => {
    const result = byDay([transaction('2026-08-01', 100), transaction('2026-08-05', 100)], {
      from: '2026-08-02',
      to: '2026-08-04',
    });

    expect(result.map((entry) => entry.date)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
    ]);
  });
});

describe('byDayAndCategory', () => {
  it('breaks each day down by category', () => {
    const { days } = byDayAndCategory(
      [
        transaction('2026-08-01', 100, 'food'),
        transaction('2026-08-01', 200, 'fun'),
        transaction('2026-08-02', 50, 'food'),
      ],
      categories,
    );

    expect(days.map((entry) => entry.totals)).toEqual([{ food: 100, fun: 200 }, { food: 50 }]);
  });

  it('orders series by overall spend so stacks paint alike', () => {
    const { series } = byDayAndCategory(
      [transaction('2026-08-01', 100, 'food'), transaction('2026-08-02', 500, 'fun')],
      categories,
    );

    expect(series.map((entry) => entry.name)).toEqual(['Fun', 'Food']);
  });

  it('keeps empty days and buckets deleted categories', () => {
    const { days, series } = byDayAndCategory(
      [transaction('2026-08-01', 100, 'gone'), transaction('2026-08-03', 200, 'food')],
      categories,
    );

    expect(days.map((entry) => entry.totals)).toEqual([{ '': 100 }, {}, { food: 200 }]);
    expect(series.map((entry) => entry.name)).toEqual(['Food', 'Uncategorized']);
  });
});

describe('formatThreshold', () => {
  it('formats whole dollar amounts without decimals', () => {
    expect(formatThreshold(15)).toBe('$15');
    expect(formatThreshold(500)).toBe('$500');
    expect(formatThreshold(1000)).toBe('$1,000');
  });

  it('formats fractional dollar amounts with two decimals', () => {
    expect(formatThreshold(15.5)).toBe('$15.50');
    expect(formatThreshold(12.99)).toBe('$12.99');
  });
});

describe('validateThresholds', () => {
  it('accepts strictly increasing positive numbers', () => {
    expect(validateThresholds([15, 50, 150, 500])).toEqual([15, 50, 150, 500]);
    expect(validateThresholds([10, 20, 30, 40])).toEqual([10, 20, 30, 40]);
  });

  it('rejects arrays with wrong length', () => {
    expect(validateThresholds([15, 50, 150])).toBeNull();
    expect(validateThresholds([15, 50, 150, 500, 1000])).toBeNull();
    expect(validateThresholds([])).toBeNull();
  });

  it('rejects non-increasing or duplicate cutoffs', () => {
    expect(validateThresholds([15, 50, 50, 500])).toBeNull();
    expect(validateThresholds([15, 50, 30, 500])).toBeNull();
    expect(validateThresholds([500, 150, 50, 15])).toBeNull();
  });

  it('rejects negative or zero cutoffs', () => {
    expect(validateThresholds([0, 50, 150, 500])).toBeNull();
    expect(validateThresholds([-10, 50, 150, 500])).toBeNull();
  });

  it('rejects non-numeric inputs', () => {
    expect(validateThresholds(['15', 50, 150, 500])).toBeNull();
    expect(validateThresholds(null)).toBeNull();
    expect(validateThresholds(undefined)).toBeNull();
  });
});

describe('byPurchaseSize', () => {
  it('returns all 5 buckets with zero counts for empty transactions', () => {
    const buckets = byPurchaseSize([]);
    expect(buckets).toHaveLength(5);
    expect(buckets.map((b) => b.name)).toEqual(['Micro', 'Small', 'Medium', 'Large', 'Major']);
    expect(buckets.map((b) => b.rangeLabel)).toEqual([
      '<$15',
      '$15–$50',
      '$50–$150',
      '$150–$500',
      '>$500',
    ]);
    expect(buckets.every((b) => b.count === 0 && b.cents === 0)).toBe(true);
  });

  it('classifies transactions across default size brackets', () => {
    const txs = [
      transaction('2026-08-01', 500), // $5 (Micro)
      transaction('2026-08-01', 1499), // $14.99 (Micro)
      transaction('2026-08-02', 1500), // $15 (Small)
      transaction('2026-08-02', 4999), // $49.99 (Small)
      transaction('2026-08-03', 5000), // $50 (Medium)
      transaction('2026-08-03', 14999), // $149.99 (Medium)
      transaction('2026-08-04', 15000), // $150 (Large)
      transaction('2026-08-04', 49999), // $499.99 (Large)
      transaction('2026-08-05', 50000), // $500 (Major)
      transaction('2026-08-05', 100000), // $1,000 (Major)
    ];

    const buckets = byPurchaseSize(txs);
    expect(buckets.map((b) => b.count)).toEqual([2, 2, 2, 2, 2]);
    expect(buckets.map((b) => b.countShare)).toEqual([0.2, 0.2, 0.2, 0.2, 0.2]);

    expect(buckets[0]?.cents).toBe(1999);
    expect(buckets[1]?.cents).toBe(6499);
    expect(buckets[2]?.cents).toBe(19999);
    expect(buckets[3]?.cents).toBe(64999);
    expect(buckets[4]?.cents).toBe(150000);
  });

  it('ignores refunds and zero amounts', () => {
    const txs = [
      transaction('2026-08-01', 1000), // $10 (Micro)
      transaction('2026-08-02', -500), // refund
      transaction('2026-08-03', 0), // zero
    ];

    const buckets = byPurchaseSize(txs);
    expect(buckets[0]?.count).toBe(1);
    expect(buckets[0]?.cents).toBe(1000);
    expect(buckets[0]?.countShare).toBe(1);
    expect(buckets[0]?.centsShare).toBe(1);
    expect(buckets.slice(1).every((b) => b.count === 0)).toBe(true);
  });

  it('supports custom threshold cutoffs', () => {
    const customThresholds: [number, number, number, number] = [20, 100, 300, 1000];
    const txs = [
      transaction('2026-08-01', 1800), // $18 (Micro <$20)
      transaction('2026-08-02', 5000), // $50 (Small $20–$100)
      transaction('2026-08-03', 25000), // $250 (Medium $100–$300)
      transaction('2026-08-04', 50000), // $500 (Large $300–$1,000)
      transaction('2026-08-05', 150000), // $1,500 (Major >$1,000)
    ];

    const buckets = byPurchaseSize(txs, customThresholds);
    expect(buckets.map((b) => b.rangeLabel)).toEqual([
      '<$20',
      '$20–$100',
      '$100–$300',
      '$300–$1,000',
      '>$1,000',
    ]);
    expect(buckets.map((b) => b.count)).toEqual([1, 1, 1, 1, 1]);
  });
});

describe('largestPurchase', () => {
  it('returns null for an empty transaction list', () => {
    expect(largestPurchase([])).toBeNull();
  });

  it('ignores refunds and zero-dollar transactions', () => {
    expect(
      largestPurchase([
        transaction('2026-08-01', -500),
        transaction('2026-08-02', 0),
        transaction('2026-08-03', -10000),
      ]),
    ).toBeNull();
  });

  it('identifies the largest single purchase', () => {
    const t1 = transaction('2026-08-01', 500);
    const t2 = transaction('2026-08-02', 45000);
    const t3 = transaction('2026-08-03', 1200);

    expect(largestPurchase([t1, t2, t3])).toBe(t2);
  });

  it('breaks ties in amount by choosing the most recent date', () => {
    const earlier = transaction('2026-08-01', 5000);
    const later = transaction('2026-08-05', 5000);

    expect(largestPurchase([earlier, later])).toBe(later);
  });
});

describe('byDayOfWeek', () => {
  it('returns all 7 days Monday to Sunday with zero counts for empty transactions', () => {
    const breakdown = byDayOfWeek([]);
    expect(breakdown.days).toHaveLength(7);
    expect(breakdown.days.map((d) => d.name)).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
    expect(breakdown.totalCents).toBe(0);
    expect(breakdown.weekdayCents).toBe(0);
    expect(breakdown.weekendCents).toBe(0);
    expect(breakdown.weekdayShare).toBe(0);
    expect(breakdown.weekendShare).toBe(0);
    expect(breakdown.peakDay).toBeNull();
  });

  it('aggregates spending by day of week and computes weekend vs weekday split (including Friday as weekend)', () => {
    // 2026-08-03 is Monday, 2026-08-07 is Friday, 2026-08-08 is Saturday, 2026-08-09 is Sunday
    const txs = [
      transaction('2026-08-03', 2500), // Monday: $25 (weekday)
      transaction('2026-08-07', 3500), // Friday: $35 (weekend)
      transaction('2026-08-08', 2500), // Saturday: $25 (weekend)
      transaction('2026-08-09', 1500), // Sunday: $15 (weekend)
    ];

    const breakdown = byDayOfWeek(txs, { from: '2026-08-03', to: '2026-08-09' });

    expect(breakdown.totalCents).toBe(10000); // $100
    expect(breakdown.weekdayCents).toBe(2500); // $25 (Monday)
    expect(breakdown.weekendCents).toBe(7500); // $75 (Friday + Saturday + Sunday)
    expect(breakdown.weekdayShare).toBeCloseTo(0.25);
    expect(breakdown.weekendShare).toBeCloseTo(0.75);

    expect(breakdown.peakDay?.name).toBe('Fri');
    expect(breakdown.peakDay?.fullName).toBe('Friday');
    expect(breakdown.peakDay?.cents).toBe(3500);

    // Monday
    expect(breakdown.days[0]?.cents).toBe(2500);
    expect(breakdown.days[0]?.count).toBe(1);
    expect(breakdown.days[0]?.isWeekend).toBe(false);

    // Friday
    expect(breakdown.days[4]?.cents).toBe(3500);
    expect(breakdown.days[4]?.isWeekend).toBe(true);

    // Saturday
    expect(breakdown.days[5]?.cents).toBe(2500);
    expect(breakdown.days[5]?.isWeekend).toBe(true);

    // Sunday
    expect(breakdown.days[6]?.cents).toBe(1500);
    expect(breakdown.days[6]?.isWeekend).toBe(true);
  });

  it('calculates average spend based on day occurrences in range', () => {
    // Range spanning two full weeks: Aug 3 (Mon) through Aug 16 (Sun)
    // 2 Mondays, 2 Saturdays, etc.
    const txs = [
      transaction('2026-08-08', 20000), // Saturday week 1 ($200)
      transaction('2026-08-15', 8400), // Saturday week 2 ($84)
    ];

    const breakdown = byDayOfWeek(txs, { from: '2026-08-03', to: '2026-08-16' });
    const sat = breakdown.days[5];

    expect(sat?.cents).toBe(28400); // $284 total
    expect(sat?.dayCount).toBe(2); // 2 Saturdays in the 14-day range
    expect(sat?.averageCents).toBe(14200); // $142 average!
    expect(breakdown.peakDay?.name).toBe('Sat');
    expect(breakdown.peakDay?.averageCents).toBe(14200);
  });

  it('ignores refunds and zero amounts', () => {
    const txs = [
      transaction('2026-08-08', 5000), // Saturday: $50
      transaction('2026-08-08', -2000), // refund
      transaction('2026-08-09', 0), // zero
    ];

    const breakdown = byDayOfWeek(txs);
    expect(breakdown.totalCents).toBe(5000);
    expect(breakdown.weekendCents).toBe(5000);
    expect(breakdown.weekdayCents).toBe(0);
    expect(breakdown.peakDay?.name).toBe('Sat');
  });
});

describe('byHeatmap', () => {
  it('builds calendar month grid with correct day offsets and tracks streaks', () => {
    // Aug 2026: Aug 1 is Saturday (offset = 5 for Mon-start)
    // Spending on Aug 1 ($100), Aug 5 ($50).
    // Today is Aug 9.
    const txs = [
      transaction('2026-08-01', 10000), // $100
      transaction('2026-08-05', 5000), // $50
    ];

    const result = byHeatmap(txs, { from: '2026-08-01', to: '2026-08-31' }, '2026-08-09');

    expect(result.months).toHaveLength(1);
    const aug = result.months[0];
    expect(aug?.month).toBe('2026-08');
    expect(aug?.firstDayOffset).toBe(5); // Saturday
    expect(aug?.days).toHaveLength(31);

    // Days 1 to 9 are active (non-future), days 10 to 31 are future
    expect(result.totalDays).toBe(9);
    // Non-spend days among 1..9: Aug 2, 3, 4, 6, 7, 8, 9 = 7 days
    expect(result.noSpendDays).toBe(7);
    expect(result.noSpendPercentage).toBe(78); // 7/9 = 78%

    // Streaks:
    // Aug 1: spend
    // Aug 2, 3, 4: no-spend (streak 3)
    // Aug 5: spend
    // Aug 6, 7, 8, 9: no-spend (streak 4)
    expect(result.recordStreak).toBe(4);
    expect(result.currentStreak).toBe(4); // Aug 6, 7, 8, 9

    // Check color levels: max spend is $100 (Aug 1) -> level 4. Aug 5 is $50 (50%) -> level 2.
    const day1 = aug?.days[0];
    const day2 = aug?.days[1];
    const day5 = aug?.days[4];
    const day10 = aug?.days[9];

    expect(day1?.cents).toBe(10000);
    expect(day1?.level).toBe(4);
    expect(day1?.isNoSpend).toBe(false);

    expect(day2?.cents).toBe(0);
    expect(day2?.level).toBe(0);
    expect(day2?.isNoSpend).toBe(true);

    expect(day5?.cents).toBe(5000);
    expect(day5?.level).toBe(2);

    expect(day10?.isFuture).toBe(true);
    expect(day10?.isNoSpend).toBe(false);
  });

  it('resets current streak to 0 if today has spending', () => {
    const txs = [
      transaction('2026-08-01', 0),
      transaction('2026-08-02', 0),
      transaction('2026-08-03', 2500), // Today
    ];

    const result = byHeatmap(txs, { from: '2026-08-01', to: '2026-08-03' }, '2026-08-03');

    expect(result.currentStreak).toBe(0);
    expect(result.recordStreak).toBe(2);
    expect(result.noSpendDays).toBe(2);
  });
});
