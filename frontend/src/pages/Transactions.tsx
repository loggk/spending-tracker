import { type FormEvent, useEffect, useMemo, useState } from 'react';
import type { Transaction } from '@spending-tracker/shared';
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
  DownloadIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CategoryBadge } from '@/components/CategoryBadge';
import { CategoryFilter } from '@/components/CategoryFilter';
import { CategorySelect } from '@/components/CategorySelect';
import { type DateRange, DateRangePicker } from '@/components/DateRangePicker';
import { EmptyState } from '@/components/EmptyState';
import { Field, FieldError, FormCard } from '@/components/FormCard';
import { IconButton } from '@/components/IconButton';
import { ImportDialog } from '@/components/ImportDialog';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toCsv } from '@/lib/csv';
import { downloadTextFile } from '@/lib/download';
import { formatAmount, formatDate, formatMonth, parseAmountToCents, today } from '@/lib/format';
import {
  useCategories,
  useCreateTransaction,
  useDeleteTransaction,
  useTransactions,
} from '@/lib/queries';
import { useUndoableDelete } from '@/lib/use-undoable-delete';
import { EditTransactionDialog } from './EditTransactionDialog';

const emptyDraft = () => ({ date: today(), amount: '', description: '', categoryId: '' });

/** A stable empty fallback, so the filtered list is not rebuilt on every render. */
const EMPTY_TRANSACTIONS: Transaction[] = [];

/** Rows rendered up front, and how many more each click adds. */
const FIRST_PAGE = 80;
const PAGE_STEP = 100;

type SortKey = 'date' | 'amount';

interface Sort {
  key: SortKey;
  direction: 'asc' | 'desc';
}

