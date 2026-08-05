import { type FormEvent, useState } from 'react';
import type { Category } from '@spending-tracker/shared';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { ColorInput } from '@/components/ColorInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CATEGORY_COLORS } from '@/lib/palette';
import { useCategories, useCreateCategory, useDeleteCategory } from '@/lib/queries';
import { EditCategoryDialog } from './EditCategoryDialog';

export function Categories() {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0]);
  const [editing, setEditing] = useState<Category | null>(null);

  const categories = useCategories();
  const createCategory = useCreateCategory();
  const deleteCategory = useDeleteCategory();

  function handleAdd(event: FormEvent) {
    event.preventDefault();

    createCategory.mutate(
      { name: name.trim(), color },
      {
        onSuccess: () => {
          setName('');
          toast.success('Category added');
        },
        onError: (error: Error) => toast.error(error.message),
      },
    );
  }

  function handleDelete(category: Category) {
    deleteCategory.mutate(category.id, {
      onSuccess: () => toast.success(`Deleted ${category.name}`),
      onError: (error: Error) => toast.error(error.message),
    });
  }

  const rows = categories.data ?? [];

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Group your spending. Deleting a category leaves its transactions uncategorized.
        </p>
      </div>

      <form
        onSubmit={handleAdd}
        className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="name" className="text-xs text-muted-foreground">
            Name
          </Label>
          <Input
            id="name"
            placeholder="Groceries"
            required
            maxLength={50}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="color" className="text-xs text-muted-foreground">
            Color
          </Label>
          <ColorInput id="color" value={color} onChange={setColor} />
        </div>

        <Button type="submit" disabled={createCategory.isPending}>
          {createCategory.isPending ? 'Adding…' : 'Add category'}
        </Button>
      </form>

      {categories.isPending && <Placeholder>Loading categories…</Placeholder>}
      {categories.isError && (
        <Placeholder>Could not load categories: {categories.error.message}</Placeholder>
      )}

      {categories.isSuccess &&
        (rows.length === 0 ? (
          <Placeholder>No categories yet. Add one above to get started.</Placeholder>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {rows.map((category) => (
              <li key={category.id} className="flex items-center gap-3 rounded-lg border px-4 py-3">
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: category.color }}
                />
                <span className="font-medium">{category.name}</span>
                <div className="ml-auto flex gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${category.name}`}
                    onClick={() => setEditing(category)}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${category.name}`}
                    onClick={() => handleDelete(category)}
                    disabled={deleteCategory.isPending}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ))}

      <EditCategoryDialog category={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
