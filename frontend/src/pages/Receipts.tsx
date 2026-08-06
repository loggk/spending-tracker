import { type ChangeEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CategorySelect } from '@/components/CategorySelect';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatAmount, parseAmountToCents, today } from '@/lib/format';
import { useCategories, useConfirmReceipt, useReceipt, useUploadReceipt } from '@/lib/queries';

interface DraftItem {
  include: boolean;
  description: string;
  amount: string;
  categoryId: string;
}

export function Receipts() {
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [items, setItems] = useState<DraftItem[]>([]);

  const categories = useCategories();
  const upload = useUploadReceipt();
  const receipt = useReceipt(receiptId);
  const confirm = useConfirmReceipt();

  const categoryList = categories.data ?? [];
  const parsed = receipt.data?.status === 'parsed' ? receipt.data : null;

  // Seed the editable rows once the model has finished reading the image.
  useEffect(() => {
    if (!parsed?.items) {
      return;
    }

    setDate(parsed.date ?? today());
    setItems(
      parsed.items.map((item) => ({
        include: true,
        description: item.description,
        amount: (item.amountCents / 100).toFixed(2),
        categoryId: item.suggestedCategoryId ?? '',
      })),
    );
  }, [parsed]);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setItems([]);
    upload.mutate(file, {
      onSuccess: setReceiptId,
      onError: (cause: Error) => toast.error(cause.message),
    });
  }

  function update(index: number, patch: Partial<DraftItem>) {
    setItems((current) =>
      current.map((item, position) => (position === index ? { ...item, ...patch } : item)),
    );
  }

  function handleConfirm() {
    if (!receiptId) {
      return;
    }

    const selected = items.filter((item) => item.include);
    const missingCategory = selected.some((item) => item.categoryId === '');
    if (missingCategory) {
      toast.error('Give every selected item a category');
      return;
    }

    const converted = selected.flatMap((item) => {
      const amountCents = parseAmountToCents(item.amount);
      return amountCents === null
        ? []
        : [
            {
              date,
              amountCents,
              description: item.description.trim(),
              categoryId: item.categoryId,
            },
          ];
    });

    if (converted.length !== selected.length) {
      toast.error('Some amounts could not be read');
      return;
    }

    confirm.mutate(
      { receiptId, items: converted },
      {
        onSuccess: () => {
          toast.success(`Added ${converted.length} transactions`);
          setReceiptId(null);
          setItems([]);
        },
        onError: (cause: Error) => toast.error(cause.message),
      },
    );
  }

  const selectedTotal = items
    .filter((item) => item.include)
    .reduce((sum, item) => sum + (parseAmountToCents(item.amount) ?? 0), 0);

  if (categories.isSuccess && categoryList.length === 0) {
    return (
      <Placeholder>
        Add a category before scanning receipts.{' '}
        <Link to="/categories" className="underline underline-offset-4">
          Create one
        </Link>
        .
      </Placeholder>
    );
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Scan a receipt</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a photo and each line item is read out and categorized for you to review.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Receipt image</CardTitle>
          <CardDescription>JPEG, PNG or WebP.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFile}
            disabled={upload.isPending || receipt.data?.status === 'processing'}
          />
          {upload.isPending && <Status>Uploading…</Status>}
          {receipt.data?.status === 'processing' && <Status>Reading the receipt…</Status>}
          {receipt.data?.status === 'failed' && (
            <p className="text-sm text-destructive">{receipt.data.error}</p>
          )}
        </CardContent>
      </Card>

      {parsed && items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              {parsed.merchant ?? 'Review items'}
            </CardTitle>
            <CardDescription>
              Uncheck anything you do not want, then add them to your transactions.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid max-w-48 gap-1.5">
              <Label htmlFor="receipt-date" className="text-xs text-muted-foreground">
                Date
              </Label>
              <Input
                id="receipt-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>

            <ul className="grid gap-2">
              {items.map((item, index) => (
                <li
                  key={index}
                  className="grid grid-cols-[auto_1fr] items-center gap-2 rounded-md border p-2 sm:grid-cols-[auto_1fr_7rem_11rem]"
                >
                  <input
                    type="checkbox"
                    aria-label={`Include ${item.description}`}
                    checked={item.include}
                    onChange={(event) => update(index, { include: event.target.checked })}
                    className="size-4"
                  />
                  <Input
                    aria-label="Description"
                    value={item.description}
                    onChange={(event) => update(index, { description: event.target.value })}
                  />
                  {/* Amount and category share a line under the description on a phone;
                      `contents` drops this wrapper so they rejoin the grid on wider screens. */}
                  <div className="col-start-2 flex gap-2 sm:contents">
                    <Input
                      aria-label="Amount"
                      inputMode="decimal"
                      className="w-24 sm:w-auto"
                      value={item.amount}
                      onChange={(event) => update(index, { amount: event.target.value })}
                    />
                    <CategorySelect
                      categories={categoryList}
                      value={item.categoryId}
                      onChange={(categoryId) => update(index, { categoryId })}
                    />
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground tabular-nums">
                {items.filter((item) => item.include).length} selected ·{' '}
                {formatAmount(selectedTotal)}
              </p>
              <Button onClick={handleConfirm} disabled={confirm.isPending}>
                {confirm.isPending ? 'Adding…' : 'Add to transactions'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Status({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
