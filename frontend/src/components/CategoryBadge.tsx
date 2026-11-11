import type { Category } from '@spending-tracker/shared';
import { FALLBACK_COLOR } from '@/lib/palette';
import { cn } from '@/lib/utils';

export interface CategoryBadgeProps {
  category: Category | undefined;
  className?: string;
  variant?: 'plain' | 'pill';
}

export function CategoryBadge({ category, className, variant = 'plain' }: CategoryBadgeProps) {
  if (variant === 'pill') {
    return (
      <span
        className={cn(
          'inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2 py-0.5 text-xs font-medium text-foreground',
          className,
        )}
      >
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: category?.color ?? FALLBACK_COLOR }}
        />
        <span className="truncate">{category?.name ?? 'Uncategorized'}</span>
      </span>
    );
  }

  if (!category) {
    return (
      <span className={cn('text-[13px] text-muted-foreground', className)}>Uncategorized</span>
    );
  }

  return (
    <span className={cn('flex min-w-0 items-center gap-2 text-[13px]', className)}>
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: category.color }}
      />
      <span className="truncate">{category.name}</span>
    </span>
  );
}
