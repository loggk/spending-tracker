import type { ReactNode } from 'react';
import { formatAmount } from '@/lib/format';

/** The surface every chart tooltip sits on. */
export function TooltipCard({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-w-44 gap-1 rounded-xl border border-border bg-popover px-3 py-2 text-[13px] shadow-popover">
      {children}
    </div>
  );
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: { cents: number } }>;
  label?: string;
  nameKey?: 'name' | 'label';
}

export function ChartTooltip({ active, payload, label, nameKey = 'label' }: ChartTooltipProps) {
  const point = payload?.[0]?.payload as ({ cents: number } & Record<string, unknown>) | undefined;

  if (!active || !point) {
    return null;
  }

  const title = typeof point[nameKey] === 'string' ? point[nameKey] : label;

  return (
    <TooltipCard>
      <p className="text-muted-foreground">{title}</p>
      <p className="font-medium tabular-nums">{formatAmount(point.cents)}</p>
    </TooltipCard>
  );
}
