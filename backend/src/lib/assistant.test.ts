import { describe, expect, it, vi } from 'vitest';
import type { Category, Transaction } from '@spending-tracker/shared';
import {
  buildSystemPrompt,
  calculateSpendingSummary,
  compareSummaryPeriods,
  runAssistantChat,
  selectTopTransactions,
} from './assistant';

const mockCategories: Category[] = [
  { id: 'cat-groceries', name: 'Groceries', color: '#22c55e', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'cat-dining', name: 'Dining', color: '#3b82f6', createdAt: '2026-01-01T00:00:00Z' },
];

const catMap = new Map(mockCategories.map((c) => [c.id, c]));

const mockTransactions: Transaction[] = [
  {
    id: '2026-11-01_1',
    date: '2026-11-01',
    amountCents: 4500,
    description: 'Whole Foods Market',
    categoryId: 'cat-groceries',
    createdAt: '2026-11-01T12:00:00Z',
  },
  {
    id: '2026-11-03_2',
    date: '2026-11-03',
    amountCents: 2500,
    description: 'Starbucks Coffee',
    categoryId: 'cat-dining',
    createdAt: '2026-11-03T12:00:00Z',
  },
  {
    id: '2026-11-07_3',
    date: '2026-11-07',
    amountCents: 12000,
    description: 'Costco Wholesale',
    categoryId: 'cat-groceries',
    createdAt: '2026-11-07T12:00:00Z',
  },
];

describe('calculateSpendingSummary', () => {
  it('calculates total cents, count, and average with no filters', () => {
    const summary = calculateSpendingSummary(mockTransactions, catMap, {});
    expect(summary.totalCents).toBe(19000);
    expect(summary.transactionCount).toBe(3);
    expect(summary.averageCents).toBe(Math.round(19000 / 3));
    expect(summary.categoryBreakdown).toHaveLength(2);
  });

  it('filters by categoryId', () => {
    const summary = calculateSpendingSummary(mockTransactions, catMap, {
      categoryId: 'cat-dining',
    });
    expect(summary.totalCents).toBe(2500);
    expect(summary.transactionCount).toBe(1);
    expect(summary.categoryBreakdown).toEqual([
      { categoryId: 'cat-dining', categoryName: 'Dining', totalCents: 2500, count: 1 },
    ]);
  });

  it('filters by date range', () => {
    const summary = calculateSpendingSummary(mockTransactions, catMap, {
      fromDate: '2026-11-02',
      toDate: '2026-11-05',
    });
    expect(summary.totalCents).toBe(2500);
    expect(summary.transactionCount).toBe(1);
    expect(summary.sampleTransactions[0]?.description).toBe('Starbucks Coffee');
  });

  it('filters by search term case-insensitively', () => {
    const summary = calculateSpendingSummary(mockTransactions, catMap, {
      searchTerm: 'foods',
    });
    expect(summary.totalCents).toBe(4500);
    expect(summary.transactionCount).toBe(1);
    expect(summary.sampleTransactions[0]?.description).toBe('Whole Foods Market');
  });

  it('handles empty matches safely', () => {
    const summary = calculateSpendingSummary([], catMap, {});
    expect(summary.totalCents).toBe(0);
    expect(summary.transactionCount).toBe(0);
    expect(summary.averageCents).toBe(0);
    expect(summary.categoryBreakdown).toEqual([]);
    expect(summary.sampleTransactions).toEqual([]);
  });
});

describe('selectTopTransactions', () => {
  it('sorts highest first', () => {
    const top = selectTopTransactions(mockTransactions, catMap, {
      order: 'highest',
      limit: 2,
    });
    expect(top).toHaveLength(2);
    expect(top[0]?.amountCents).toBe(12000);
    expect(top[1]?.amountCents).toBe(4500);
  });

  it('sorts lowest first', () => {
    const bottom = selectTopTransactions(mockTransactions, catMap, {
      order: 'lowest',
      limit: 1,
    });
    expect(bottom).toHaveLength(1);
    expect(bottom[0]?.amountCents).toBe(2500);
    expect(bottom[0]?.description).toBe('Starbucks Coffee');
  });
});

