import { useMemo, useState } from 'react';
import { CategoryBarChart } from '@/components/charts/CategoryBarChart';
import { MonthlyTrendChart } from '@/components/charts/MonthlyTrendChart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type RangeKey,
  RANGE_LABELS,
  byCategory,
  byMonth,
  resolveRange,
  totalCents,
} from '@/lib/analytics';
import { formatAmount } from '@/lib/format';
import { useCategories, useTransactions } from '@/lib/queries';

const RANGES: RangeKey[] = ['month', 'quarter', 'ytd', 'all'];

export function Dashboard() {
  const [range, setRange] = useState<RangeKey>('month');

  const query = useMemo(() => resolveRange(range), [range]);
  const transactions = useTransactions(query);
  const categories = useCategories();

  const rows = transactions.data ?? [];
  const categoryTotals = byCategory(rows, categories.data ?? []);
  const monthTotals = byMonth(rows);

  const total = totalCents(rows);
  const average = rows.length === 0 ? 0 : Math.round(total / rows.length);
  const topCategory = categoryTotals[0];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Time range">
          {RANGES.map((key) => (
            <Button
              key={key}
              size="sm"
              variant={range === key ? 'secondary' : 'ghost'}
              aria-pressed={range === key}
              onClick={() => setRange(key)}
            >
              {RANGE_LABELS[key]}
            </Button>
          ))}
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
            </CardHeader>
            <CardContent>
              <CategoryBarChart data={categoryTotals} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Spending by month</CardTitle>
            </CardHeader>
            <CardContent>
              {monthTotals.length > 1 ? (
                <MonthlyTrendChart data={monthTotals} />
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
