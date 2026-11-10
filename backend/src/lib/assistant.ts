import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type Message,
  type Tool,
} from '@aws-sdk/client-bedrock-runtime';
import type {
  AssistantChatMessage,
  AssistantChatResponse,
  AssistantCitedTransaction,
  Category,
  Transaction,
} from '@spending-tracker/shared';
import { listCategories } from '../repositories/categories';
import { listTransactions } from '../repositories/transactions';

const defaultClient = new BedrockRuntimeClient({});

const modelId = (): string => process.env['BEDROCK_MODEL_ID'] ?? 'us.anthropic.claude-sonnet-4-6';

export interface AssistantDependencies {
  bedrockClient?: { send: BedrockRuntimeClient['send'] };
  listCategoriesFn?: (userId: string) => Promise<Category[]>;
  listTransactionsFn?: (
    userId: string,
    query?: { from?: string; to?: string; categoryId?: string },
  ) => Promise<Transaction[]>;
  now?: () => Date;
}

export const ASSISTANT_TOOLS: Tool[] = [
  {
    toolSpec: {
      name: 'query_spending_summary',
      description:
        'Calculates exact spending totals, transaction counts, averages, and category breakdowns for a given date range (YYYY-MM-DD), optional category, or optional merchant/keyword search. Always invoke this tool rather than guessing or approximating numbers.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            fromDate: {
              type: 'string',
              description: 'Start date in YYYY-MM-DD format (inclusive). Optional.',
            },
            toDate: {
              type: 'string',
              description: 'End date in YYYY-MM-DD format (inclusive). Optional.',
            },
            categoryId: {
              type: 'string',
              description: 'Specific category id to filter by. Optional.',
            },
            searchTerm: {
              type: 'string',
              description:
                'Keyword or merchant name to filter transaction descriptions (case-insensitive). Optional.',
            },
          },
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'get_top_transactions',
      description:
        'Retrieves the highest or lowest individual transactions in a given date range, optionally filtered by category or merchant keyword. Use this to find the largest purchase, highest grocery bill, smallest expense, or to inspect specific line items.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            order: {
              type: 'string',
              enum: ['highest', 'lowest'],
              description:
                "Sort order: 'highest' for largest amounts, 'lowest' for smallest amounts.",
            },
            limit: {
              type: 'integer',
              description: 'Max number of transactions to return (default 5, max 20). Optional.',
            },
            fromDate: {
              type: 'string',
              description: 'Start date in YYYY-MM-DD format (inclusive). Optional.',
            },
            toDate: {
              type: 'string',
              description: 'End date in YYYY-MM-DD format (inclusive). Optional.',
            },
            categoryId: {
              type: 'string',
              description: 'Specific category id to filter by. Optional.',
            },
            searchTerm: {
              type: 'string',
              description:
                'Keyword or merchant name to filter transaction descriptions (case-insensitive). Optional.',
            },
          },
          required: ['order'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'compare_periods',
      description:
        'Compares total spending and count between two distinct time periods (e.g. this month vs last month, or weekend vs weekday). Returns exact dollar differences and percentage shifts.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            periodA: {
              type: 'object',
              properties: {
                label: { type: 'string', description: "Label for period A (e.g. 'This Month')" },
                fromDate: { type: 'string', description: 'Start date YYYY-MM-DD' },
                toDate: { type: 'string', description: 'End date YYYY-MM-DD' },
              },
              required: ['fromDate', 'toDate'],
            },
            periodB: {
              type: 'object',
              properties: {
                label: { type: 'string', description: "Label for period B (e.g. 'Last Month')" },
                fromDate: { type: 'string', description: 'Start date YYYY-MM-DD' },
                toDate: { type: 'string', description: 'End date YYYY-MM-DD' },
              },
              required: ['fromDate', 'toDate'],
            },
            categoryId: {
              type: 'string',
              description: 'Optional category id to apply to both periods.',
            },
          },
          required: ['periodA', 'periodB'],
        },
      },
    },
  },
];

