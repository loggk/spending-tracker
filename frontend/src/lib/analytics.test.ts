import type { Category, Transaction } from '@spending-tracker/shared';
import { describe, expect, it } from 'vitest';
import { byCategory, byMonth, resolveRange, totalCents } from './analytics';

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

  it('covers three months including the current one', () => {
    expect(resolveRange('quarter', today)).toEqual({ from: '2026-06-01', to: '2026-08-03' });
  });

  it('starts year to date on January 1', () => {
    expect(resolveRange('ytd', today)).toEqual({ from: '2026-01-01', to: '2026-08-03' });
  });

  it('leaves all time unbounded', () => {
    expect(resolveRange('all', today)).toEqual({});
  });

  it('rolls back across a year boundary', () => {
    expect(resolveRange('quarter', new Date('2026-01-15T12:00:00Z')).from).toBe('2025-11-01');
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
});
