import type { PurchaseSizeBucket } from '@/lib/analytics';
import { formatAmount } from '@/lib/format';
import { SERIES_COLOR } from '@/lib/palette';
import { ColumnChart } from './ColumnChart';

export interface PurchaseSizeHistogramProps {
  data: PurchaseSizeBucket[];
  metric: 'count' | 'cents';
}

/**
 * How purchases spread across the size brackets, either by how often they
 * happen or by what they add up to.
 */
export function PurchaseSizeHistogram({ data, metric }: PurchaseSizeHistogramProps) {
  return (
    <ColumnChart
      height={150}
      barWidth={44}
      gap={14}
      valueClassName="text-xs font-medium"
      columns={data.map((bucket) => ({
        key: bucket.key,
        value: bucket[metric],
        valueLabel: bucket[metric] > 0 ? formatValue(bucket, metric) : undefined,
        label: bucket.name,
        caption: bucket.rangeLabel,
        color: SERIES_COLOR,
        title: `${bucket.count} ${bucket.count === 1 ? 'purchase' : 'purchases'} (${Math.round(bucket.countShare * 100)}%) · ${formatAmount(bucket.cents)}`,
      }))}
    />
  );
}

const formatValue = (bucket: PurchaseSizeBucket, metric: 'count' | 'cents'): string =>
  metric === 'count' ? String(bucket.count) : formatAmount(bucket.cents);
