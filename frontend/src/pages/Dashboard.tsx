import { useMemo, useState } from 'react';
import { ChartBarIcon, ChartColumnIcon, ChartColumnStackedIcon, ChartPieIcon } from 'lucide-react';
import { CategoryBarChart } from '@/components/charts/CategoryBarChart';
import { CategoryPieChart } from '@/components/charts/CategoryPieChart';
import { MonthlyTrendChart } from '@/components/charts/MonthlyTrendChart';
import { type DateRange, DateRangePicker } from '@/components/DateRangePicker';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  type RangeKey,
  RANGE_LABELS,
  byCategory,
  byMonthAndCategory,
  resolveRange,
  totalCents,
} from '@/lib/analytics';
import { formatAmount } from '@/lib/format';
import { useCategories, useTransactions } from '@/lib/queries';

const RANGES: RangeKey[] = ['month', 'year', 'all'];

export function Dashboard() {
  const [preset, setPreset] = useState<RangeKey>('month');
  const [custom, setCustom] = useState<DateRange>({});
  const [categoryView, setCategoryView] = useState<'bar' | 'pie'>('bar');
  const [monthView, setMonthView] = useState<'total' | 'stacked'>('total');

  const customActive = Boolean(custom.from ?? custom.to);
  const query = useMemo(
    () => (customActive ? custom : resolveRange(preset)),
    [customActive, custom, preset],
  );

  const transactions = useTransactions(query);
  const categories = useCategories();

  const rows = transactions.data ?? [];
  const categoryTotals = byCategory(rows, categories.data ?? []);
  const monthly = byMonthAndCategory(rows, categories.data ?? [], query);

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
              <CardTitle className="text-base font-medium">Spending by month</CardTitle>
              <CardAction>
                <ChartViewToggle
                  value={monthView}
                  onChange={setMonthView}
                  options={[
                    { value: 'total', label: 'Monthly totals', icon: <ChartColumnIcon /> },
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
              {monthly.months.length > 1 ? (
                <MonthlyTrendChart
                  data={monthly.months}
                  series={monthly.series}
                  stacked={monthView === 'stacked'}
                />
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  A month-by-month trend appears once you have spending in more than one month.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
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
