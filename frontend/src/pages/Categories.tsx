import { type FormEvent, useMemo, useState } from 'react';
import type { Category } from '@spending-tracker/shared';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { ColorSwatchPicker } from '@/components/ColorSwatchPicker';
import { EmptyState } from '@/components/EmptyState';
import { Field, FieldError, FormCard } from '@/components/FormCard';
import { IconButton } from '@/components/IconButton';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatAmount } from '@/lib/format';
import { CATEGORY_COLORS, FALLBACK_COLOR } from '@/lib/palette';
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useTransactions,
} from '@/lib/queries';
import { useUndoableDelete } from '@/lib/use-undoable-delete';
import { EditCategoryDialog } from './EditCategoryDialog';

interface CategoryUsage {
  count: number;
  cents: number;
}

export function Categories() {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);

  const categories = useCategories();
  const createCategory = useCreateCategory();
  const deleteCategory = useDeleteCategory();
  // Counts are all-time, so this list is not tied to any date filter.
  const transactions = useTransactions({});

  const rows = categories.data ?? [];
  const { usage, uncategorized } = useUsage(rows, transactions.data);
  const { pendingIds, requestDelete } = useUndoableDelete(
    (id) =>
      deleteCategory.mutate(id, { onError: (mutationError) => toast.error(mutationError.message) }),
    'Category deleted',
  );
  const visible = rows.filter((category) => !pendingIds.has(category.id));

  function handleAdd(event: FormEvent) {
    event.preventDefault();

    const trimmed = name.trim();
    if (trimmed === '') {
      setError('Give the category a name');
      return;
    }
    if (visible.some((category) => category.name.toLowerCase() === trimmed.toLowerCase())) {
      setError('A category with that name already exists');
      return;
    }

    setError(null);
    createCategory.mutate(
      { name: trimmed, color },
      {
        onSuccess: () => setName(''),
        onError: (mutationError: Error) => setError(mutationError.message),
      },
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={`${visible.length} ${visible.length === 1 ? 'category' : 'categories'}`}
        title="Categories"
        description="Group your spending. Deleting a category leaves its transactions uncategorized."
      />

      <FormCard onSubmit={handleAdd} className="flex flex-wrap items-end gap-x-5 gap-y-4">
        <Field label="Name" htmlFor="name" className="flex-[1_1_220px]">
          <Input
            id="name"
            placeholder="Groceries"
            maxLength={50}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field label="Color" htmlFor="color">
          <ColorSwatchPicker id="color" value={color} onChange={setColor} />
        </Field>

        <Button type="submit" disabled={createCategory.isPending}>
          {createCategory.isPending ? 'Adding…' : 'Add category'}
        </Button>

        {error && (
          <div className="w-full">
            <FieldError>{error}</FieldError>
          </div>
        )}
      </FormCard>

      {categories.isPending && <EmptyState>Loading categories…</EmptyState>}
      {categories.isError && (
        <EmptyState>Could not load categories: {categories.error.message}</EmptyState>
      )}

      {categories.isSuccess &&
        (visible.length === 0 ? (
          <EmptyState>No categories yet. Add one above to get started.</EmptyState>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,400px),1fr))] gap-2.5">
            {visible.map((category) => (
              <CategoryRow
                key={category.id}
                category={category}
                usage={usage.get(category.id)}
                onEdit={() => setEditing(category)}
                onDelete={() => requestDelete(category.id)}
              />
            ))}
          </ul>
        ))}

      {uncategorized.count > 0 && (
        <p className="flex items-center gap-2 rounded-[14px] border border-dashed border-input px-[18px] py-3 text-[13px] text-muted-foreground">
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-full"
            style={{ backgroundColor: FALLBACK_COLOR }}
          />
          Uncategorized · {uncategorized.count}{' '}
          {uncategorized.count === 1 ? 'transaction' : 'transactions'}
        </p>
      )}

      <EditCategoryDialog category={editing} onClose={() => setEditing(null)} />
    </>
  );
}

interface CategoryRowProps {
  category: Category;
  usage: CategoryUsage | undefined;
  onEdit: () => void;
  onDelete: () => void;
}

function CategoryRow({ category, usage, onEdit, onDelete }: CategoryRowProps) {
  return (
    <li className="flex items-center gap-3.5 rounded-[14px] border border-border bg-card py-3.5 pr-3 pl-[18px]">
      <span
        aria-hidden
        className="size-3 shrink-0 rounded-full"
        style={{ backgroundColor: category.color }}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{category.name}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {usage
            ? `${usage.count.toLocaleString()} ${usage.count === 1 ? 'transaction' : 'transactions'} · ${formatAmount(usage.cents)}`
            : 'No transactions yet'}
        </p>
      </div>

      <IconButton label={`Edit ${category.name}`} className="size-[30px]" onClick={onEdit}>
        <PencilIcon />
      </IconButton>
      <IconButton
        label={`Delete ${category.name}`}
        tone="destructive"
        className="size-[30px]"
        onClick={onDelete}
      >
        <Trash2Icon />
      </IconButton>
    </li>
  );
}

/** Per-category totals over every transaction, plus whatever has no category left. */
function useUsage(
  categories: Category[],
  transactions: { categoryId: string; amountCents: number }[] | undefined,
) {
  return useMemo(() => {
    const known = new Set(categories.map((category) => category.id));
    const usage = new Map<string, CategoryUsage>();
    const uncategorized: CategoryUsage = { count: 0, cents: 0 };

    for (const transaction of transactions ?? []) {
      const entry = known.has(transaction.categoryId)
        ? (usage.get(transaction.categoryId) ?? { count: 0, cents: 0 })
        : uncategorized;
      entry.count += 1;
      entry.cents += transaction.amountCents;
      if (known.has(transaction.categoryId)) {
        usage.set(transaction.categoryId, entry);
      }
    }

    return { usage, uncategorized };
  }, [categories, transactions]);
}
