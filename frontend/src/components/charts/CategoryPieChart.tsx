import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { CategoryTotal } from '@/lib/analytics';
import { formatAmount } from '@/lib/format';
import { ChartTooltip } from './ChartTooltip';

/**
 * The donut view of spending by category. The ring shows the shares; the list
 * beside it carries the exact numbers, so no slice needs its own label.
 */
export function CategoryPieChart({ data }: { data: CategoryTotal[] }) {
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Tooltip content={<ChartTooltip nameKey="name" />} />
          <Pie
            data={data}
            dataKey="cents"
            nameKey="name"
            innerRadius="55%"
            outerRadius="90%"
            stroke="var(--background)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((entry) => (
              <Cell key={entry.categoryId} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      <ul className="grid gap-1.5 text-sm">
        {data.map((entry) => (
          <li key={entry.categoryId} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="truncate">{entry.name}</span>
            <span className="ml-auto text-muted-foreground tabular-nums">
              {formatAmount(entry.cents)} · {Math.round(entry.share * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
