import type { Category, CreateTransactionRequest, Transaction } from '@spending-tracker/shared';
import { parseAmountToCents } from './format';

const COLUMN_ALIASES = {
  date: ['date', 'transaction date', 'day', 'posted'],
  amount: ['amount', 'cost', 'price', 'value', 'total', 'debit'],
  description: ['description', 'memo', 'note', 'notes', 'details', 'item', 'merchant'],
  category: ['category', 'type', 'tag', 'group'],
} as const;

export type ColumnKey = keyof typeof COLUMN_ALIASES;

export type ColumnMap = Partial<Record<ColumnKey, string>>;

/**
 * Maps a spreadsheet's headers onto the fields we need.
 */
export function detectColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {};

  for (const [key, aliases] of Object.entries(COLUMN_ALIASES) as [ColumnKey, readonly string[]][]) {
    const match = headers.find((header) => aliases.includes(header.trim().toLowerCase()));
    if (match !== undefined) {
      map[key] = match;
    }
  }

  return map;
}

export const MISSING_COLUMNS = (map: ColumnMap): ColumnKey[] =>
  (Object.keys(COLUMN_ALIASES) as ColumnKey[]).filter((key) => map[key] === undefined);

/**
 * Parses the date formats spreadsheets export: ISO, and US month-first with
 * either slashes or dashes. Returns an ISO date, or null if it is not a real one.
 */
export function parseDate(input: string): string | null {
  const trimmed = input.trim();

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);

  let year: number;
  let month: number;
  let day: number;

  if (iso) {
    [, year, month, day] = iso.map(Number) as [number, number, number, number];
  } else if (us) {
    const [, first, second, last] = us.map(Number) as [number, number, number, number];
    month = first;
    day = second;
    year = last;
  } else {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  const formatted = date.toISOString().slice(0, 10);

  // Round-tripping catches impossible dates such as 02/30/2026.
  return formatted === `${pad4(year)}-${pad2(month)}-${pad2(day)}` ? formatted : null;
}

const pad2 = (value: number): string => String(value).padStart(2, '0');
const pad4 = (value: number): string => String(value).padStart(4, '0');

export interface ParsedRow {
  /** 1-based row number in the source file, header excluded. */
  line: number;
  date: string;
  amountCents: number;
  description: string;
  categoryName: string;
}

export interface RejectedRow {
  line: number;
  reason: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  rejected: RejectedRow[];
  categoryNames: string[];
}

/** Validates raw CSV records, keeping good rows and explaining the rest. */
export function parseRows(records: Record<string, string>[], columns: ColumnMap): ParseResult {
  const rows: ParsedRow[] = [];
  const rejected: RejectedRow[] = [];
  const categoryNames: string[] = [];
  const seen = new Set<string>();

  records.forEach((record, index) => {
    const line = index + 1;
    const read = (key: ColumnKey): string => {
      const column = columns[key];
      return column === undefined ? '' : (record[column] ?? '').trim();
    };

    if (Object.values(record).every((value) => (value ?? '').trim() === '')) {
      return;
    }

    const date = parseDate(read('date'));
    if (date === null) {
      rejected.push({ line, reason: `Could not read the date "${read('date')}"` });
      return;
    }

    const amountCents = parseAmountToCents(read('amount'));
    if (amountCents === null) {
      rejected.push({ line, reason: `Could not read the amount "${read('amount')}"` });
      return;
    }

    const description = read('description');
    if (description === '') {
      rejected.push({ line, reason: 'Description is empty' });
      return;
    }

    const categoryName = read('category');
    if (categoryName === '') {
      rejected.push({ line, reason: 'Category is empty' });
      return;
    }

    const key = categoryName.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      categoryNames.push(categoryName);
    }

    rows.push({ line, date, amountCents, description: description.slice(0, 200), categoryName });
  });

  return { rows, rejected, categoryNames };
}

/** Resolves each row's category name to an id, matching case-insensitively. */
export function toRequests(rows: ParsedRow[], categories: Category[]): CreateTransactionRequest[] {
  const byName = new Map(categories.map((category) => [category.name.toLowerCase(), category.id]));

  return rows.flatMap((row) => {
    const categoryId = byName.get(row.categoryName.toLowerCase());
    return categoryId === undefined
      ? []
      : [
          {
            date: row.date,
            amountCents: row.amountCents,
            description: row.description,
            categoryId,
          },
        ];
  });
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const escapeCell = (value: string): string =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/**
 * Serialises transactions in the same shape as the spreadsheet this replaces,
 * so an exported file can be re-imported or opened in Excel unchanged.
 */
export function toCsv(transactions: Transaction[], categories: Category[]): string {
  const byId = new Map(categories.map((category) => [category.id, category.name]));
  const header = ['Month', 'Date', 'Amount', 'Description', 'Category'];

  const lines = transactions.map((transaction) => {
    const month = MONTH_NAMES[Number(transaction.date.slice(5, 7)) - 1] ?? '';
    return [
      month,
      transaction.date,
      (transaction.amountCents / 100).toFixed(2),
      transaction.description,
      byId.get(transaction.categoryId) ?? 'Uncategorized',
    ]
      .map(escapeCell)
      .join(',');
  });

  return [header.join(','), ...lines].join('\n');
}
