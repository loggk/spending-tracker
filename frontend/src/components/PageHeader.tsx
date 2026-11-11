import type { ReactNode } from 'react';

interface PageHeaderProps {
  /** Small line above the title: the period, or a count and total. */
  eyebrow?: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="text-[13px] text-muted-foreground tabular-nums">{eyebrow}</p>}
        <h1 className="text-[26px] leading-8 font-semibold tracking-[-0.03em]">{title}</h1>
        {description && <p className="mt-1.5 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
