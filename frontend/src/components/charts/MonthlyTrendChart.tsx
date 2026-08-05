import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CategoryTotal, StackedMonthTotal } from '@/lib/analytics';
import { formatAmount } from '@/lib/format';
import { SERIES_COLOR } from '@/lib/palette';
import { ChartLegend } from './ChartLegend';
import { ChartTooltip } from './ChartTooltip';

const BAR_SIZE = 24;

const axisTick = { fill: 'var(--muted-foreground)', fontSize: 12 };

interface MonthlyTrendChartProps {
  data: StackedMonthTotal[];
  series: CategoryTotal[];
  stacked: boolean;
}

/**
 * Monthly totals, either as a single series or stacked by category. The single
 * view carries one hue and needs no legend. The stacked view names its series
 * in a legend below the chart.
 */
export function MonthlyTrendChart({ data, series, stacked }: MonthlyTrendChartProps) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={64}
            tick={axisTick}
            tickFormatter={(value: number) => `$${Math.round(value / 100).toLocaleString()}`}
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)' }}
            content={stacked ? <StackedTooltip series={series} /> : <ChartTooltip />}
          />
          {stacked ? (
            series.map((entry) => (
              <Bar
                key={entry.categoryId}
                name={entry.name}
                dataKey={(row: StackedMonthTotal) => row.totals[entry.categoryId] ?? 0}
                stackId="month"
                fill={entry.color}
                stroke="var(--background)"
                strokeWidth={1}
                barSize={BAR_SIZE}
                isAnimationActive={false}
              />
            ))
          ) : (
            <Bar
              dataKey="cents"
              fill={SERIES_COLOR}
              barSize={BAR_SIZE}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          )}
        </BarChart>
      </ResponsiveContainer>

      {stacked && (
        <ChartLegend
          items={series.map((entry) => ({
            key: entry.categoryId,
            name: entry.name,
            color: entry.color,
          }))}
        />
      )}
    </div>
  );
}

interface StackedTooltipProps {
  series: CategoryTotal[];
  active?: boolean;
  payload?: Array<{ payload: StackedMonthTotal }>;
}

/** Per-category rows for the hovered month, top of the stack first. */
function StackedTooltip({ series, active, payload }: StackedTooltipProps) {
  const month = payload?.[0]?.payload;

  if (!active || !month) {
    return null;
  }

  const parts = [...series]
    .reverse()
    .map((entry) => ({ ...entry, cents: month.totals[entry.categoryId] ?? 0 }))
    .filter((entry) => entry.cents !== 0);

  return (
    <div className="grid min-w-44 gap-1 rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="text-muted-foreground">{month.label}</p>
      {parts.map((entry) => (
        <p key={entry.categoryId} className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span>{entry.name}</span>
          <span className="ml-auto tabular-nums">{formatAmount(entry.cents)}</span>
        </p>
      ))}
      <p className="mt-0.5 flex justify-between gap-2 border-t pt-1 font-medium">
        Total <span className="tabular-nums">{formatAmount(month.cents)}</span>
      </p>
    </div>
  );
}
