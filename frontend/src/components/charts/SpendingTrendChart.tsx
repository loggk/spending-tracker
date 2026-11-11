import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CategoryTotal, TrendPoint } from '@/lib/analytics';
import { formatAmount, today } from '@/lib/format';
import { SERIES_COLOR } from '@/lib/palette';
import { cn } from '@/lib/utils';
import { ChartLegend } from './ChartLegend';
import { TooltipCard } from './ChartTooltip';

const PLOT_HEIGHT = 300;
/** Roughly how many x labels to print, by granularity. */
const LABEL_TARGET = { day: 7, month: 8 } as const;
/** Labels this close to today's would crowd it, so they give way. */
const LABEL_CLEARANCE = 2;

type PointState = 'past' | 'current' | 'future';

export interface SpendingTrendChartProps {
  points: TrendPoint[];
  series: CategoryTotal[];
  stacked: boolean;
}

/**
 * Spending over the whole period, by day or by month, as one series or stacked
 * by category. The period runs to its end rather than to today: the days still
 * to come are drawn as stubs, so the shape of the month stays readable.
 */
export function SpendingTrendChart({ points, series, stacked }: SpendingTrendChartProps) {
  const [active, setActive] = useState<number | null>(null);

  const now = today();
  const stateOf = (key: string): PointState => {
    const edge = now.slice(0, key.length);
    return key === edge ? 'current' : key > edge ? 'future' : 'past';
  };

  const currentIndex = points.findIndex((point) => stateOf(point.key) === 'current');
  const labels = useMemo(() => axisLabels(points, currentIndex), [points, currentIndex]);
  const gap = points.length <= 16 ? 10 : points.length <= 40 ? 4 : 2;
  const dimmed = (index: number) => active !== null && active !== index;

  // Largest at the bottom of the stack, so the eye reads the big share first.
  const stackOrder = [...series].reverse();

  return (
    <div>
      <ResponsiveContainer width="100%" height={PLOT_HEIGHT}>
        <BarChart
          data={points}
          barCategoryGap={gap}
          margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
          onMouseMove={({ activeTooltipIndex }) => {
            const index = activeTooltipIndex == null ? NaN : Number(activeTooltipIndex);
            setActive(Number.isInteger(index) ? index : null);
          }}
          onMouseLeave={() => setActive(null)}
        >
          <CartesianGrid vertical={false} stroke="var(--divider)" strokeDasharray="3 3" />
          <XAxis
            dataKey="key"
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={<AxisTick labels={labels} currentIndex={currentIndex} />}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={52}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            tickFormatter={(value: number) => `$${Math.round(value / 100).toLocaleString()}`}
          />
          <Tooltip cursor={false} content={<TrendTooltip series={stackOrder} stacked={stacked} />} />

          {stacked ? (
            stackOrder.map((entry) => (
              <Bar
                key={entry.categoryId}
                name={entry.name}
                dataKey={(point: TrendPoint) => point.totals[entry.categoryId] ?? 0}
                stackId="trend"
                fill={entry.color}
                isAnimationActive={false}
              >
                {points.map((point, index) => (
                  <Cell key={point.key} fillOpacity={dimmed(index) ? 0.55 : 1} />
                ))}
              </Bar>
            ))
          ) : (
            <Bar dataKey="cents" stackId="trend" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {points.map((point, index) => (
                <Cell
                  key={point.key}
                  // Today's bar is inked in, to mark where the period has got to.
                  fill={stateOf(point.key) === 'current' ? 'var(--foreground)' : SERIES_COLOR}
                  fillOpacity={dimmed(index) ? 0.55 : 1}
                />
              ))}
            </Bar>
          )}

          <Bar
            dataKey={() => 0}
            stackId="trend"
            isAnimationActive={false}
            shape={<FutureStub stateOf={stateOf} />}
          />
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

/**
 * Which points get an x label: an evenly spaced handful, always including
 * today, whose neighbours stand down so the two never collide.
 */
function axisLabels(points: TrendPoint[], currentIndex: number): Map<number, string> {
  const daily = (points[0]?.key.length ?? 10) === 10;
  const target = daily ? LABEL_TARGET.day : LABEL_TARGET.month;
  const sameYear = new Set(points.map((point) => point.key.slice(0, 4))).size <= 1;

  const step = Math.max(1, Math.round((points.length - 1) / Math.max(target - 1, 1)));
  const shown = new Set<number>();
  for (let index = 0; index < points.length; index += step) {
    shown.add(index);
  }
  if (currentIndex >= 0) {
    for (const index of [...shown]) {
      if (Math.abs(index - currentIndex) <= LABEL_CLEARANCE) {
        shown.delete(index);
      }
    }
    shown.add(currentIndex);
  }

  return new Map(
    [...shown].map((index) => {
      const label = points[index]?.label ?? '';
      // Monthly labels carry the year only when the series spans more than one.
      return [index, !daily && sameYear ? label.replace(/ \d+$/, '') : label];
    }),
  );
}

interface AxisTickProps {
  x?: number;
  y?: number;
  payload?: { index: number };
  labels: Map<number, string>;
  currentIndex: number;
}

function AxisTick({ x = 0, y = 0, payload, labels, currentIndex }: AxisTickProps) {
  const index = payload?.index ?? -1;
  const label = labels.get(index);

  if (!label) {
    return <g />;
  }

  const current = index === currentIndex;
  return (
    <text
      x={x}
      y={y + 12}
      textAnchor="middle"
      fontSize={11}
      fontWeight={current ? 600 : 400}
      fill={current ? 'var(--foreground)' : 'var(--muted-foreground)'}
    >
      {label}
    </text>
  );
}

interface FutureStubProps {
  x?: number;
  y?: number;
  width?: number;
  payload?: TrendPoint;
  stateOf?: (key: string) => PointState;
}

/** A hairline where a day or month of the period has not happened yet. */
function FutureStub({ x = 0, y = 0, width = 0, payload, stateOf }: FutureStubProps) {
  if (!payload || stateOf?.(payload.key) !== 'future') {
    return <g />;
  }
  return <rect x={x} y={y - 2} width={width} height={2} rx={1} fill="var(--border)" />;
}

interface TrendTooltipProps {
  series: CategoryTotal[];
  stacked: boolean;
  active?: boolean;
  payload?: Array<{ payload: TrendPoint }>;
}

function TrendTooltip({ series, stacked, active, payload }: TrendTooltipProps) {
  const point = payload?.[0]?.payload;

  if (!active || !point) {
    return null;
  }

  // Top of the stack first, matching how the bar reads downwards.
  const parts = stacked
    ? series
        .map((entry) => ({ ...entry, cents: point.totals[entry.categoryId] ?? 0 }))
        .filter((entry) => entry.cents !== 0)
        .reverse()
    : [];

  return (
    <TooltipCard>
      <p className="text-muted-foreground">{point.label}</p>

      {parts.map((entry) => (
        <p key={entry.categoryId} className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-[2px]"
            style={{ backgroundColor: entry.color }}
          />
          <span className="truncate">{entry.name}</span>
          <span className="ml-auto tabular-nums">{formatAmount(entry.cents)}</span>
        </p>
      ))}

      <p
        className={cn(
          'flex justify-between gap-2 font-semibold',
          parts.length > 0 && 'mt-0.5 border-t border-border pt-1',
        )}
      >
        {parts.length > 0 && <span>Total</span>}
        <span className="ml-auto tabular-nums">{formatAmount(point.cents)}</span>
      </p>
    </TooltipCard>
  );
}