export function buildSystemPrompt(
  todayIso: string,
  dayOfWeek: string,
  categories: Category[],
): string {
  const categoryLines = categories.map((c) => `- ${c.name} (id: "${c.id}")`).join('\n');

  return [
    'You are a private, privacy-preserving AI financial assistant for Spending Tracker.',
    `Today's date is ${todayIso} (${dayOfWeek}).`,
    'All transaction data is stored encrypted in the user AWS DynamoDB table and processed within their AWS region with zero training retention.',
    '',
    'CRITICAL MATHEMATICAL GUARDRAIL:',
    '- NEVER estimate, approximate, guess, or manually calculate transaction totals, averages, or counts.',
    '- You do not have transaction data in your model weights; the ONLY source of truth is tool execution results.',
    '- ALWAYS invoke the provided calculation tools (query_spending_summary, get_top_transactions, compare_periods) to query spending data.',
    '- Base all numbers in your answer strictly on the tool outputs.',
    '- Amounts in tool outputs are whole cents (e.g. 5420 cents = $54.20). Format all currency values clearly as $X.YY for the user.',
    '- When interpreting relative dates:',
    `  * "This month" is ${todayIso.slice(0, 7)}-01 to ${todayIso}.`,
    '  * "Weekend" includes Friday, Saturday, and Sunday.',
    '- Be concise, clear, and direct. Avoid emojis. If no transactions match, clearly state that no records were found.',
    '',
    'Available User Categories:',
    categoryLines || 'No categories defined yet.',
  ].join('\n');
}

/** Pure deterministic calculation of spending summary */
export function calculateSpendingSummary(
  transactions: Transaction[],
  categoriesMap: Map<string, Category>,
  filter: {
    fromDate?: string;
    toDate?: string;
    categoryId?: string;
    searchTerm?: string;
  },
) {
  const normalizedSearch = filter.searchTerm?.toLowerCase().trim();

  const filtered = transactions.filter((t) => {
    if (filter.fromDate && t.date < filter.fromDate) return false;
    if (filter.toDate && t.date > filter.toDate) return false;
    if (filter.categoryId && t.categoryId !== filter.categoryId) return false;
    if (normalizedSearch && !t.description.toLowerCase().includes(normalizedSearch)) return false;
    return true;
  });

  const totalCents = filtered.reduce((sum, t) => sum + t.amountCents, 0);
  const transactionCount = filtered.length;
  const averageCents = transactionCount > 0 ? Math.round(totalCents / transactionCount) : 0;

  // Breakdown by category
  const categoryCounts = new Map<string, { totalCents: number; count: number }>();
  for (const t of filtered) {
    const current = categoryCounts.get(t.categoryId) ?? { totalCents: 0, count: 0 };
    current.totalCents += t.amountCents;
    current.count += 1;
    categoryCounts.set(t.categoryId, current);
  }

  const categoryBreakdown = Array.from(categoryCounts.entries()).map(([catId, stats]) => ({
    categoryId: catId,
    categoryName: categoriesMap.get(catId)?.name ?? 'Uncategorized',
    totalCents: stats.totalCents,
    count: stats.count,
  }));

  // Top sample transactions (largest 5)
  const sampleTransactions = [...filtered]
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, 5)
    .map((t) => ({
      id: t.id,
      date: t.date,
      amountCents: t.amountCents,
      description: t.description,
      categoryName: categoriesMap.get(t.categoryId)?.name ?? 'Uncategorized',
    }));

  return {
    totalCents,
    transactionCount,
    averageCents,
    categoryBreakdown,
    sampleTransactions,
    period: { fromDate: filter.fromDate ?? null, toDate: filter.toDate ?? null },
  };
}

