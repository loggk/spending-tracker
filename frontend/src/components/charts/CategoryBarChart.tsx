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
import { WIDE_SCREEN, useMediaQuery } from '@/lib/use-media-query';
import { ChartTooltip } from './ChartTooltip';

const BAR_SIZE = 20;
const ROW_HEIGHT = 40;

/**
 * Horizontal bars, one per category, largest first. Names and amounts take fixed
 * room on either side, so a phone gives them less and leaves the bars readable.
 */
export function CategoryBarChart({ data }: { data: CategoryTotal[] }) {
  const wide = useMediaQuery(WIDE_SCREEN);

  return (
    <ResponsiveContainer width="100%" height={Math.max(data.length * ROW_HEIGHT, 120)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: wide ? 72 : 58, bottom: 4, left: 4 }}
        barCategoryGap={8}
      >
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={wide ? 140 : 88}
          tickLine={false}
          axisLine={false}
          tick={{ fill: 'var(--muted-foreground)', fontSize: wide ? 13 : 12 }}
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
            style={{
              fill: 'var(--foreground)',
              fontSize: wide ? 13 : 12,
              fontVariantNumeric: 'tabular-nums',
            }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
