import type { Category, Receipt, ReceiptLineItem, Transaction } from './types';

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

export interface ApiError {
  message: string;
}