describe('compareSummaryPeriods', () => {
  it('computes delta and percent increase', () => {
    const sumA = calculateSpendingSummary([mockTransactions[2]!], catMap, {}); // 12000
    const sumB = calculateSpendingSummary([mockTransactions[0]!], catMap, {}); // 4500

    const comp = compareSummaryPeriods(sumA, sumB, 'Nov 7', 'Nov 1');
    expect(comp.deltaCents).toBe(7500);
    expect(comp.percentChange).toBe(Math.round(((12000 - 4500) / 4500) * 100));
  });

  it('returns null percentage when prior period is 0', () => {
    const sumA = calculateSpendingSummary([mockTransactions[0]!], catMap, {});
    const sumB = calculateSpendingSummary([], catMap, {});

    const comp = compareSummaryPeriods(sumA, sumB);
    expect(comp.deltaCents).toBe(4500);
    expect(comp.percentChange).toBeNull();
  });
});

describe('buildSystemPrompt', () => {
  it('contains date, guardrails, and category ids', () => {
    const prompt = buildSystemPrompt('2026-11-10', 'Tuesday', mockCategories);
    expect(prompt).toContain('2026-11-10');
    expect(prompt).toContain('Tuesday');
    expect(prompt).toContain('CRITICAL MATHEMATICAL GUARDRAIL');
    expect(prompt).toContain('cat-groceries');
    expect(prompt).toContain('Groceries');
  });
});

describe('runAssistantChat', () => {
  it('handles single-turn chat with no tools invoked', async () => {
    const mockSend = vi.fn().mockResolvedValue({
      stopReason: 'end_turn',
      output: {
        message: {
          role: 'assistant',
          content: [{ text: 'Hello! I am your private financial assistant.' }],
        },
      },
    });

    const response = await runAssistantChat('user-1', [{ role: 'user', content: 'Hello' }], {
      bedrockClient: { send: mockSend },
      listCategoriesFn: vi.fn().mockResolvedValue(mockCategories),
      listTransactionsFn: vi.fn().mockResolvedValue(mockTransactions),
      now: () => new Date('2026-11-10T12:00:00Z'),
    });

    expect(response.reply).toBe('Hello! I am your private financial assistant.');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('executes query_spending_summary tool and feeds result back to model', async () => {
    const mockSend = vi
      .fn()
      // First turn: model requests tool use
      .mockResolvedValueOnce({
        stopReason: 'tool_use',
        output: {
          message: {
            role: 'assistant',
            content: [
              {
                toolUse: {
                  toolUseId: 'call_123',
                  name: 'query_spending_summary',
                  input: { fromDate: '2026-11-01', toDate: '2026-11-10' },
                },
              },
            ],
          },
        },
      })
      // Second turn: model answers with formatted text
      .mockResolvedValueOnce({
        stopReason: 'end_turn',
        output: {
          message: {
            role: 'assistant',
            content: [{ text: 'You spent a total of $190.00 across 3 transactions.' }],
          },
        },
      });

    const response = await runAssistantChat(
      'user-1',
      [{ role: 'user', content: 'How much did I spend this month?' }],
      {
        bedrockClient: { send: mockSend },
        listCategoriesFn: vi.fn().mockResolvedValue(mockCategories),
        listTransactionsFn: vi.fn().mockResolvedValue(mockTransactions),
        now: () => new Date('2026-11-10T12:00:00Z'),
      },
    );

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(response.reply).toBe('You spent a total of $190.00 across 3 transactions.');
    expect(response.citedTransactions).toBeDefined();
    expect(response.citedTransactions?.length).toBeGreaterThan(0);
  });

  it('executes get_top_transactions and cites the transactions', async () => {
    const mockSend = vi
      .fn()
      .mockResolvedValueOnce({
        stopReason: 'tool_use',
        output: {
          message: {
            role: 'assistant',
            content: [
              {
                toolUse: {
                  toolUseId: 'call_top',
                  name: 'get_top_transactions',
                  input: { order: 'highest', limit: 1 },
                },
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        stopReason: 'end_turn',
        output: {
          message: {
            role: 'assistant',
            content: [{ text: 'Your largest purchase was $120.00 at Costco Wholesale.' }],
          },
        },
      });

    const response = await runAssistantChat(
      'user-1',
      [{ role: 'user', content: 'What was my highest expense?' }],
      {
        bedrockClient: { send: mockSend },
        listCategoriesFn: vi.fn().mockResolvedValue(mockCategories),
        listTransactionsFn: vi.fn().mockResolvedValue(mockTransactions),
        now: () => new Date('2026-11-10T12:00:00Z'),
      },
    );

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(response.reply).toBe('Your largest purchase was $120.00 at Costco Wholesale.');
    expect(response.citedTransactions).toHaveLength(1);
    expect(response.citedTransactions?.[0]?.description).toBe('Costco Wholesale');
    expect(response.citedTransactions?.[0]?.amountCents).toBe(12000);
  });
});
