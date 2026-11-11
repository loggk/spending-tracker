import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** The one dashed box used for loading, error and nothing-here states. */
export function EmptyState({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-dashed border-input p-10 text-center text-sm text-muted-foreground',
        className,
      )}
    >
      {children}
    </div>
  );
}
