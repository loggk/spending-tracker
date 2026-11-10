import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DayOfWeekTotal } from '@/lib/analytics';
import { formatAmount } from '@/lib/format';
import { CATEGORY_COLORS, SERIES_COLOR } from '@/lib/palette';
import { WIDE_SCREEN, useMediaQuery } from '@/lib/use-media-query';

const WEEKEND_COLOR = CATEGORY_COLORS[1]; // orange
const WEEKDAY_COLOR = SERIES_COLOR; // blue
const BAR_SIZE = 36;
const axisTick = { fill: 'var(--muted-foreground)', fontSize: 12 };

export interface DayOfWeekChartProps {
  data: DayOfWeekTotal[];
  metric?: 'cents' | 'averageCents';
}

/**
 * Bar chart plotting spending across Monday through Sunday.
 * Distinguishes weekdays from weekends with distinct palette colors.
 */
export function DayOfWeekChart({ data, metric = 'cents' }: DayOfWeekChartProps) {
  const wide = useMediaQuery(WIDE_SCREEN);

  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={data}
          maxBarSize={BAR_SIZE}
          margin={{
            top: 18,
            right: wide ? 16 : 8,
            bottom: 12,
            left: wide ? 8 : 4,
          }}
        >
          <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={axisTick} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={wide ? 64 : 48}
            tick={axisTick}
            domain={[0, (dataMax: number) => (dataMax <= 0 ? 1000 : Math.ceil(dataMax * 1.18))]}
            tickFormatter={(value: number) => `$${Math.round(value / 100).toLocaleString()}`}
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)' }}
            content={<DayOfWeekTooltip metric={metric} />}
          />
          <Bar
            dataKey={metric}
            maxBarSize={BAR_SIZE}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          >
            {data.map((entry) => (
              <Cell key={entry.dayIndex} fill={entry.isWeekend ? WEEKEND_COLOR : WEEKDAY_COLOR} />
            ))}
            <LabelList
              dataKey={metric}
              position="top"
              offset={6}
              formatter={(value) => {
                const num = Number(value);
                if (!num || num <= 0) {
                  return '';
                }
                return wide ? formatAmount(num) : `$${Math.round(num / 100).toLocaleString()}`;
              }}
              style={{
                fill: 'var(--muted-foreground)',
                fontSize: wide ? 12 : 11,
                fontVariantNumeric: 'tabular-nums',
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface DayOfWeekTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DayOfWeekTotal }>;
  metric?: 'cents' | 'averageCents';
}

function DayOfWeekTooltip({ active, payload }: DayOfWeekTooltipProps) {
  const day = payload?.[0]?.payload;

  if (!active || !day) {
    return null;
  }

  const sharePct = Math.round(day.share * 100);

  return (
    <div className="grid min-w-44 gap-1.5 rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-foreground">{day.fullName}</p>
        <span
          className="rounded px-1.5 py-0.5 text-[11px] font-medium"
          style={{
            backgroundColor: day.isWeekend
              ? 'color-mix(in oklch, #eb6834 15%, transparent)'
              : 'color-mix(in oklch, #2a78d6 15%, transparent)',
            color: day.isWeekend ? '#eb6834' : '#2a78d6',
          }}
        >
          {day.isWeekend ? 'Weekend' : 'Weekday'}
        </span>
      </div>

      <div className="grid gap-1 border-t pt-1.5 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Total spent</span>
          <span className="font-medium tabular-nums">
            {formatAmount(day.cents)} <span className="text-muted-foreground">({sharePct}%)</span>
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Daily average</span>
          <span className="font-medium tabular-nums">
            {formatAmount(day.averageCents)}
            {day.dayCount > 0 && <span className="text-muted-foreground font-normal"> / day</span>}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Transactions</span>
          <span className="font-medium tabular-nums">
            {day.count} purchase{day.count === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    </div>
  );
}
