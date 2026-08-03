import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Category,
  CreateCategoryRequest,
  CreateTransactionRequest,
  ListCategoriesResponse,
  ListTransactionsQuery,
  ListTransactionsResponse,
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
function useTransactionMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<unknown>,
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

function useCategoryMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<unknown>) {
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
