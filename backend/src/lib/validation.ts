import { z } from 'zod';

/** Rejects well-formed but nonexistent dates such as 2026-02-30. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
  }, 'Date is not a real calendar date');

// Amounts are integer cents. Negative values represent refunds.
const amountCents = z
  .number()
  .int('Amount must be a whole number of cents')
  .min(-100_000_000)
  .max(100_000_000)
  .refine((value) => value !== 0, 'Amount cannot be zero');

export const transactionInputSchema = z.object({
  date: isoDate,
  amountCents,
  description: z.string().trim().min(1, 'Description is required').max(200),
  categoryId: z.string().trim().min(1, 'Category is required').max(64),
});

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value like #22c55e'),
});

/** Bounded so one import request stays within the Lambda's payload and timeout. */
export const batchTransactionsSchema = z.object({
  transactions: z.array(transactionInputSchema).min(1, 'No transactions to import').max(500),
});

export const listTransactionsQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  categoryId: z.string().trim().min(1).max(64).optional(),
});

export type TransactionInput = z.infer<typeof transactionInputSchema>;
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;

export class ValidationError extends Error {
  readonly details: string[];

  constructor(details: string[]) {
    super(details.join('; '));
    this.name = 'ValidationError';
    this.details = details;
  }
}

/** Parses untrusted input, collapsing Zod issues into a flat message list. */
export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) =>
        issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
      ),
    );
  }

  return result.data;
}

/** Parses a JSON request body, treating malformed JSON as a validation failure. */
export function parseBody<T>(schema: z.ZodType<T>, body: string | undefined): T {
  let parsed: unknown;

  try {
    parsed = JSON.parse(body ?? '');
  } catch {
    throw new ValidationError(['Request body must be valid JSON']);
  }

  return parseInput(schema, parsed);
}
