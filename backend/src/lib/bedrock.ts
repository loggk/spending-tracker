import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({});

/**
 * Inference profile id, not a bare model id — Bedrock rejects bare ids for
 * current Claude models with a confusing "on-demand throughput isn't supported"
 * error. Set through the environment so the model can change without a code edit.
 */
const modelId = (): string => process.env['BEDROCK_MODEL_ID'] ?? 'us.anthropic.claude-sonnet-4-6';

export interface ReceiptLine {
  description: string;
  amountCents: number;
  suggestedCategoryId: string | null;
}

export interface ParsedReceipt {
  merchant: string | null;
  date: string | null;
  items: ReceiptLine[];
}

export class ReceiptParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReceiptParseError';
  }
}

/**
 * Forcing a tool call is what makes the response parseable: the model must reply
 * with arguments matching this schema rather than prose that happens to contain
 * JSON.
 */
const RECORD_RECEIPT_TOOL = {
  name: 'record_receipt',
  description: 'Record the line items read from a receipt image.',
  input_schema: {
    type: 'object',
    properties: {
      merchant: { type: ['string', 'null'], description: 'Store name, or null if unreadable.' },
      date: {
        type: ['string', 'null'],
        description: 'Purchase date as YYYY-MM-DD, or null if unreadable.',
      },
      items: {
        type: 'array',
        description: 'One entry per purchased line item. Exclude subtotals, tax and totals.',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string', description: 'What was bought.' },
            amountCents: {
              type: 'integer',
              description: 'Price in whole cents, e.g. 499 for $4.99.',
            },
            suggestedCategoryId: {
              type: ['string', 'null'],
              description: 'Id of the best-fitting category, or null if none fit.',
            },
          },
          required: ['description', 'amountCents', 'suggestedCategoryId'],
        },
      },
    },
    required: ['merchant', 'date', 'items'],
  },
} as const;

const systemPrompt = (categories: { id: string; name: string }[]): string =>
  [
    'You read receipt images and itemise them.',
    'Record every purchased line item separately. Do not include subtotals, tax, tips or the total.',
    'Amounts are in whole cents. If a line shows a quantity, record the line total.',
    'Assign each item the id of the category that best fits it, or null when none do.',
    'Available categories:',
    ...categories.map((category) => `- ${category.id}: ${category.name}`),
  ].join('\n');

interface ToolUseBlock {
  type: string;
  name?: string;
  input?: unknown;
}

/** Sends the image to Claude on Bedrock and returns the structured line items. */
export async function parseReceiptImage(
  image: Uint8Array,
  mediaType: string,
  categories: { id: string; name: string }[],
): Promise<ParsedReceipt> {
  const response = await client.send(
    new InvokeModelCommand({
      modelId: modelId(),
      contentType: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 4096,
        system: systemPrompt(categories),
        tools: [RECORD_RECEIPT_TOOL],
        tool_choice: { type: 'tool', name: RECORD_RECEIPT_TOOL.name },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: toBase64(image) },
              },
              { type: 'text', text: 'Itemise this receipt.' },
            ],
          },
        ],
      }),
    }),
  );

  const payload = JSON.parse(new TextDecoder().decode(response.body)) as {
    content?: ToolUseBlock[];
  };
  const toolUse = payload.content?.find(
    (block) => block.type === 'tool_use' && block.name === RECORD_RECEIPT_TOOL.name,
  );

  if (!toolUse?.input) {
    throw new ReceiptParseError('The model did not return any line items');
  }

  return normalise(toolUse.input, new Set(categories.map((category) => category.id)));
}

const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

/**
 * The tool schema constrains shape but not correctness, so values are checked
 * before they reach the database: unusable items are dropped and a category the
 * model invented is treated as no suggestion at all.
 */
export function normalise(input: unknown, categoryIds: Set<string>): ParsedReceipt {
  const raw = input as { merchant?: unknown; date?: unknown; items?: unknown };
  const items = Array.isArray(raw.items) ? raw.items : [];

  const parsed: ReceiptLine[] = [];
  for (const entry of items as Record<string, unknown>[]) {
    const description = typeof entry['description'] === 'string' ? entry['description'].trim() : '';
    const amountCents = Math.round(Number(entry['amountCents']));
    const suggested = entry['suggestedCategoryId'];

    if (description === '' || !Number.isFinite(amountCents) || amountCents === 0) {
      continue;
    }

    parsed.push({
      description: description.slice(0, 200),
      amountCents,
      suggestedCategoryId:
        typeof suggested === 'string' && categoryIds.has(suggested) ? suggested : null,
    });
  }

  if (parsed.length === 0) {
    throw new ReceiptParseError('No readable line items were found on this receipt');
  }

  const date =
    typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null;

  return {
    merchant:
      typeof raw.merchant === 'string' && raw.merchant.trim() !== ''
        ? raw.merchant.trim().slice(0, 100)
        : null,
    date,
    items: parsed,
  };
}
