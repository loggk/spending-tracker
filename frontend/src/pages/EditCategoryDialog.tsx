import { type FormEvent, useEffect, useState } from 'react';
import type { Category } from '@spending-tracker/shared';
import { toast } from 'sonner';
import { ColorInput } from '@/components/ColorInput';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUpdateCategory } from '@/lib/queries';

interface EditCategoryDialogProps {
  category: Category | null;
  onClose: () => void;
}

export function EditCategoryDialog({ category, onClose }: EditCategoryDialogProps) {
  const [draft, setDraft] = useState({ name: '', color: '#000000' });
  const updateCategory = useUpdateCategory();

  useEffect(() => {
    if (category) {
      setDraft({ name: category.name, color: category.color });
    }
  }, [category]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!category) {
      return;
    }

    updateCategory.mutate(
      { id: category.id, name: draft.name.trim(), color: draft.color },
      {
        onSuccess: () => {
          toast.success('Category updated');
          onClose();
        },
        onError: (error: Error) => toast.error(error.message),
      },
    );
  }

  return (
    <Dialog open={category !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit category</DialogTitle>
          <DialogDescription>Rename it or pick a new color.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-category-name">Name</Label>
            <Input
              id="edit-category-name"
              required
              maxLength={50}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-category-color">Color</Label>
            <ColorInput
              id="edit-category-color"
              value={draft.color}
              onChange={(color) => setDraft({ ...draft, color })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateCategory.isPending}>
              {updateCategory.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
