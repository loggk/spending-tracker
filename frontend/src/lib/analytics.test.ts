import type { Category, Transaction } from '@spending-tracker/shared';
import { describe, expect, it } from 'vitest';
import {
  byCategory,
  byDay,
  byDayAndCategory,
  byMonth,
  byMonthAndCategory,
  dayLabel,
  isDayGranularity,
  resolveRange,
  totalCents,
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
