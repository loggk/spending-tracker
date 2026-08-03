import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MonthTotal } from '@/lib/analytics';
import { SERIES_COLOR } from '@/lib/palette';
import { ChartTooltip } from './ChartTooltip';

const BAR_SIZE = 24;

const axisTick = { fill: 'var(--muted-foreground)', fontSize: 12 };

/**
 * Monthly totals. A single series, so it carries one hue and needs no legend —
 * the card title says what is plotted.
 */
export function MonthlyTrendChart({ data }: { data: MonthTotal[] }) {
  return (
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
        <Tooltip cursor={{ fill: 'var(--muted)' }} content={<ChartTooltip />} />
        <Bar
          dataKey="cents"
          fill={SERIES_COLOR}
          barSize={BAR_SIZE}
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
