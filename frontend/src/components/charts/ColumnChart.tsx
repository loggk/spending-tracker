import { cn } from '@/lib/utils';

export interface Column {
  key: string;
  /** Sets the bar height, relative to the tallest column. */
  value: number;
  /** Printed above the bar; left out when there is nothing to say. */
  valueLabel?: string;
  label: string;
  caption?: string;
  color: string;
  title?: string;
}

interface ColumnChartProps {
  columns: Column[];
  height: number;
  /** Bars stay centred in their column and never grow past this. */
  barWidth: number;
  gap: number;
  valueClassName?: string;
}

/** The tallest bar leaves this much room above it for its own label. */
const FILL = 82;

/**
 * A plain column chart: a baseline, one bar per category, a value above and a
 * name below. No axis and no grid, because every bar already states its number.
 */
export function ColumnChart({ columns, height, barWidth, gap, valueClassName }: ColumnChartProps) {
  const max = Math.max(...columns.map((column) => column.value), 0);
  const grid = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
    gap: `${gap}px`,
  } as const;

  return (
    <div>
      <div className="items-end border-b border-border" style={{ ...grid, height }}>
        {columns.map((column) => (
          <div
            key={column.key}
            className="flex h-full flex-col items-center justify-end"
            title={column.title}
          >
            {column.valueLabel && (
              <span className={cn('mb-1 tabular-nums', valueClassName)}>{column.valueLabel}</span>
            )}
            <div
              className="w-full rounded-t-[3px] transition-[height] duration-300"
              style={{
                height: `${max > 0 ? (column.value / max) * FILL : 0}%`,
                maxWidth: barWidth,
                backgroundColor: column.color,
              }}
            />
          </div>
        ))}
      </div>

      <div className="pt-2" style={grid}>
        {columns.map((column) => (
          <div key={column.key} className="text-center">
            <p className="truncate text-xs font-medium">{column.label}</p>
            {column.caption && (
              <p className="truncate text-[11px] text-muted-foreground">{column.caption}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