/** Pure deterministic sort and filter for top/bottom transactions */
export function selectTopTransactions(
  transactions: Transaction[],
  categoriesMap: Map<string, Category>,
  input: {
    order: 'highest' | 'lowest';
    limit?: number;
    fromDate?: string;
    toDate?: string;
    categoryId?: string;
    searchTerm?: string;
  },
) {
  const normalizedSearch = input.searchTerm?.toLowerCase().trim();

  const filtered = transactions.filter((t) => {
    if (input.fromDate && t.date < input.fromDate) return false;
    if (input.toDate && t.date > input.toDate) return false;
    if (input.categoryId && t.categoryId !== input.categoryId) return false;
    if (normalizedSearch && !t.description.toLowerCase().includes(normalizedSearch)) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) =>
    input.order === 'highest' ? b.amountCents - a.amountCents : a.amountCents - b.amountCents,
  );

  const limit = Math.min(Math.max(input.limit ?? 5, 1), 20);
  const selected = sorted.slice(0, limit);

  return selected.map((t) => ({
    id: t.id,
    date: t.date,
    amountCents: t.amountCents,
    description: t.description,
    categoryId: t.categoryId,
    categoryName: categoriesMap.get(t.categoryId)?.name ?? 'Uncategorized',
  }));
}

/** Pure comparison calculation between two summaries */
export function compareSummaryPeriods(
  summaryA: ReturnType<typeof calculateSpendingSummary>,
  summaryB: ReturnType<typeof calculateSpendingSummary>,
  labelA = 'Period A',
  labelB = 'Period B',
) {
  const deltaCents = summaryA.totalCents - summaryB.totalCents;
  const percentChange =
    summaryB.totalCents > 0
      ? Math.round(((summaryA.totalCents - summaryB.totalCents) / summaryB.totalCents) * 100)
      : null;

  return {
    periodA: { label: labelA, ...summaryA },
    periodB: { label: labelB, ...summaryB },
    deltaCents,
    percentChange,
  };
}

