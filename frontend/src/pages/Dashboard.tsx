import { useMemo, useState } from 'react';
import type { Category, Transaction } from '@spending-tracker/shared';
import {
  ArrowUpRightIcon,
  CalendarIcon,
  ChartBarIcon,
  ChartColumnIcon,
  ChartColumnStackedIcon,
  ChartPieIcon,
  DollarSignIcon,
  HashIcon,
  SlidersHorizontalIcon,
} from 'lucide-react';
import { CategoryBreakdown, type CategoryView } from '@/components/charts/CategoryBreakdown';
import { DayOfWeekChart } from '@/components/charts/DayOfWeekChart';
import { PurchaseSizeHistogram } from '@/components/charts/PurchaseSizeHistogram';
import { SpendingHeatmap } from '@/components/charts/SpendingHeatmap';
import { SpendingTrendChart } from '@/components/charts/SpendingTrendChart';
import { DateRangeFields, type DateRange } from '@/components/DateRangePicker';
import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/IconButton';
import { PageHeader } from '@/components/PageHeader';
import { PurchaseSizeCustomizerDialog } from '@/components/PurchaseSizeCustomizerDialog';
import { SegmentedControl, type SegmentOption } from '@/components/SegmentedControl';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DEFAULT_PURCHASE_SIZE_THRESHOLDS,
  type PurchaseSizeThresholds,
  type RangeKey,
  byCategory,
  byDayAndCategory,
  byDayOfWeek,
  byHeatmap,
  byMonthAndCategory,
  byPurchaseSize,
  dayTrendPoints,
  isDayGranularity,
  largestPurchase,
  monthTrendPoints,
  resolveRange,
  totalCents,
  validateThresholds,
} from '@/lib/analytics';
import { formatAmount } from '@/lib/format';
import { describePeriod } from '@/lib/period';
import { WEEKDAY_COLOR, WEEKEND_COLOR } from '@/lib/palette';
import { useCategories, useTransactions } from '@/lib/queries';
import { useStoredState } from '@/lib/use-stored-state';
import { cn } from '@/lib/utils';
import { EditTransactionDialog } from './EditTransactionDialog';

type RangeOption = RangeKey | 'custom';
type TrendView = 'total' | 'stacked';
type SizeMetric = 'count' | 'cents';

const RANGE_OPTIONS: SegmentOption<RangeOption>[] = [
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom', icon: <CalendarIcon className="size-3.5" /> },
];

const CATEGORY_VIEWS: SegmentOption<CategoryView>[] = [
  { value: 'bar', label: 'Bar chart', icon: <ChartBarIcon /> },
  { value: 'pie', label: 'Pie chart', icon: <ChartPieIcon /> },
];

const SIZE_METRICS: SegmentOption<SizeMetric>[] = [
  { value: 'count', label: 'Transaction count', icon: <HashIcon /> },
  { value: 'cents', label: 'Total dollars', icon: <DollarSignIcon /> },
];

const DEFAULT_THRESHOLDS: PurchaseSizeThresholds = [...DEFAULT_PURCHASE_SIZE_THRESHOLDS];

const STORAGE_KEY_THRESHOLDS = 'spending-tracker:purchase-size-thresholds';
const STORAGE_KEY_SIZE_METRIC = 'spending-tracker:purchase-size-metric';

/** Stable empty fallbacks, so memoized views do not recompute on every render. */
const EMPTY_TRANSACTIONS: Transaction[] = [];
const EMPTY_CATEGORIES: Category[] = [];

