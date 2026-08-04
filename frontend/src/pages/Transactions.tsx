import { type FormEvent, useState } from 'react';
import type { Category, Transaction } from '@spending-tracker/shared';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CategorySelect } from '@/components/CategorySelect';
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

export function Transactions() {
  const [draft, setDraft] = useState(emptyDraft);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [importing, setImporting] = useState(false);

  const transactions = useTransactions();
  const categories = useCategories();
  const createTransaction = useCreateTransaction();
  const deleteTransaction = useDeleteTransaction();

  const categoryList = categories.data ?? [];
  const byId = new Map(categoryList.map((category) => [category.id, category]));

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

  const rows = transactions.data ?? [];
  const total = rows.reduce((sum, row) => sum + row.amountCents, 0);

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
              {rows.length} {rows.length === 1 ? 'entry' : 'entries'} · {formatAmount(total)}
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

      {transactions.isPending && <EmptyState>Loading transactions…</EmptyState>}
      {transactions.isError && (
        <EmptyState>Could not load transactions: {transactions.error.message}</EmptyState>
      )}

      {transactions.isSuccess &&
        (rows.length === 0 ? (
          <EmptyState>No transactions yet. Add your first one above.</EmptyState>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-44">Category</TableHead>
                  <TableHead className="w-28 text-right">Amount</TableHead>
                  <TableHead className="w-28" />
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
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(transaction)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(transaction)}
                        disabled={deleteTransaction.isPending}
                      >
                        Delete
                      </Button>
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