export async function runAssistantChat(
  userId: string,
  incomingMessages: AssistantChatMessage[],
  deps: AssistantDependencies = {},
): Promise<AssistantChatResponse> {
  const client = deps.bedrockClient ?? defaultClient;
  const getCategories = deps.listCategoriesFn ?? listCategories;
  const getTransactions = deps.listTransactionsFn ?? listTransactions;
  const now = deps.now ? deps.now() : new Date();

  const todayIso = now.toISOString().slice(0, 10);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOfWeek = days[now.getUTCDay()] ?? 'Monday';

  const categories = await getCategories(userId);
  const categoriesMap = new Map(categories.map((c) => [c.id, c]));

  const system = buildSystemPrompt(todayIso, dayOfWeek, categories);

  // Convert incoming chat messages to Bedrock Converse format
  const conversationMessages: Message[] = incomingMessages.map((m) => ({
    role: m.role,
    content: [{ text: m.content }],
  }));

  const citedTransactionsMap = new Map<string, AssistantCitedTransaction>();

  // Tool execution loop (max 4 turns to prevent runaway loops)
  for (let turn = 0; turn < 4; turn++) {
    const command = new ConverseCommand({
      modelId: modelId(),
      system: [{ text: system }],
      messages: conversationMessages,
      toolConfig: {
        tools: ASSISTANT_TOOLS,
      },
    });

    const response = await client.send(command);
    const message = response.output?.message;

    if (!message) {
      throw new Error('No message returned from Bedrock assistant');
    }

    conversationMessages.push(message);

    // If no tool call was requested, we're done
    if (response.stopReason !== 'tool_use') {
      break;
    }

    // Process tool use requests
    const toolResults: ContentBlock[] = [];

    for (const block of message.content ?? []) {
      if (!('toolUse' in block) || !block.toolUse) continue;

      const { toolUseId, name, input } = block.toolUse;
      const toolInput = (input ?? {}) as Record<string, unknown>;

      let resultData: Record<string, unknown>;

      try {
        if (name === 'query_spending_summary') {
          const fromDate =
            typeof toolInput['fromDate'] === 'string' ? toolInput['fromDate'] : undefined;
          const toDate = typeof toolInput['toDate'] === 'string' ? toolInput['toDate'] : undefined;
          const categoryId =
            typeof toolInput['categoryId'] === 'string' ? toolInput['categoryId'] : undefined;
          const searchTerm =
            typeof toolInput['searchTerm'] === 'string' ? toolInput['searchTerm'] : undefined;

          const transactions = await getTransactions(userId, {
            from: fromDate,
            to: toDate,
            categoryId,
          });

          const summary = calculateSpendingSummary(transactions, categoriesMap, {
            fromDate,
            toDate,
            categoryId,
            searchTerm,
          });

          for (const s of summary.sampleTransactions) {
            citedTransactionsMap.set(s.id, s);
          }

          resultData = summary as unknown as Record<string, unknown>;
        } else if (name === 'get_top_transactions') {
          const order = toolInput['order'] === 'lowest' ? 'lowest' : 'highest';
          const limit = typeof toolInput['limit'] === 'number' ? toolInput['limit'] : 5;
          const fromDate =
            typeof toolInput['fromDate'] === 'string' ? toolInput['fromDate'] : undefined;
          const toDate = typeof toolInput['toDate'] === 'string' ? toolInput['toDate'] : undefined;
          const categoryId =
            typeof toolInput['categoryId'] === 'string' ? toolInput['categoryId'] : undefined;
          const searchTerm =
            typeof toolInput['searchTerm'] === 'string' ? toolInput['searchTerm'] : undefined;

          const transactions = await getTransactions(userId, {
            from: fromDate,
            to: toDate,
            categoryId,
          });

          const items = selectTopTransactions(transactions, categoriesMap, {
            order,
            limit,
            fromDate,
            toDate,
            categoryId,
            searchTerm,
          });

          for (const item of items) {
            citedTransactionsMap.set(item.id, {
              id: item.id,
              date: item.date,
              amountCents: item.amountCents,
              description: item.description,
              categoryName: item.categoryName,
            });
          }

          resultData = { transactions: items };
        } else if (name === 'compare_periods') {
          const pA = (toolInput['periodA'] ?? {}) as {
            label?: string;
            fromDate: string;
            toDate: string;
          };
          const pB = (toolInput['periodB'] ?? {}) as {
            label?: string;
            fromDate: string;
            toDate: string;
          };
          const categoryId =
            typeof toolInput['categoryId'] === 'string' ? toolInput['categoryId'] : undefined;

          const [txA, txB] = await Promise.all([
            getTransactions(userId, { from: pA.fromDate, to: pA.toDate, categoryId }),
            getTransactions(userId, { from: pB.fromDate, to: pB.toDate, categoryId }),
          ]);

          const summaryA = calculateSpendingSummary(txA, categoriesMap, {
            fromDate: pA.fromDate,
            toDate: pA.toDate,
            categoryId,
          });
          const summaryB = calculateSpendingSummary(txB, categoriesMap, {
            fromDate: pB.fromDate,
            toDate: pB.toDate,
            categoryId,
          });

          const comparison = compareSummaryPeriods(summaryA, summaryB, pA.label, pB.label);
          resultData = comparison as unknown as Record<string, unknown>;
        } else {
          resultData = { error: `Unsupported tool ${name}` };
        }

        toolResults.push({
          toolResult: {
            toolUseId,
            content: [{ json: resultData as never }],
            status: 'success',
          },
        });
      } catch (err) {
        toolResults.push({
          toolResult: {
            toolUseId,
            content: [
              {
                text: err instanceof Error ? err.message : 'Error executing tool calculation',
              },
            ],
            status: 'error',
          },
        });
      }
    }

    // Feed tool results back as a user message
    conversationMessages.push({
      role: 'user',
      content: toolResults,
    });
  }

  // Extract the final assistant reply text
  const lastMessage = conversationMessages[conversationMessages.length - 1];
  let replyText = '';

  if (lastMessage?.role === 'assistant') {
    for (const block of lastMessage.content ?? []) {
      if ('text' in block && typeof block.text === 'string') {
        replyText += block.text;
      }
    }
  }

  return {
    reply: replyText.trim() || 'No response generated.',
    citedTransactions:
      citedTransactionsMap.size > 0 ? Array.from(citedTransactionsMap.values()) : undefined,
  };
}
