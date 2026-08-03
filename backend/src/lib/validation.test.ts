import { describe, expect, it } from 'vitest';
import {
  ValidationError,
  categoryInputSchema,
  parseBody,
  parseInput,
  transactionInputSchema,
} from './validation';

const validTransaction = {
  date: '2026-01-15',
  amountCents: 1299,
  description: 'Coffee',
  categoryId: 'cat-1',
};

describe('transactionInputSchema', () => {
  it('accepts a well-formed transaction', () => {
    expect(parseInput(transactionInputSchema, validTransaction)).toEqual(validTransaction);
  });

  it('accepts a negative amount as a refund', () => {
    const refund = { ...validTransaction, amountCents: -500 };

    expect(parseInput(transactionInputSchema, refund).amountCents).toBe(-500);
  });

  it('trims surrounding whitespace from text', () => {
    const padded = { ...validTransaction, description: '  Coffee  ' };

    expect(parseInput(transactionInputSchema, padded).description).toBe('Coffee');
  });

  it.each([
    ['a fractional amount', { amountCents: 12.5 }],
    ['a zero amount', { amountCents: 0 }],
    ['an empty description', { description: '   ' }],
    ['a missing category', { categoryId: '' }],
    ['a malformed date', { date: '15/01/2026' }],
    ['a date that does not exist', { date: '2026-02-30' }],
  ])('rejects %s', (_label, override) => {
    expect(() => parseInput(transactionInputSchema, { ...validTransaction, ...override })).toThrow(
      ValidationError,
    );
  });
});

describe('categoryInputSchema', () => {
  it('accepts a name and hex color', () => {
    expect(parseInput(categoryInputSchema, { name: 'Food', color: '#22c55e' })).toEqual({
      name: 'Food',
      color: '#22c55e',
    });
  });

  it.each([
    ['a non-hex color', { name: 'Food', color: 'green' }],
    ['a shorthand hex color', { name: 'Food', color: '#2c5' }],
    ['a blank name', { name: '  ', color: '#22c55e' }],
  ])('rejects %s', (_label, input) => {
    expect(() => parseInput(categoryInputSchema, input)).toThrow(ValidationError);
  });
});

describe('parseBody', () => {
  it('parses a JSON body', () => {
    expect(parseBody(transactionInputSchema, JSON.stringify(validTransaction))).toEqual(
      validTransaction,
    );
  });

  it.each([
    ['malformed JSON', '{ not json'],
    ['a missing body', undefined],
  ])('rejects %s', (_label, body) => {
    expect(() => parseBody(transactionInputSchema, body)).toThrow(ValidationError);
  });

  it('reports every problem at once', () => {
    try {
      parseBody(transactionInputSchema, JSON.stringify({ date: 'nope', amountCents: 1.5 }));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).details.length).toBeGreaterThan(1);
    }
  });
});