export function Transactions() {
  const [draft, setDraft] = useState(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [importing, setImporting] = useState(false);

  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>({});
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<Sort>({ key: 'date', direction: 'desc' });
  const [limit, setLimit] = useState(FIRST_PAGE);

  // The API filters by date server-side; search and categories filter client-side.
  const transactions = useTransactions(dateRange);
  const categories = useCategories();
  const createTransaction = useCreateTransaction();
  const deleteTransaction = useDeleteTransaction();

  const categoryList = categories.data ?? [];
  const byId = new Map(categoryList.map((category) => [category.id, category]));

  const { pendingIds, requestDelete } = useUndoableDelete(
    (id) =>
      deleteTransaction.mutate(id, {
        onError: (mutationError) => toast.error(mutationError.message),
      }),
    'Transaction deleted',
  );

  const fetched = transactions.data ?? EMPTY_TRANSACTIONS;
  const filtering =
    search.trim() !== '' || categoryFilter.size > 0 || Boolean(dateRange.from ?? dateRange.to);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const factor = sort.direction === 'asc' ? 1 : -1;

    return fetched
      .filter(
        (transaction) =>
          !pendingIds.has(transaction.id) &&
          (needle === '' || transaction.description.toLowerCase().includes(needle)) &&
          (categoryFilter.size === 0 || categoryFilter.has(transaction.categoryId)),
      )
      .sort((a, b) => {
        const order =
          sort.key === 'date' ? a.date.localeCompare(b.date) : a.amountCents - b.amountCents;
        return factor * order;
      });
  }, [fetched, pendingIds, search, categoryFilter, sort]);

  // Narrowing the list invalidates how far the reader had paged through it.
  useEffect(() => setLimit(FIRST_PAGE), [search, categoryFilter, dateRange, sort]);

  const total = rows.reduce((sum, row) => sum + row.amountCents, 0);
  // Month headers only make sense while the list runs in date order.
  const entries = useEntries(rows.slice(0, limit), sort.key === 'date' ? rows : null);

  function handleSort(key: SortKey) {
    setSort((previous) =>
      previous.key === key
        ? { key, direction: previous.direction === 'desc' ? 'asc' : 'desc' }
        : { key, direction: 'desc' },
    );
  }

  function handleAdd(event: FormEvent) {
    event.preventDefault();

    const amountCents = parseAmountToCents(draft.amount);
    if (amountCents === null) {
      setError('Enter an amount like 12.99');
      return;
    }
    if (draft.description.trim() === '') {
      setError('Add a short description');
      return;
    }
    if (!draft.categoryId) {
      setError('Pick a category');
      return;
    }

    setError(null);
    createTransaction.mutate(
      {
        date: draft.date,
        amountCents,
        description: draft.description.trim(),
        categoryId: draft.categoryId,
      },
      {
        // Keep the date and category so consecutive entries stay quick.
        onSuccess: () => setDraft((previous) => ({ ...previous, amount: '', description: '' })),
        onError: (mutationError: Error) => setError(mutationError.message),
      },
    );
  }

  function handleExport() {
    downloadTextFile(
      `spending-${today()}.csv`,
      toCsv(rows, categoryList),
      'text/csv;charset=utf-8',
    );
  }

  if (categories.isSuccess && categoryList.length === 0) {
    return (
      <EmptyState>
        Add a category before recording transactions.{' '}
        <Link to="/categories" className="underline underline-offset-4">
          Create one
        </Link>
        .
      </EmptyState>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={
          rows.length > 0 &&
          `${rows.length.toLocaleString()} ${rows.length === 1 ? 'entry' : 'entries'}${filtering ? ' matching' : ''} · ${formatAmount(total)}`
        }
        title="Transactions"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
              <UploadIcon data-icon="inline-start" />
              Import CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={rows.length === 0}
            >
              <DownloadIcon data-icon="inline-start" />
              Export CSV
            </Button>
          </div>
        }
      />

      <FormCard
        onSubmit={handleAdd}
        className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] items-end gap-3"
      >
        <Field label="Date" htmlFor="date">
          <Input
            id="date"
            type="date"
            required
            value={draft.date}
            onChange={(event) => setDraft({ ...draft, date: event.target.value })}
          />
        </Field>
        <Field label="Amount" htmlFor="amount">
          <Input
            id="amount"
            inputMode="decimal"
            placeholder="12.99"
            className="tabular-nums"
            value={draft.amount}
            onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
          />
        </Field>
        <Field label="Description" htmlFor="description" className="col-span-2">
          <Input
            id="description"
            placeholder="Coffee"
            maxLength={200}
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </Field>
        <Field label="Category" htmlFor="category">
          <CategorySelect
            id="category"
            categories={categoryList}
            value={draft.categoryId}
            onChange={(categoryId) => setDraft({ ...draft, categoryId })}
          />
        </Field>
        <Button type="submit" disabled={createTransaction.isPending}>
          {createTransaction.isPending ? 'Adding…' : 'Add'}
        </Button>

        {error && (
          <div className="col-span-full">
            <FieldError>{error}</FieldError>
          </div>
        )}
      </FormCard>

      {(fetched.length > 0 || filtering) && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1 sm:max-w-[320px]">
            <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search descriptions"
              aria-label="Search descriptions"
              className="pl-8"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="flex min-w-0 flex-wrap gap-2 sm:ml-auto">
            <DateRangePicker value={dateRange} onChange={setDateRange} />
            <CategoryFilter
              categories={categoryList}
              selected={categoryFilter}
              onChange={setCategoryFilter}
            />
            {/* The card list has no column headers to click, so sorting moves into a menu. */}
            <SortMenu sort={sort} onChange={setSort} className="sm:hidden" />
          </div>
        </div>
      )}

      {transactions.isPending && <EmptyState>Loading transactions…</EmptyState>}
      {transactions.isError && (
        <EmptyState>Could not load transactions: {transactions.error.message}</EmptyState>
      )}

      {transactions.isSuccess &&
        (rows.length === 0 ? (
          <EmptyState>
            {filtering
              ? 'No transactions match the current filters.'
              : 'No transactions yet. Add your first one above.'}
          </EmptyState>
        ) : (
          <>
            {/* A five-column table cannot fit a phone, so narrow screens get cards. */}
            <ul className="grid gap-2 sm:hidden">
              {entries.map((entry) =>
                entry.kind === 'month' ? (
                  <li
                    key={entry.month}
                    className="flex items-baseline justify-between gap-3 px-1 pt-2 text-[13px] font-semibold"
                  >
                    {formatMonth(entry.month)}
                    <span className="text-xs font-normal text-muted-foreground tabular-nums">
                      {formatAmount(entry.cents)}
                    </span>
                  </li>
                ) : (
                  <li
                    key={entry.transaction.id}
                    className="grid gap-1 rounded-[14px] border border-border bg-card p-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 text-sm font-medium break-words">
                        {entry.transaction.description}
                      </span>
                      <span className="shrink-0 text-sm font-medium tabular-nums">
                        {formatAmount(entry.transaction.amountCents)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
                        <CategoryBadge category={byId.get(entry.transaction.categoryId)} />
                        <span aria-hidden>·</span>
                        <span className="shrink-0">{formatDate(entry.transaction.date)}</span>
                      </div>
                      <RowActions
                        transaction={entry.transaction}
                        onEdit={setEditing}
                        onDelete={requestDelete}
                      />
                    </div>
                  </li>
                ),
              )}
            </ul>

            <Card className="hidden gap-0 overflow-hidden py-0 sm:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <SortableHead
                      label="Date"
                      className="w-[120px]"
                      sort={sort}
                      sortKey="date"
                      onSort={handleSort}
                    />
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[180px]">Category</TableHead>
                    <SortableHead
                      label="Amount"
                      className="w-[120px]"
                      align="right"
                      sort={sort}
                      sortKey="amount"
                      onSort={handleSort}
                    />
                    <TableHead className="w-[72px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) =>
                    entry.kind === 'month' ? (
                      <TableRow key={entry.month} className="bg-surface-2 hover:bg-surface-2">
                        <TableCell colSpan={5} className="h-auto pt-4 pb-2">
                          <div className="flex items-baseline justify-between gap-3 pr-[84px]">
                            <span className="text-[13px] font-semibold">
                              {formatMonth(entry.month)}
                            </span>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {entry.count.toLocaleString()}{' '}
                              {entry.count === 1 ? 'entry' : 'entries'} ·{' '}
                              {formatAmount(entry.cents)}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow key={entry.transaction.id}>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {formatDate(entry.transaction.date)}
                        </TableCell>
                        <TableCell className="max-w-0 truncate font-medium">
                          {entry.transaction.description}
                        </TableCell>
                        <TableCell>
                          <CategoryBadge category={byId.get(entry.transaction.categoryId)} />
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatAmount(entry.transaction.amountCents)}
                        </TableCell>
                        <TableCell>
                          <RowActions
                            transaction={entry.transaction}
                            onEdit={setEditing}
                            onDelete={requestDelete}
                          />
                        </TableCell>
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>
            </Card>

            {limit < rows.length && (
              <div className="flex justify-center">
                <Button variant="outline" onClick={() => setLimit(limit + PAGE_STEP)}>
                  Show {Math.min(PAGE_STEP, rows.length - limit)} more
                </Button>
              </div>
            )}
          </>
        ))}

      <ImportDialog
        open={importing}
        categories={categoryList}
        onClose={() => setImporting(false)}
      />

      <EditTransactionDialog
        transaction={editing}
        categories={categoryList}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

type Entry =
  | { kind: 'month'; month: string; count: number; cents: number }
  | { kind: 'transaction'; transaction: Transaction };

/**
 * Interleaves month headers into the page of rows on screen. Their totals come
 * from every filtered row in the month, not just the ones rendered so far.
 */
function useEntries(page: Transaction[], grouped: Transaction[] | null): Entry[] {
  return useMemo(() => {
    if (!grouped) {
      return page.map((transaction) => ({ kind: 'transaction', transaction }) as const);
    }

    const totals = new Map<string, { count: number; cents: number }>();
    for (const transaction of grouped) {
      const month = transaction.date.slice(0, 7);
      const entry = totals.get(month) ?? { count: 0, cents: 0 };
      entry.count += 1;
      entry.cents += transaction.amountCents;
      totals.set(month, entry);
    }

    const entries: Entry[] = [];
    let current = '';
    for (const transaction of page) {
      const month = transaction.date.slice(0, 7);
      if (month !== current) {
        current = month;
        entries.push({ kind: 'month', month, ...(totals.get(month) ?? { count: 0, cents: 0 }) });
      }
      entries.push({ kind: 'transaction', transaction });
    }
    return entries;
  }, [page, grouped]);
}

interface RowActionsProps {
  transaction: Transaction;
  onEdit: (transaction: Transaction) => void;
  onDelete: (id: string) => void;
}

function RowActions({ transaction, onEdit, onDelete }: RowActionsProps) {
  return (
    <div className="-mr-1 flex shrink-0 justify-end gap-0.5">
      <IconButton
        label={`Edit ${transaction.description}`}
        onClick={() => onEdit(transaction)}
      >
        <PencilIcon />
      </IconButton>
      <IconButton
        label={`Delete ${transaction.description}`}
        tone="destructive"
        onClick={() => onDelete(transaction.id)}
      >
        <Trash2Icon />
      </IconButton>
    </div>
  );
}

const SORT_OPTIONS: Array<{ value: string; label: string; sort: Sort }> = [
  { value: 'date-desc', label: 'Newest first', sort: { key: 'date', direction: 'desc' } },
  { value: 'date-asc', label: 'Oldest first', sort: { key: 'date', direction: 'asc' } },
  { value: 'amount-desc', label: 'Largest first', sort: { key: 'amount', direction: 'desc' } },
  { value: 'amount-asc', label: 'Smallest first', sort: { key: 'amount', direction: 'asc' } },
];

function SortMenu({
  sort,
  onChange,
  className,
}: {
  sort: Sort;
  onChange: (sort: Sort) => void;
  className?: string;
}) {
  const value = `${sort.key}-${sort.direction}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" className={className}>
            <ArrowUpDownIcon data-icon="inline-start" />
            Sort
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            const option = SORT_OPTIONS.find((entry) => entry.value === next);
            if (option) {
              onChange(option.sort);
            }
          }}
        >
          {SORT_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface SortableHeadProps {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
  className?: string;
  align?: 'left' | 'right';
}

function SortableHead({
  label,
  sortKey,
  sort,
  onSort,
  className,
  align = 'left',
}: SortableHeadProps) {
  const active = sort.key === sortKey;
  const Arrow = active
    ? sort.direction === 'asc'
      ? ArrowUpIcon
      : ArrowDownIcon
    : ChevronsUpDownIcon;

  return (
    <TableHead
      className={className}
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={
          align === 'right'
            ? 'flex w-full items-center justify-end gap-1 hover:text-foreground'
            : 'flex items-center gap-1 hover:text-foreground'
        }
      >
        {label}
        <Arrow className={active ? 'size-[13px]' : 'size-[13px] opacity-50'} />
      </button>
    </TableHead>
  );
}
