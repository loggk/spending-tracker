import type { Category, Transaction } from '@spending-tracker/shared';
import { describe, expect, it } from 'vitest';
import { MISSING_COLUMNS, detectColumns, parseDate, parseRows, toCsv, toRequests } from './csv';
import { parseAmountToCents } from './format';

const categories: Category[] = [
  { id: 'food', name: 'Food', color: '#2a78d6', createdAt: '' },
  { id: 'fun', name: 'Entertainment', color: '#eb6834', createdAt: '' },
];

describe('detectColumns', () => {
  it('matches the spreadsheet this app replaces', () => {
    const map = detectColumns(['Month', 'Date', 'Amount', 'Description', 'Category']);

    expect(map).toEqual({
      date: 'Date',
      amount: 'Amount',
      description: 'Description',
      category: 'Category',
    });
    expect(MISSING_COLUMNS(map)).toEqual([]);
  });

  it('ignores case and surrounding spaces', () => {
    expect(detectColumns([' DATE ', 'amount', 'Memo', 'TYPE'])).toEqual({
      date: ' DATE ',
      amount: 'amount',
      description: 'Memo',
      category: 'TYPE',
    });
  });

  it('reports the columns it could not find', () => {
    expect(MISSING_COLUMNS(detectColumns(['Date', 'Amount']))).toEqual(['description', 'category']);
  });
});

describe('parseDate', () => {
  it.each([
    ['2026-01-15', '2026-01-15'],
    ['2026-1-5', '2026-01-05'],
    ['01/15/2026', '2026-01-15'],
    ['1/5/2026', '2026-01-05'],
    ['12-31-2026', '2026-12-31'],
  ])('parses %s', (input, expected) => {
    expect(parseDate(input)).toBe(expected);
  });

  it('reads slash dates as month first', () => {
    expect(parseDate('03/04/2026')).toBe('2026-03-04');
  });

  it.each([
    ['an impossible day', '02/30/2026'],
    ['a two-digit year', '01/15/26'],
    ['free text', 'January 15'],
    ['an empty value', ''],
    ['a month over 12', '13/01/2026'],
  ])('rejects %s', (_label, input) => {
    expect(parseDate(input)).toBeNull();
  });
});

describe('parseAmountToCents', () => {
  it.each([
    ['12.99', 1299],
    ['$12.99', 1299],
    ['$1,299.00', 129900],
    ['-5.00', -500],
    ['(12.99)', -1299],
    [' 7 ', 700],
  ])('parses %s', (input, expected) => {
    expect(parseAmountToCents(input)).toBe(expected);
  });

  it.each([
    ['', ''],
    ['free text', 'abc'],
    ['zero', '0.00'],
    ['too many decimals', '1.234'],
  ])('rejects %s', (_label, input) => {
    expect(parseAmountToCents(input)).toBeNull();
  });
});

describe('parseRows', () => {
  const columns = {
    date: 'Date',
    amount: 'Amount',
    description: 'Description',
    category: 'Category',
  };

  const record = (over: Partial<Record<string, string>> = {}) => ({
    Month: 'January',
    Date: '01/15/2026',
    Amount: '$12.99',
    Description: 'Coffee',
    Category: 'Food',
    ...over,
  });

  it('accepts a well-formed row', () => {
    const result = parseRows([record()], columns);

    expect(result.rows).toEqual([
      {
        line: 1,
        date: '2026-01-15',
        amountCents: 1299,
        description: 'Coffee',
        categoryName: 'Food',
      },
    ]);
    expect(result.rejected).toEqual([]);
  });

  it('skips blank lines without reporting them', () => {
    const blank = { Month: '', Date: '', Amount: '', Description: '', Category: '' };
    const result = parseRows([record(), blank], columns);

    expect(result.rows).toHaveLength(1);
    expect(result.rejected).toEqual([]);
  });

  it.each([
    ['a bad date', { Date: 'nope' }],
    ['a bad amount', { Amount: 'free' }],
    ['an empty description', { Description: '  ' }],
    ['an empty category', { Category: '' }],
  ])('rejects %s with the source line number', (_label, over) => {
    const result = parseRows([record(), record(over)], columns);

    expect(result.rows).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.line).toBe(2);
  });

  it('collects distinct category names case-insensitively', () => {
    const result = parseRows(
      [record({ Category: 'Food' }), record({ Category: 'food' }), record({ Category: 'Fun' })],
      columns,
    );

    expect(result.categoryNames).toEqual(['Food', 'Fun']);
  });

  it('truncates an over-long description to the field limit', () => {
    const result = parseRows([record({ Description: 'x'.repeat(300) })], columns);

    expect(result.rows[0]?.description).toHaveLength(200);
  });
});

describe('toRequests', () => {
  it('resolves category names to ids, ignoring case', () => {
    const rows = parseRows(
      [
        {
          Date: '2026-01-15',
          Amount: '10',
          Description: 'a',
          Category: 'food',
        },
      ],
      { date: 'Date', amount: 'Amount', description: 'Description', category: 'Category' },
    ).rows;

    expect(toRequests(rows, categories)).toEqual([
      { date: '2026-01-15', amountCents: 1000, description: 'a', categoryId: 'food' },
    ]);
  });

  it('drops rows whose category does not exist', () => {
    const rows = [
      { line: 1, date: '2026-01-15', amountCents: 100, description: 'a', categoryName: 'Ghost' },
    ];

    expect(toRequests(rows, categories)).toEqual([]);
  });
});

describe('toCsv', () => {
  const transaction = (over: Partial<Transaction> = {}): Transaction => ({
    id: '2026-01-15_x',
    date: '2026-01-15',
    amountCents: 1299,
    description: 'Coffee',
    categoryId: 'food',
    createdAt: '',
    ...over,
  });

  it('writes the same columns as the source spreadsheet', () => {
    const [header, row] = toCsv([transaction()], categories).split('\n');

    expect(header).toBe('Month,Date,Amount,Description,Category');
    expect(row).toBe('January,2026-01-15,12.99,Coffee,Food');
  });

  it('quotes values containing commas or quotes', () => {
    const csv = toCsv([transaction({ description: 'Coffee, large' })], categories);
    expect(csv).toContain('"Coffee, large"');

    const quoted = toCsv([transaction({ description: 'The "usual"' })], categories);
    expect(quoted).toContain('"The ""usual"""');
  });

  it('labels transactions whose category was deleted', () => {
    expect(toCsv([transaction({ categoryId: 'gone' })], categories)).toContain('Uncategorized');
  });

  it('round-trips back through the parser', () => {
    const csv = toCsv([transaction(), transaction({ amountCents: -500 })], categories);
    const [headerLine, ...dataLines] = csv.split('\n');
    const headers = (headerLine ?? '').split(',');
    const records = dataLines.map((line) =>
      Object.fromEntries(line.split(',').map((cell, index) => [headers[index] ?? '', cell])),
    );

    const result = parseRows(records, detectColumns(headers));

    expect(result.rejected).toEqual([]);
    expect(result.rows.map((row) => row.amountCents)).toEqual([1299, -500]);
  });

  it('emits only a header for no transactions', () => {
    expect(toCsv([], categories)).toBe('Month,Date,Amount,Description,Category');
  });
});
