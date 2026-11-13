import type {
  Category,
  IngestAlias,
  PendingTransaction,
  Receipt,
  ReceiptLineItem,
  Transaction,
} from './types';

export interface CreateTransactionRequest {
  date: string;
  amountCents: number;
  description: string;
  categoryId: string;
}

export type UpdateTransactionRequest = CreateTransactionRequest;

export interface ListTransactionsQuery {
  from?: string;
  to?: string;
  categoryId?: string;
}

export interface ListTransactionsResponse {
  transactions: Transaction[];
}

/** Bulk create used by CSV import. Callers chunk to at most 25 items per request. */
export interface BatchCreateTransactionsRequest {
  transactions: CreateTransactionRequest[];
}

export interface CreateCategoryRequest {
  name: string;
  color: string;
}

export type UpdateCategoryRequest = CreateCategoryRequest;

export interface ListCategoriesResponse {
  categories: Category[];
}

export interface CreateReceiptResponse {
  receiptId: string;
  uploadUrl: string;
}

export type GetReceiptResponse = Receipt;

/** User-reviewed line items to convert into transactions. */
export interface ConfirmReceiptRequest {
  items: Array<ReceiptLineItem & { categoryId: string; date: string }>;
}

export interface AssistantChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantCitedTransaction {
  id: string;
  date: string;
  amountCents: number;
  description: string;
  categoryName?: string;
}

export interface AssistantChatRequest {
  messages: AssistantChatMessage[];
}

export interface AssistantChatResponse {
  reply: string;
  citedTransactions?: AssistantCitedTransaction[];
}

export interface ListInboxResponse {
  pending: PendingTransaction[];
}

/**
 * A confirmed inbox row. The user can edit every field before accepting it, so
 * this is the same shape as a hand-entered transaction rather than a reference
 * back to what was parsed.
 */
export type ConfirmPendingRequest = CreateTransactionRequest;

export interface ConfirmPendingResponse {
  transaction: Transaction;
}

/** Null when the user has not generated an ingest address yet. */
export type GetIngestAliasResponse = IngestAlias | null;

export interface UpdateIngestAliasRequest {
  /** Address permitted to forward alerts in, alongside the issuers themselves. */
  forwardFrom?: string;
  /** Issues a new address, invalidating the old one. */
  rotate?: boolean;
}

export interface ApiError {
  message: string;
}
