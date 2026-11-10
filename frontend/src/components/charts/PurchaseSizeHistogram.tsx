import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PurchaseSizeBucket } from '@/lib/analytics';
import { formatAmount } from '@/lib/format';
import { SERIES_COLOR } from '@/lib/palette';
import { WIDE_SCREEN, useMediaQuery } from '@/lib/use-media-query';

const BAR_SIZE = 36;
const axisTick = { fill: 'var(--muted-foreground)', fontSize: 12 };

export interface PurchaseSizeHistogramProps {
  data: PurchaseSizeBucket[];
  metric: 'count' | 'cents';
}

/**
 * Distribution of purchases across size brackets (Micro, Small, Medium, Large, Major).
 * Renders either transaction count (frequency) or total dollars (financial impact).
 */
export function PurchaseSizeHistogram({ data, metric }: PurchaseSizeHistogramProps) {
  const wide = useMediaQuery(WIDE_SCREEN);

  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={data}
          maxBarSize={BAR_SIZE}
          margin={{
            top: 18,
            right: wide ? 16 : 8,
            bottom: wide ? 36 : 32,
            left: wide ? 8 : 4,
          }}
        >
          <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={<HistogramTick data={data} wide={wide} />}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={wide ? (metric === 'cents' ? 64 : 40) : metric === 'cents' ? 48 : 32}
            tick={axisTick}
            allowDecimals={metric === 'cents'}
            domain={[
              0,
              (dataMax: number) =>
                dataMax <= 0 ? (metric === 'cents' ? 1000 : 1) : Math.ceil(dataMax * 1.18),
            ]}
            tickFormatter={(value: number) =>
              metric === 'cents'
                ? `$${Math.round(value / 100).toLocaleString()}`
                : String(Math.round(value))
            }
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)' }}
            content={<HistogramTooltip metric={metric} />}
          />
          <Bar
            dataKey={metric}
            fill={SERIES_COLOR}
            maxBarSize={BAR_SIZE}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          >
            <LabelList
              dataKey={metric}
              position="top"
              offset={6}
              formatter={(value) => {
                const num = Number(value);
                if (!num || num <= 0) {
                  return '';
                }
                if (metric === 'count') {
                  return String(num);
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

interface HistogramTickProps {
  x?: number;
  y?: number;
  payload?: { value: string; index: number };
  data?: PurchaseSizeBucket[];
  wide?: boolean;
}

function HistogramTick({ x = 0, y = 0, payload, data = [], wide = false }: HistogramTickProps) {
  const index = payload?.index ?? -1;
  const bucket = data[index] ?? data.find((entry) => entry.name === payload?.value);

  if (!bucket) {
    return null;
  }

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={14}
        textAnchor="middle"
        fill="var(--foreground)"
        fontSize={wide ? 12 : 11}
        fontWeight={500}
      >
        {bucket.name}
      </text>
      <text
        x={0}
        y={wide ? 30 : 27}
        textAnchor="middle"
        fill="var(--muted-foreground)"
        fontSize={wide ? 11 : 10}
      >
        {bucket.rangeLabel}
      </text>
    </g>
  );
}

interface HistogramTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: PurchaseSizeBucket }>;
  metric?: 'count' | 'cents';
}

function HistogramTooltip({ active, payload }: HistogramTooltipProps) {
  const bucket = payload?.[0]?.payload;

  if (!active || !bucket) {
    return null;
  }

  const countPct = Math.round(bucket.countShare * 100);
  const centsPct = Math.round(bucket.centsShare * 100);
  const avgCents = bucket.count > 0 ? Math.round(bucket.cents / bucket.count) : 0;

  return (
    <div className="grid min-w-44 gap-1.5 rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <div>
        <p className="font-medium text-foreground">
          {bucket.name}{' '}
          <span className="text-xs text-muted-foreground">({bucket.rangeLabel})</span>
        </p>
      </div>
      <div className="grid gap-1 border-t pt-1.5 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Transactions</span>
          <span className="font-medium tabular-nums">
            {bucket.count} <span className="text-muted-foreground">({countPct}%)</span>
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Total spent</span>
          <span className="font-medium tabular-nums">
            {formatAmount(bucket.cents)}{' '}
            <span className="text-muted-foreground">({centsPct}%)</span>
          </span>
        </div>
        {bucket.count > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Average purchase</span>
            <span className="font-medium tabular-nums">{formatAmount(avgCents)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
