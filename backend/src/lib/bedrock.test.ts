import { describe, expect, it } from 'vitest';
import { ReceiptParseError, normalise } from './bedrock';

const categoryIds = new Set(['food', 'fun']);

const item = (over: Record<string, unknown> = {}) => ({
  description: 'Strawberries',
  amountCents: 499,
  suggestedCategoryId: 'food',
  ...over,
});

describe('normalise', () => {
  it('keeps well-formed line items', () => {
    const result = normalise(
      { merchant: 'Target', date: '2026-02-10', items: [item()] },
      categoryIds,
    );

    expect(result).toEqual({
      merchant: 'Target',
      date: '2026-02-10',
      items: [{ description: 'Strawberries', amountCents: 499, suggestedCategoryId: 'food' }],
    });
  });

  it('rejects a category the model invented', () => {
    const result = normalise(
      { merchant: null, date: null, items: [item({ suggestedCategoryId: 'imaginary' })] },
      categoryIds,
    );

    expect(result.items[0]?.suggestedCategoryId).toBeNull();
  });

  it('rounds a fractional amount to whole cents', () => {
    const result = normalise({ items: [item({ amountCents: 499.6 })] }, categoryIds);

    expect(result.items[0]?.amountCents).toBe(500);
  });

  it.each([
    ['an empty description', { description: '  ' }],
    ['a zero amount', { amountCents: 0 }],
    ['a non-numeric amount', { amountCents: 'free' }],
  ])('drops an item with %s', (_label, over) => {
    const result = normalise({ items: [item(), item(over)] }, categoryIds);

    expect(result.items).toHaveLength(1);
  });

  it('ignores a malformed date rather than storing it', () => {
    expect(normalise({ date: '10/02/2026', items: [item()] }, categoryIds).date).toBeNull();
  });

  it('treats a blank merchant as unknown', () => {
    expect(normalise({ merchant: '   ', items: [item()] }, categoryIds).merchant).toBeNull();
  });

  it('truncates an over-long description', () => {
    const result = normalise({ items: [item({ description: 'x'.repeat(300) })] }, categoryIds);

    expect(result.items[0]?.description).toHaveLength(200);
  });

  it.each([
    ['no items at all', { items: [] }],
    ['items missing entirely', {}],
    ['only unusable items', { items: [item({ amountCents: 0 })] }],
  ])('throws when there is nothing usable: %s', (_label, input) => {
    expect(() => normalise(input, categoryIds)).toThrow(ReceiptParseError);
  });
});
