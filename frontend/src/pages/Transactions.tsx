import { type FormEvent, useMemo, useState } from 'react';
import type { Category, Transaction } from '@spending-tracker/shared';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CategoryFilter } from '@/components/CategoryFilter';
import { CategorySelect } from '@/components/CategorySelect';
import { type DateRange, DateRangePicker } from '@/components/DateRangePicker';
import { ImportDialog } from '@/components/ImportDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { formatAmount, formatDate, parseAmountToCents, today } from '@/lib/format';
import {
  useCategories,
  useCreateTransaction,
  useDeleteTransaction,
  useTransactions,
} from '@/lib/queries';
import { EditTransactionDialog } from './EditTransactionDialog';

const emptyDraft = () => ({ date: today(), amount: '', description: '', categoryId: '' });

type SortKey = 'date' | 'amount';

interface Sort {
  key: SortKey;
  direction: 'asc' | 'desc';
}

export function Transactions() {
  const [draft, setDraft] = useState(emptyDraft);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [importing, setImporting] = useState(false);

  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>({});
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<Sort>({ key: 'date', direction: 'desc' });

  // The API filters by date server-side; search and categories filter client-side.
  const transactions = useTransactions(dateRange);
  const categories = useCategories();
  const createTransaction = useCreateTransaction();
  const deleteTransaction = useDeleteTransaction();

  const categoryList = categories.data ?? [];
  const byId = new Map(categoryList.map((category) => [category.id, category]));

  const fetched = transactions.data ?? [];
  const filtering =
    search.trim() !== '' || categoryFilter.size > 0 || Boolean(dateRange.from ?? dateRange.to);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const factor = sort.direction === 'asc' ? 1 : -1;

    return (transactions.data ?? [])
      .filter(
        (transaction) =>
          (needle === '' || transaction.description.toLowerCase().includes(needle)) &&
          (categoryFilter.size === 0 || categoryFilter.has(transaction.categoryId)),
      )
      .sort((a, b) => {
        const order =
          sort.key === 'date' ? a.date.localeCompare(b.date) : a.amountCents - b.amountCents;
        return factor * order;
      });
  }, [transactions.data, search, categoryFilter, sort]);

  const total = rows.reduce((sum, row) => sum + row.amountCents, 0);

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
      toast.error('Enter an amount like 12.99');
      return;
    }
    if (!draft.categoryId) {
      toast.error('Pick a category');
      return;
    }

    createTransaction.mutate(
      {
        date: draft.date,
        amountCents,
        description: draft.description.trim(),
        categoryId: draft.categoryId,
      },
      {
        onSuccess: () => {
          // Keep the date and category so consecutive entries stay quick.
          setDraft((previous) => ({ ...previous, amount: '', description: '' }));
          toast.success('Transaction added');
        },
        onError: (error: Error) => toast.error(error.message),
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

  function handleDelete(transaction: Transaction) {
    deleteTransaction.mutate(transaction.id, {
      onSuccess: () => toast.success('Transaction deleted'),
      onError: (error: Error) => toast.error(error.message),
    });
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
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
          {rows.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
              {filtering && ' matching'} · {formatAmount(total)}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
            Import CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={rows.length === 0}>
            Export CSV
          </Button>
        </div>
      </div>

      <form
        onSubmit={handleAdd}
        className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[9rem_8rem_1fr_11rem_auto] sm:items-end"
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
            required
            value={draft.amount}
            onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
          />
        </Field>
        <Field label="Description" htmlFor="description">
          <Input
            id="description"
            placeholder="Coffee"
            required
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
      </form>

      {(fetched.length > 0 || filtering) && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1 sm:max-w-xs">
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
          <div className="ml-auto flex flex-wrap gap-2">
            <DateRangePicker value={dateRange} onChange={setDateRange} />
            <CategoryFilter
              categories={categoryList}
              selected={categoryFilter}
              onChange={setCategoryFilter}
            />
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
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead
                    label="Date"
                    className="w-36"
                    sort={sort}
                    sortKey="date"
                    onSort={handleSort}
                  />
                  <TableHead>Description</TableHead>
                  <TableHead className="w-44">Category</TableHead>
                  <SortableHead
                    label="Amount"
                    className="w-32"
                    align="right"
                    sort={sort}
                    sortKey="amount"
                    onSort={handleSort}
                  />
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell className="text-muted-foreground">
                      {formatDate(transaction.date)}
                    </TableCell>
                    <TableCell className="font-medium">{transaction.description}</TableCell>
                    <TableCell>
                      <CategoryBadge category={byId.get(transaction.categoryId)} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAmount(transaction.amountCents)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${transaction.description}`}
                          onClick={() => setEditing(transaction)}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Delete ${transaction.description}`}
                          onClick={() => handleDelete(transaction)}
                          disabled={deleteTransaction.isPending}
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
    </div>
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
        <Arrow className={active ? 'size-3.5' : 'size-3.5 opacity-50'} />
      </button>
    </TableHead>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function CategoryBadge({ category }: { category: Category | undefined }) {
  if (!category) {
    return <span className="text-sm text-muted-foreground">Uncategorized</span>;
  }

  return (
    <span className="flex items-center gap-2 text-sm">
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: category.color }}
      />
      {category.name}
    </span>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
