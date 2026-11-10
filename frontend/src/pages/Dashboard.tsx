import { useMemo, useState } from 'react';
import {
  ChartBarIcon,
  ChartColumnIcon,
  ChartColumnStackedIcon,
  ChartPieIcon,
  DollarSignIcon,
  HashIcon,
  SlidersHorizontalIcon,
} from 'lucide-react';
import { CategoryBarChart } from '@/components/charts/CategoryBarChart';
import { CategoryPieChart } from '@/components/charts/CategoryPieChart';
import { PurchaseSizeHistogram } from '@/components/charts/PurchaseSizeHistogram';
import { SpendingTrendChart } from '@/components/charts/SpendingTrendChart';
import { DateRangePicker, type DateRange } from '@/components/DateRangePicker';
import { PurchaseSizeCustomizerDialog } from '@/components/PurchaseSizeCustomizerDialog';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  DEFAULT_PURCHASE_SIZE_THRESHOLDS,
  type PurchaseSizeThresholds,
  type RangeKey,
  RANGE_LABELS,
  byCategory,
  byDayAndCategory,
  byMonthAndCategory,
  byPurchaseSize,
  isDayGranularity,
  resolveRange,
  totalCents,
  validateThresholds,
} from '@/lib/analytics';
import { formatAmount } from '@/lib/format';
import { useCategories, useTransactions } from '@/lib/queries';

const RANGES: RangeKey[] = ['month', 'year', 'all'];

const STORAGE_KEY_HISTOGRAM_THRESHOLDS = 'spending-tracker:purchase-size-thresholds';
const STORAGE_KEY_HISTOGRAM_METRIC = 'spending-tracker:purchase-size-metric';

function loadInitialThresholds(): PurchaseSizeThresholds {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HISTOGRAM_THRESHOLDS);
    if (raw) {
      const validated = validateThresholds(JSON.parse(raw));
      if (validated) {
        return validated;
      }
    }
  } catch {
    // Ignore storage errors
  }
  return [
    DEFAULT_PURCHASE_SIZE_THRESHOLDS[0],
    DEFAULT_PURCHASE_SIZE_THRESHOLDS[1],
    DEFAULT_PURCHASE_SIZE_THRESHOLDS[2],
    DEFAULT_PURCHASE_SIZE_THRESHOLDS[3],
  ];
}

function loadInitialHistogramMetric(): 'count' | 'cents' {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HISTOGRAM_METRIC);
    if (raw === 'count' || raw === 'cents') {
      return raw;
    }
  } catch {
    // Ignore storage errors
  }
  return 'count';
}

