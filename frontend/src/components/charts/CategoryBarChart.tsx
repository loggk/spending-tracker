import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CategoryTotal } from '@/lib/analytics';
import { formatAmount } from '@/lib/format';
import { ChartTooltip } from './ChartTooltip';

const BAR_SIZE = 20;
const ROW_HEIGHT = 40;

/**
 * Horizontal bars, one per category, largest first.
 */
export function CategoryBarChart({ data }: { data: CategoryTotal[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(data.length * ROW_HEIGHT, 120)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 72, bottom: 4, left: 4 }}
        barCategoryGap={8}
      >
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={140}
          tickLine={false}
          axisLine={false}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 13 }}
        />
        <Tooltip cursor={{ fill: 'var(--muted)' }} content={<ChartTooltip nameKey="name" />} />
        <Bar dataKey="cents" barSize={BAR_SIZE} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {data.map((entry) => (
            <Cell key={entry.categoryId} fill={entry.color} />
          ))}
          <LabelList
            dataKey="cents"
            position="right"
            offset={10}
            formatter={(value) => formatAmount(Number(value))}
            style={{ fill: 'var(--foreground)', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