export function Dashboard() {
  const [preset, setPreset] = useState<RangeKey>('month');
  const [custom, setCustom] = useState<DateRange>({});
  const [pickingRange, setPickingRange] = useState(false);
  const [categoryView, setCategoryView] = useState<CategoryView>('bar');
  const [trendView, setTrendView] = useState<TrendView>('total');
  const [sizeMetric, setSizeMetric] = useStoredState<SizeMetric>(
    STORAGE_KEY_SIZE_METRIC,
    'count',
    (raw) => (raw === 'count' || raw === 'cents' ? raw : null),
  );
  const [thresholds, setThresholds] = useStoredState<PurchaseSizeThresholds>(
    STORAGE_KEY_THRESHOLDS,
    DEFAULT_THRESHOLDS,
    validateThresholds,
  );
  const [customizingSizes, setCustomizingSizes] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  const customActive = Boolean(custom.from ?? custom.to);
  const query = useMemo(
    () => (customActive ? custom : resolveRange(preset)),
    [customActive, custom, preset],
  );

  const transactions = useTransactions(query);
  const categories = useCategories();

  const rows = transactions.data ?? EMPTY_TRANSACTIONS;
  const categoryList = categories.data ?? EMPTY_CATEGORIES;

  const firstDate = useMemo(
    () =>
      rows.reduce<string | undefined>(
        (min, row) => (!min || row.date < min ? row.date : min),
        undefined,
      ),
    [rows],
  );
  const period = describePeriod(preset, custom, firstDate);

  const categoryTotals = byCategory(rows, categoryList);
  const largest = useMemo(() => largestPurchase(rows), [rows]);
  const total = totalCents(rows);
  const average = rows.length === 0 ? 0 : Math.round(total / rows.length);
  const topCategory = categoryTotals[0];

  // The trend spans the whole period, so the rest of it reads as empty, not absent.
  const daily = isDayGranularity(query, customActive ? undefined : preset);
  const trend = useMemo(
    () =>
      daily
        ? dayTrendPoints(byDayAndCategory(rows, categoryList, period.display))
        : monthTrendPoints(byMonthAndCategory(rows, categoryList, period.display)),
    [daily, rows, categoryList, period.display],
  );

  const sizes = useMemo(() => byPurchaseSize(rows, thresholds), [rows, thresholds]);
  // Like the trend, the calendar covers the whole period, not just up to today.
  const heatmap = useMemo(() => byHeatmap(rows, period.display), [rows, period.display]);
  const dow = useMemo(() => byDayOfWeek(rows, query), [rows, query]);
  const weekdayPct = Math.round(dow.weekdayShare * 100);

  return (
    <>
      <PageHeader
        eyebrow={period.eyebrow}
        title={period.title}
        actions={
          <SegmentedControl
            label="Time range"
            options={RANGE_OPTIONS}
            value={customActive ? 'custom' : preset}
            onChange={(value) => {
              if (value !== 'custom') {
                setPreset(value);
                setCustom({});
              }
            }}
            renderItem={(option, { className }) =>
              option.value === 'custom' ? (
                <Popover key="custom" open={pickingRange} onOpenChange={setPickingRange}>
                  <PopoverTrigger
                    render={
                      <button type="button" className={className}>
                        {option.icon}
                        {option.label}
                      </button>
                    }
                  />
                  <PopoverContent align="end" className="w-auto">
                    <DateRangeFields
                      value={custom}
                      onChange={setCustom}
                      onDone={() => setPickingRange(false)}
                    />
                  </PopoverContent>
                </Popover>
              ) : undefined
            }
          />
        }
      />

      {transactions.isError && (
        <EmptyState>Could not load spending: {transactions.error.message}</EmptyState>
      )}
      {transactions.isPending && <EmptyState>Loading…</EmptyState>}
      {transactions.isSuccess && rows.length === 0 && (
        <EmptyState>No spending recorded in this period.</EmptyState>
      )}

      {transactions.isSuccess && rows.length > 0 && (
        <>
          <Card className="grid grid-cols-1 gap-0 py-0 md:grid-cols-[1.5fr_1fr_1fr]">
            <SummaryCell label="Total spent">
              <p className="text-[44px] leading-none font-semibold tracking-[-0.04em] tabular-nums">
                {formatAmount(total)}
              </p>
              <p className="mt-2.5 text-[13px] text-muted-foreground tabular-nums">
                {rows.length.toLocaleString()} {rows.length === 1 ? 'transaction' : 'transactions'}{' '}
                · {formatAmount(average)} average
              </p>
            </SummaryCell>

            <SummaryCell className={CELL_DIVIDER} label="Top category">
              <p className="flex items-center gap-2 text-xl font-semibold tracking-[-0.02em]">
                {topCategory && (
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: topCategory.color }}
                  />
                )}
                <span className="truncate">{topCategory?.name ?? '—'}</span>
              </p>
              <p className="mt-2.5 text-[13px] text-muted-foreground tabular-nums">
                {topCategory
                  ? `${formatAmount(topCategory.cents)} · ${Math.round(topCategory.share * 100)}%`
                  : 'No spending yet'}
              </p>
            </SummaryCell>

            <SummaryCell
              className={CELL_DIVIDER}
              label="Largest expense"
              onOpen={largest ? () => setSelectedTransaction(largest) : undefined}
            >
              <p className="text-xl font-semibold tracking-[-0.02em] tabular-nums">
                {largest ? formatAmount(largest.amountCents) : '—'}
              </p>
              <p className="mt-2.5 truncate text-[13px] text-muted-foreground">
                {largest?.description ?? 'No purchases'}
              </p>
            </SummaryCell>
          </Card>

          <div className="flex flex-wrap gap-5">
            <Card className="flex-[1_1_320px]">
              <CardHeader>
                <CardTitle>By category</CardTitle>
                <CardAction>
                  <SegmentedControl
                    size="sm"
                    label="Category chart"
                    options={CATEGORY_VIEWS}
                    value={categoryView}
                    onChange={setCategoryView}
                  />
                </CardAction>
              </CardHeader>
              <CardContent>
                <CategoryBreakdown data={categoryTotals} view={categoryView} />
              </CardContent>
            </Card>

            <Card className="flex-[1.4_1_420px]">
              <CardHeader>
                <CardTitle>{daily ? 'By day' : 'By month'}</CardTitle>
                <CardAction>
                  <SegmentedControl
                    size="sm"
                    label="Trend chart"
                    options={[
                      { value: 'total', label: 'Totals', icon: <ChartColumnIcon /> },
                      {
                        value: 'stacked',
                        label: 'Stacked by category',
                        icon: <ChartColumnStackedIcon />,
                      },
                    ]}
                    value={trendView}
                    onChange={setTrendView}
                  />
                </CardAction>
              </CardHeader>
              <CardContent>
                <SpendingTrendChart
                  points={trend}
                  series={categoryTotals}
                  stacked={trendView === 'stacked'}
                />
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-5">
            <Card className="flex-[1_1_380px]">
              <CardHeader>
                <CardTitle>Purchase size</CardTitle>
                <CardAction>
                  <div className="flex items-center gap-1.5">
                    <SegmentedControl
                      size="sm"
                      label="Purchase size measure"
                      options={SIZE_METRICS}
                      value={sizeMetric}
                      onChange={setSizeMetric}
                    />
                    <IconButton
                      label="Customize purchase brackets"
                      onClick={() => setCustomizingSizes(true)}
                    >
                      <SlidersHorizontalIcon />
                    </IconButton>
                  </div>
                </CardAction>
              </CardHeader>
              <CardContent>
                <PurchaseSizeHistogram data={sizes} metric={sizeMetric} />
              </CardContent>
            </Card>

            <Card className="flex-[1_1_380px]">
              <CardHeader>
                <CardTitle>Day of week</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
                  <Swatch color={WEEKDAY_COLOR} /> Weekday {weekdayPct}%
                  <Swatch color={WEEKEND_COLOR} className="ml-1.5" /> Weekend {100 - weekdayPct}%
                  {dow.peakDay && dow.totalCents > 0 && (
                    <>
                      <span aria-hidden className="mx-1">
                        ·
                      </span>
                      <span>
                        Peak{' '}
                        <strong className="font-semibold text-foreground">
                          {dow.peakDay.fullName}
                        </strong>
                        , avg {formatAmount(dow.peakDay.averageCents)}
                      </span>
                    </>
                  )}
                </p>
                <DayOfWeekChart data={dow.days} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent>
              <SpendingHeatmap breakdown={heatmap} />
            </CardContent>
          </Card>
        </>
      )}

      <PurchaseSizeCustomizerDialog
        open={customizingSizes}
        thresholds={thresholds}
        onSave={setThresholds}
        onClose={() => setCustomizingSizes(false)}
      />

      <EditTransactionDialog
        transaction={selectedTransaction}
        categories={categoryList}
        onClose={() => setSelectedTransaction(null)}
      />
    </>
  );
}

/** The hairline between summary cells follows whichever way they are laid out. */
const CELL_DIVIDER = 'border-t border-divider md:border-t-0 md:border-l';

interface SummaryCellProps {
  label: string;
  className?: string;
  /** Makes the whole cell a button, with the arrow that says so. */
  onOpen?: () => void;
  children: React.ReactNode;
}

function SummaryCell({ label, className, onOpen, children }: SummaryCellProps) {
  const content = (
    <>
      <p className="flex items-start justify-between gap-2 text-[13px] text-muted-foreground">
        {label}
        {onOpen && <ArrowUpRightIcon className="size-3.5 shrink-0" />}
      </p>
      <div className="mt-auto pt-4">{children}</div>
    </>
  );

  const cellClassName = cn('flex min-w-0 flex-col px-7 py-6 text-left', className);

  return onOpen ? (
    <button type="button" onClick={onOpen} className={cn(cellClassName, 'hover:bg-surface-hover')}>
      {content}
    </button>
  ) : (
    <div className={cellClassName}>{content}</div>
  );
}

function Swatch({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-2 rounded-[2px]', className)}
      style={{ backgroundColor: color }}
    />
  );
}
