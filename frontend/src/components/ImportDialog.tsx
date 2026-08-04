import { type ChangeEvent, useState } from 'react';
import type { Category } from '@spending-tracker/shared';
import Papa from 'papaparse';
import { toast } from 'sonner';
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
import { MISSING_COLUMNS, type ParseResult, detectColumns, parseRows, toRequests } from '@/lib/csv';
import { formatAmount } from '@/lib/format';
import { CATEGORY_COLORS } from '@/lib/palette';
import { useCreateCategory, useImportTransactions } from '@/lib/queries';

interface ImportDialogProps {
  open: boolean;
  categories: Category[];
  onClose: () => void;
}

interface Preview extends ParseResult {
  filename: string;
  /** Names in the file that do not match an existing category. */
  newCategories: string[];
}

export function ImportDialog({ open, categories, onClose }: ImportDialogProps) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const createCategory = useCreateCategory();
  const importTransactions = useImportTransactions();

  function reset() {
    setPreview(null);
    setError(null);
    onClose();
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setError(null);
    setPreview(null);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        const columns = detectColumns(headers);
        const missing = MISSING_COLUMNS(columns);

        if (missing.length > 0) {
          setError(
            `This file is missing a ${missing.join(', ')} column. Found: ${headers.join(', ') || 'nothing'}.`,
          );
          return;
        }

        const parsed = parseRows(results.data, columns);
        const existing = new Set(categories.map((category) => category.name.toLowerCase()));

        setPreview({
          ...parsed,
          filename: file.name,
          newCategories: parsed.categoryNames.filter((name) => !existing.has(name.toLowerCase())),
        });
      },
      error: (cause: Error) => setError(cause.message),
    });
  }

  async function handleImport() {
    if (!preview) {
      return;
    }

    setImporting(true);
    try {
      // Categories must exist before transactions can reference them.
      const created: Category[] = [];
      for (const [index, name] of preview.newCategories.entries()) {
        // Walk the palette in order so imported categories get distinct colors.
        const color =
          CATEGORY_COLORS[(categories.length + index) % CATEGORY_COLORS.length] ??
          CATEGORY_COLORS[0];
        created.push(await createCategory.mutateAsync({ name, color }));
      }

      const requests = toRequests(preview.rows, [...categories, ...created]);
      if (requests.length === 0) {
        toast.error('Nothing to import');
        return;
      }

      await importTransactions.mutateAsync(requests);
      toast.success(
        `Imported ${requests.length} transaction${requests.length === 1 ? '' : 's'}` +
          (created.length > 0 ? ` and created ${created.length} categories` : ''),
      );
      reset();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  const total = formatAmount(preview?.rows.reduce((sum, row) => sum + row.amountCents, 0) ?? 0);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && reset()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import transactions</DialogTitle>
          <DialogDescription>
            Choose a CSV with Date, Amount, Description and Category columns. A Month column is
            ignored.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <Input type="file" accept=".csv,text/csv" onChange={handleFile} />

          {error && <p className="text-sm text-destructive">{error}</p>}

          {preview && (
            <div className="grid gap-3 text-sm">
              <div className="rounded-md border p-3">
                <p className="font-medium">{preview.filename}</p>
                <p className="text-muted-foreground">
                  {preview.rows.length} transaction{preview.rows.length === 1 ? '' : 's'} totalling{' '}
                  {total}
                </p>
              </div>

              {preview.newCategories.length > 0 && (
                <div className="rounded-md border p-3">
                  <p className="font-medium">
                    {preview.newCategories.length} new categor
                    {preview.newCategories.length === 1 ? 'y' : 'ies'} will be created
                  </p>
                  <p className="text-muted-foreground">{preview.newCategories.join(', ')}</p>
                </div>
              )}

              {preview.rejected.length > 0 && (
                <div className="rounded-md border border-destructive/40 p-3">
                  <p className="font-medium text-destructive">
                    {preview.rejected.length} row{preview.rejected.length === 1 ? '' : 's'} will be
                    skipped
                  </p>
                  <ul className="mt-1 grid gap-0.5 text-muted-foreground">
                    {preview.rejected.slice(0, 5).map((row) => (
                      <li key={row.line}>
                        Line {row.line}: {row.reason}
                      </li>
                    ))}
                    {preview.rejected.length > 5 && <li>and {preview.rejected.length - 5} more</li>}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={reset}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleImport()}
            disabled={!preview || preview.rows.length === 0 || importing}
          >
            {importing ? 'Importing…' : `Import ${preview?.rows.length ?? 0}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
