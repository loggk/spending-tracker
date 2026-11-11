import { useCallback, useState } from 'react';
import { toast } from 'sonner';

const UNDO_WINDOW_MS = 5000;

/**
 * Hides a row immediately but only sends the delete once the toast closes, so
 * "Undo" costs nothing: the record was never removed, and it keeps its id.
 * Dismissing the toast by hand cancels the delete for the same reason.
 */
export function useUndoableDelete(remove: (id: string) => void, message: string) {
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());

  const settle = useCallback(
    (id: string, confirmed: boolean) => {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      if (confirmed) {
        remove(id);
      }
    },
    [remove],
  );

  const requestDelete = useCallback(
    (id: string) => {
      setPendingIds((current) => new Set(current).add(id));
      toast(message, {
        duration: UNDO_WINDOW_MS,
        action: { label: 'Undo', onClick: () => undefined },
        onAutoClose: () => settle(id, true),
        onDismiss: () => settle(id, false),
      });
    },
    [message, settle],
  );

  return { pendingIds, requestDelete };
}
