import { formatAmount } from '@/lib/format';

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: { cents: number }; name?: string }>;
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
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="text-muted-foreground">{title}</p>
      <p className="font-medium tabular-nums">{formatAmount(point.cents)}</p>
    </div>
  );
}
