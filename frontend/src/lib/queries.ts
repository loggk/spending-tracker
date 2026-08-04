import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Category,
  CreateCategoryRequest,
  CreateReceiptResponse,
  CreateTransactionRequest,
  ListCategoriesResponse,
  ListTransactionsQuery,
  ListTransactionsResponse,
  Receipt,
  Transaction,
} from '@spending-tracker/shared';
import { apiFetch } from './api';

const keys = {
  transactions: (query: ListTransactionsQuery = {}) => ['transactions', query] as const,
  categories: ['categories'] as const,
};

function toSearch(query: ListTransactionsQuery): string {
  const params = new URLSearchParams(
    Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  const search = params.toString();
  return search ? `?${search}` : '';
}

export function useTransactions(query: ListTransactionsQuery = {}) {
  return useQuery({
    queryKey: keys.transactions(query),
    queryFn: () =>
      apiFetch<ListTransactionsResponse>(`/transactions${toSearch(query)}`).then(
        (data) => data.transactions,
      ),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: keys.categories,
    queryFn: () => apiFetch<ListCategoriesResponse>('/categories').then((data) => data.categories),
  });
}

/** Transaction lists are cached per query, so any write invalidates all of them. */
function useTransactionMutation<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transactions'] }),
  });
}

export const useCreateTransaction = () =>
  useTransactionMutation((input: CreateTransactionRequest) =>
    apiFetch<Transaction>('/transactions', { method: 'POST', body: JSON.stringify(input) }),
  );

/** The API caps a batch at 500, so a larger import is sent as several requests. */
const IMPORT_CHUNK_SIZE = 500;

export const useImportTransactions = () =>
  useTransactionMutation(async (transactions: CreateTransactionRequest[]) => {
    for (let start = 0; start < transactions.length; start += IMPORT_CHUNK_SIZE) {
      await apiFetch('/transactions/batch', {
        method: 'POST',
        body: JSON.stringify({
          transactions: transactions.slice(start, start + IMPORT_CHUNK_SIZE),
        }),
      });
    }
  });

export const useUpdateTransaction = () =>
  useTransactionMutation(({ id, ...input }: CreateTransactionRequest & { id: string }) =>
    apiFetch<Transaction>(`/transactions/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  );

export const useDeleteTransaction = () =>
  useTransactionMutation((id: string) =>
    apiFetch<void>(`/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  );

/** Polls while the model works; stops as soon as the receipt settles. */
export function useReceipt(receiptId: string | null) {
  return useQuery({
    queryKey: ['receipt', receiptId],
    enabled: receiptId !== null,
    queryFn: () => apiFetch<Receipt>(`/receipts/${encodeURIComponent(receiptId ?? '')}`),
    refetchInterval: (query) => (query.state.data?.status === 'processing' ? 2000 : false),
  });
}

/**
 * Asks the API for an upload URL, then sends the image straight to S3. The PUT
 * carries no auth header — the signature in the URL is the authorisation, and
 * adding one would break it.
 */
export function useUploadReceipt() {
  return useMutation({
    mutationFn: async (file: File) => {
      const { receiptId, uploadUrl } = await apiFetch<CreateReceiptResponse>('/receipts', {
        method: 'POST',
      });

      const response = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'content-type': file.type },
      });

      if (!response.ok) {
        throw new Error('Could not upload the image');
      }

      return receiptId;
    },
  });
}

export function useConfirmReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ receiptId, items }: { receiptId: string; items: CreateTransactionRequest[] }) =>
      apiFetch(`/receipts/${encodeURIComponent(receiptId)}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ items }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transactions'] }),
  });
}

function useCategoryMutation<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: async () => {
      // Transactions render category names, so they go stale too.
      await queryClient.invalidateQueries({ queryKey: keys.categories });
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

export const useCreateCategory = () =>
  useCategoryMutation((input: CreateCategoryRequest) =>
    apiFetch<Category>('/categories', { method: 'POST', body: JSON.stringify(input) }),
  );

export const useUpdateCategory = () =>
  useCategoryMutation(({ id, ...input }: CreateCategoryRequest & { id: string }) =>
    apiFetch<Category>(`/categories/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  );

export const useDeleteCategory = () =>
  useCategoryMutation((id: string) =>
    apiFetch<void>(`/categories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  );
