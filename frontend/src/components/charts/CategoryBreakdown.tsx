import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import type { CategoryTotal } from '@/lib/analytics';
import { formatAmount } from '@/lib/format';

export type CategoryView = 'bar' | 'pie';

interface CategoryBreakdownProps {
  data: CategoryTotal[];
  view: CategoryView;
}

/**
 * Spending per category as either a list of bars or a donut above the same
 * list. Both views share one row, so the numbers never drift apart.
 */
export function CategoryBreakdown({ data, view }: CategoryBreakdownProps) {
  const max = Math.max(...data.map((entry) => entry.cents), 1);

  return (
    <div className="grid gap-3.5">
      {view === 'pie' && <Donut data={data} />}

      {data.map((entry) => (
        <div key={entry.categoryId} className="grid gap-1.5">
          <div className="flex items-center gap-2 text-[13px]">
            {view === 'pie' && (
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
            )}
            <span className="truncate">{entry.name}</span>
            <span className="ml-auto font-medium tabular-nums">{formatAmount(entry.cents)}</span>
            <span className="w-[34px] shrink-0 text-right text-muted-foreground tabular-nums">
              {Math.round(entry.share * 100)}%
            </span>
          </div>

          {view === 'bar' && (
            <div className="h-1.5 overflow-hidden rounded-[3px] bg-muted">
              <div
                className="h-full rounded-[3px] transition-[width] duration-300"
                style={{
                  width: `${(entry.cents / max) * 100}%`,
                  backgroundColor: entry.color,
                }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Donut({ data }: { data: CategoryTotal[] }) {
  const total = data.reduce((sum, entry) => sum + entry.cents, 0);

  return (
    <div className="relative mx-auto size-[180px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="cents"
            nameKey="name"
            innerRadius={64}
            outerRadius={90}
            stroke="var(--card)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((entry) => (
              <Cell key={entry.categoryId} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[11px] text-muted-foreground">
          {data.length} {data.length === 1 ? 'category' : 'categories'}
        </span>
        <span className="text-lg font-semibold tabular-nums">{formatAmount(total)}</span>
      </div>
    </div>
  );
}
