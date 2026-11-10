import { type FormEvent, useEffect, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import {
  DEFAULT_PURCHASE_SIZE_THRESHOLDS,
  type PurchaseSizeThresholds,
  formatThreshold,
  validateThresholds,
} from '@/lib/analytics';

interface PurchaseSizeCustomizerDialogProps {
  open: boolean;
  thresholds: PurchaseSizeThresholds;
  onSave: (thresholds: PurchaseSizeThresholds) => void;
  onClose: () => void;
}

export function PurchaseSizeCustomizerDialog({
  open,
  thresholds,
  onSave,
  onClose,
}: PurchaseSizeCustomizerDialogProps) {
  const [t1, setT1] = useState(String(thresholds[0]));
  const [t2, setT2] = useState(String(thresholds[1]));
  const [t3, setT3] = useState(String(thresholds[2]));
  const [t4, setT4] = useState(String(thresholds[3]));

  useEffect(() => {
    if (open) {
      setT1(String(thresholds[0]));
      setT2(String(thresholds[1]));
      setT3(String(thresholds[2]));
      setT4(String(thresholds[3]));
    }
  }, [open, thresholds]);

  const n1 = Number(t1);
  const n2 = Number(t2);
  const n3 = Number(t3);
  const n4 = Number(t4);

  const validated = validateThresholds([n1, n2, n3, n4]);
  const isValid = validated !== null;

  let errorMessage: string | null = null;
  if (!isValid) {
    if (
      Number.isNaN(n1) ||
      Number.isNaN(n2) ||
      Number.isNaN(n3) ||
      Number.isNaN(n4) ||
      n1 <= 0 ||
      n2 <= 0 ||
      n3 <= 0 ||
      n4 <= 0
    ) {
      errorMessage = 'All cutoffs must be positive numbers greater than $0.';
    } else if (n2 <= n1 || n3 <= n2 || n4 <= n3) {
      errorMessage = 'Cutoffs must be strictly increasing (Micro < Small < Medium < Large).';
    } else {
      errorMessage = 'Please enter valid threshold cutoffs.';
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!validated) {
      return;
    }
    onSave(validated);
    toast.success('Purchase brackets updated');
    onClose();
  }

  function handleReset() {
    setT1(String(DEFAULT_PURCHASE_SIZE_THRESHOLDS[0]));
    setT2(String(DEFAULT_PURCHASE_SIZE_THRESHOLDS[1]));
    setT3(String(DEFAULT_PURCHASE_SIZE_THRESHOLDS[2]));
    setT4(String(DEFAULT_PURCHASE_SIZE_THRESHOLDS[3]));
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Purchase size brackets</DialogTitle>
          <DialogDescription>
            Customize the dollar cutoffs that divide your purchases into size brackets to match your
            income and spending habits.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="cutoff-micro">Micro / Small cutoff ($)</Label>
              <Input
                id="cutoff-micro"
                type="number"
                step="any"
                min="0.01"
                value={t1}
                onChange={(e) => setT1(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cutoff-small">Small / Medium cutoff ($)</Label>
              <Input
                id="cutoff-small"
                type="number"
                step="any"
                min="0.01"
                value={t2}
                onChange={(e) => setT2(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cutoff-medium">Medium / Large cutoff ($)</Label>
              <Input
                id="cutoff-medium"
                type="number"
                step="any"
                min="0.01"
                value={t3}
                onChange={(e) => setT3(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cutoff-large">Large / Major cutoff ($)</Label>
              <Input
                id="cutoff-large"
                type="number"
                step="any"
                min="0.01"
                value={t4}
                onChange={(e) => setT4(e.target.value)}
              />
            </div>
          </div>

          {errorMessage && <p className="text-xs text-destructive">{errorMessage}</p>}

          {isValid && (
            <div className="rounded-lg border bg-muted/40 p-3 text-xs">
              <p className="mb-1.5 font-medium text-muted-foreground">Resulting size brackets:</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
                <div>
                  <span className="font-medium text-foreground">Micro:</span> &lt;
                  {formatThreshold(n1)}
                </div>
                <div>
                  <span className="font-medium text-foreground">Small:</span> {formatThreshold(n1)}–
                  {formatThreshold(n2)}
                </div>
                <div>
                  <span className="font-medium text-foreground">Medium:</span> {formatThreshold(n2)}
                  –{formatThreshold(n3)}
                </div>
                <div>
                  <span className="font-medium text-foreground">Large:</span> {formatThreshold(n3)}–
                  {formatThreshold(n4)}
                </div>
                <div>
                  <span className="font-medium text-foreground">Major:</span> &gt;
                  {formatThreshold(n4)}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
              Reset to defaults
            </Button>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!isValid}>
                Save brackets
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
