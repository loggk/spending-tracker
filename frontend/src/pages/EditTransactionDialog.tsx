import { type FormEvent, useEffect, useState } from 'react';
import type { Category, Transaction } from '@spending-tracker/shared';
import { toast } from 'sonner';
import { CategorySelect } from '@/components/CategorySelect';
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
import { parseAmountToCents } from '@/lib/format';
import { useUpdateTransaction } from '@/lib/queries';

interface EditTransactionDialogProps {
  transaction: Transaction | null;
  categories: Category[];
  onClose: () => void;
}

export function EditTransactionDialog({
  transaction,
  categories,
  onClose,
}: EditTransactionDialogProps) {
  const [draft, setDraft] = useState({ date: '', amount: '', description: '', categoryId: '' });
  const updateTransaction = useUpdateTransaction();

  useEffect(() => {
    if (transaction) {
      setDraft({
        date: transaction.date,
        amount: (transaction.amountCents / 100).toFixed(2),
        description: transaction.description,
        categoryId: transaction.categoryId,
      });
    }
  }, [transaction]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!transaction) {
      return;
    }

    const amountCents = parseAmountToCents(draft.amount);
    if (amountCents === null) {
      toast.error('Enter an amount like 12.99');
      return;
    }

    updateTransaction.mutate(
      {
        id: transaction.id,
        date: draft.date,
        amountCents,
        description: draft.description.trim(),
        categoryId: draft.categoryId,
      },
      {
        onSuccess: () => {
          toast.success('Transaction updated');
          onClose();
        },
        onError: (error: Error) => toast.error(error.message),
      },
    );
  }

  return (
    <Dialog open={transaction !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit transaction</DialogTitle>
          <DialogDescription>Update the details and save your changes.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-date">Date</Label>
            <Input
              id="edit-date"
              type="date"
              required
              value={draft.date}
              onChange={(event) => setDraft({ ...draft, date: event.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-amount">Amount</Label>
            <Input
              id="edit-amount"
              inputMode="decimal"
              required
              value={draft.amount}
              onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-description">Description</Label>
            <Input
              id="edit-description"
              required
              maxLength={200}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-category">Category</Label>
            <CategorySelect
              id="edit-category"
              categories={categories}
              value={draft.categoryId}
              onChange={(categoryId) => setDraft({ ...draft, categoryId })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateTransaction.isPending}>
              {updateTransaction.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