export function Dashboard() {
  const [preset, setPreset] = useState<RangeKey>('month');
  const [custom, setCustom] = useState<DateRange>({});
  const [categoryView, setCategoryView] = useState<'bar' | 'pie'>('bar');
  const [monthView, setMonthView] = useState<'total' | 'stacked'>('total');
  const [histogramMetric, setHistogramMetric] =
    useState<'count' | 'cents'>(loadInitialHistogramMetric);
  const [histogramThresholds, setHistogramThresholds] =
    useState<PurchaseSizeThresholds>(loadInitialThresholds);
  const [customizingHistogram, setCustomizingHistogram] = useState(false);

  const customActive = Boolean(custom.from ?? custom.to);
  const query = useMemo(
    () => (customActive ? custom : resolveRange(preset)),
    [customActive, custom, preset],
  );

  const transactions = useTransactions(query);
  const categories = useCategories();

  const rows = transactions.data ?? [];
  const categoryTotals = byCategory(rows, categories.data ?? []);
  const isDaily = isDayGranularity(query, customActive ? undefined : preset);

  const daily = isDaily ? byDayAndCategory(rows, categories.data ?? [], query) : null;
  const monthly = !isDaily ? byMonthAndCategory(rows, categories.data ?? [], query) : null;

  const trendPoints = daily ? daily.days : (monthly?.months ?? []);
  const trendSeries = daily ? daily.series : (monthly?.series ?? []);
  const hasTrend = daily ? daily.days.length > 0 : (monthly?.months.length ?? 0) > 1;
  const trendTitle = isDaily ? 'Spending by day' : 'Spending by month';
  const trendTotalLabel = isDaily ? 'Daily totals' : 'Monthly totals';

  const histogramData = useMemo(
    () => byPurchaseSize(rows, histogramThresholds),
    [rows, histogramThresholds],
  );
  const hasPurchases = rows.some((row) => row.amountCents > 0);

  function handleHistogramMetricChange(next: 'count' | 'cents') {
    setHistogramMetric(next);
    try {
      localStorage.setItem(STORAGE_KEY_HISTOGRAM_METRIC, next);
    } catch {
      // Ignore storage errors
    }
  }

  function handleHistogramThresholdsChange(next: PurchaseSizeThresholds) {
    setHistogramThresholds(next);
    try {
      localStorage.setItem(STORAGE_KEY_HISTOGRAM_THRESHOLDS, JSON.stringify(next));
    } catch {
      // Ignore storage errors
    }
  }

  const total = totalCents(rows);
  const average = rows.length === 0 ? 0 : Math.round(total / rows.length);
  const topCategory = categoryTotals[0];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <div
          className="flex w-full flex-wrap items-center gap-2 sm:w-auto"
          role="group"
          aria-label="Time range"
        >
          {RANGES.map((key) => (
            <Button
              key={key}
              size="sm"
              variant={!customActive && preset === key ? 'secondary' : 'outline'}
              aria-pressed={!customActive && preset === key}
              onClick={() => {
                setPreset(key);
                setCustom({});
              }}
            >
              {RANGE_LABELS[key]}
            </Button>
          ))}
          <DateRangePicker
            value={custom}
            onChange={setCustom}
            placeholder="Custom"
            active={customActive}
          />
        </div>
      </div>

      {transactions.isError && (
        <Placeholder>Could not load spending: {transactions.error.message}</Placeholder>
      )}

      {transactions.isPending && <Placeholder>Loading…</Placeholder>}

      {transactions.isSuccess && rows.length === 0 && (
        <Placeholder>No spending recorded in this period.</Placeholder>
      )}

      {transactions.isSuccess && rows.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile label="Total spent" value={formatAmount(total)} />
            <StatTile
              label="Transactions"
              value={String(rows.length)}
              detail={`${formatAmount(average)} average`}
            />
            <StatTile
              label="Top category"
              value={topCategory?.name ?? '—'}
              detail={
                topCategory &&
                `${formatAmount(topCategory.cents)} · ${Math.round(topCategory.share * 100)}%`
              }
              swatch={topCategory?.color}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Spending by category</CardTitle>
              <CardAction>
                <ChartViewToggle
                  value={categoryView}
                  onChange={setCategoryView}
                  options={[
                    { value: 'bar', label: 'Bar chart', icon: <ChartBarIcon /> },
                    { value: 'pie', label: 'Pie chart', icon: <ChartPieIcon /> },
                  ]}
                />
              </CardAction>
            </CardHeader>
            <CardContent>
              {categoryView === 'bar' ? (
                <CategoryBarChart data={categoryTotals} />
              ) : (
                <CategoryPieChart data={categoryTotals} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">{trendTitle}</CardTitle>
              <CardAction>
                <ChartViewToggle
                  value={monthView}
                  onChange={setMonthView}
                  options={[
                    { value: 'total', label: trendTotalLabel, icon: <ChartColumnIcon /> },
                    {
                      value: 'stacked',
                      label: 'Stacked by category',
                      icon: <ChartColumnStackedIcon />,
                    },
                  ]}
                />
              </CardAction>
            </CardHeader>
            <CardContent>
              {hasTrend ? (
                <SpendingTrendChart
                  data={trendPoints}
                  series={trendSeries}
                  stacked={monthView === 'stacked'}
                />
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  A month-by-month trend appears once you have spending in more than one month.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Purchase size distribution</CardTitle>
              <CardAction>
                <div className="flex items-center gap-1.5">
                  <ChartViewToggle
                    value={histogramMetric}
                    onChange={handleHistogramMetricChange}
                    options={[
                      { value: 'count', label: 'Transaction count', icon: <HashIcon /> },
                      { value: 'cents', label: 'Total dollars', icon: <DollarSignIcon /> },
                    ]}
                  />
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Customize purchase brackets"
                    onClick={() => setCustomizingHistogram(true)}
                  >
                    <SlidersHorizontalIcon />
                  </Button>
                </div>
              </CardAction>
            </CardHeader>
            <CardContent>
              {hasPurchases ? (
                <PurchaseSizeHistogram data={histogramData} metric={histogramMetric} />
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No purchases recorded in this period.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <PurchaseSizeCustomizerDialog
        open={customizingHistogram}
        thresholds={histogramThresholds}
        onSave={handleHistogramThresholdsChange}
        onClose={() => setCustomizingHistogram(false)}
      />
    </div>
  );
}

interface ChartViewToggleProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; icon: React.ReactNode }>;
}

/** Icon switch between two renderings of the same data; one is always active. */
function ChartViewToggle<T extends string>({ value, onChange, options }: ChartViewToggleProps<T>) {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      spacing={0}
      value={[value]}
      onValueChange={(next: unknown[]) => {
        const [selected] = next;
        if (typeof selected === 'string') {
          onChange(selected as T);
        }
      }}
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value} aria-label={option.label}>
          {option.icon}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

interface StatTileProps {
  label: string;
  value: string;
  detail?: string | false;
  swatch?: string;
}

function StatTile({ label, value, detail, swatch }: StatTileProps) {
  return (
    <Card>
      <CardContent className="grid gap-1 py-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="flex items-center gap-2 text-2xl font-semibold tracking-tight tabular-nums">
          {swatch && (
            <span
              aria-hidden
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: swatch }}
            />
          )}
          {value}
        </p>
        {detail && <p className="text-sm text-muted-foreground tabular-nums">{detail}</p>}
      </CardContent>
    </Card>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
