import type { DayOfWeekTotal } from '@/lib/analytics';
import { formatAmount } from '@/lib/format';
import { WEEKDAY_COLOR, WEEKEND_COLOR } from '@/lib/palette';
import { ColumnChart } from './ColumnChart';

export interface DayOfWeekChartProps {
  data: DayOfWeekTotal[];
}

/** Spending across Monday to Sunday, with the weekend set apart by color. */
export function DayOfWeekChart({ data }: DayOfWeekChartProps) {
  return (
    <ColumnChart
      height={150}
      barWidth={36}
      gap={10}
      valueClassName="text-[11px] text-muted-foreground"
      columns={data.map((day) => ({
        key: day.name,
        value: day.cents,
        valueLabel: day.cents > 0 ? compact(day.cents) : undefined,
        label: day.name,
        color: day.isWeekend ? WEEKEND_COLOR : WEEKDAY_COLOR,
        title: `${day.fullName}: ${formatAmount(day.cents)} over ${day.count} ${
          day.count === 1 ? 'purchase' : 'purchases'
        } · ${formatAmount(day.averageCents)} a day`,
      }))}
    />
  );
}

/** Whole dollars, because seven labels sit close together. */
const compact = (cents: number): string => `$${Math.round(cents / 100).toLocaleString()}`;
