import { type CSSProperties, type ReactNode, useState } from 'react';
import type { HeatmapBreakdown, HeatmapDay, HeatmapMonth } from '@/lib/analytics';
import { formatAmount, today } from '@/lib/format';
import { cn } from '@/lib/utils';

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const FILL = ['bg-heat-0', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3', 'bg-heat-4'] as const;

/**
 * Every day of the period as a calendar, shaded by how much was spent. One
 * month gets its own large grid; a longer period gets a small grid per month.
 */
export function SpendingHeatmap({ breakdown }: { breakdown: HeatmapBreakdown }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<HeatmapDay | null>(null);

  const selectedDay = breakdown.allDays.find((day) => day.date === selected) ?? null;
  const shown = hovered ?? selectedDay;
  const singleMonth = breakdown.months.length === 1;
  const now = today();

  const cell = (day: HeatmapDay): DayCellProps => ({
    day,
    isToday: day.date === now,
    isSelected: day.date === selected,
    onSelect: () => setSelected(day.date === selected ? null : day.date),
    onHover: setHovered,
  });

  return (
    <div className="flex flex-wrap gap-x-10 gap-y-6">
      <div className="flex-[1_1_460px]">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="font-heading text-[15px] font-medium">Daily spending</h3>
          <p className="text-xs text-muted-foreground tabular-nums">{readout(shown)}</p>
        </div>

        {singleMonth ? (
          <div className="mt-4">
            <div className="grid grid-cols-7 gap-1.5 text-[11px] text-muted-foreground">
              {WEEKDAY_HEADERS.map((name) => (
                <div key={name}>{name}</div>
              ))}
            </div>
            <MonthGrid
              month={breakdown.months[0]}
              className="mt-1.5 gap-1.5"
              renderDay={(day) => <LargeDay key={day.date} {...cell(day)} />}
            />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-[18px]">
            {breakdown.months.map((month) => (
              <div key={month.month}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-medium">{shortMonth(month.month)}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {compact(month.totalCents)}
                  </span>
                </div>
                <MonthGrid
                  month={month}
                  className="mt-1.5 gap-[3px]"
                  renderDay={(day) => <SmallDay key={day.date} {...cell(day)} />}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-[0_1_220px] flex-col pt-[34px]">
        <div className="grid gap-[18px]">
          <Stat label="No-spend days" value={String(breakdown.noSpendDays)}>
            of {breakdown.totalDays} · {breakdown.noSpendPercentage}%
          </Stat>
          <Stat label="Current streak" value={days(breakdown.currentStreak)} />
          <Stat label="Best streak" value={days(breakdown.recordStreak)} />
        </div>

        <div className="mt-auto flex items-center gap-1.5 pt-6 text-[11px] text-muted-foreground">
          <span>$0</span>
          {FILL.map((fill) => (
            <span key={fill} aria-hidden className={cn('size-3.5 rounded-[3px]', fill)} />
          ))}
          <span>High</span>
        </div>
      </div>
    </div>
  );
}

function MonthGrid({
  month,
  className,
  renderDay,
}: {
  month: HeatmapMonth | undefined;
  className?: string;
  renderDay: (day: HeatmapDay) => ReactNode;
}) {
  if (!month) {
    return null;
  }

  return (
    <div className={cn('grid grid-cols-7', className)}>
      {/* The month rarely starts on a Monday, so the first row needs a run-up. */}
      {Array.from({ length: month.firstDayOffset }, (_, index) => (
        <div key={`spacer-${index}`} />
      ))}
      {month.days.map(renderDay)}
    </div>
  );
}

interface DayCellProps {
  day: HeatmapDay;
  isToday: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onHover: (day: HeatmapDay | null) => void;
}

function LargeDay(props: DayCellProps) {
  const { day } = props;

  return (
    <DayCell
      {...props}
      className="h-[52px] flex-col items-start justify-between rounded-lg px-2 py-1.5"
    >
      <span className="text-[11px] font-medium">{day.dayOfMonth}</span>
      {day.cents > 0 && <span className="text-[10px] tabular-nums">{compact(day.cents)}</span>}
    </DayCell>
  );
}

function SmallDay(props: DayCellProps) {
  return <DayCell {...props} className="aspect-square rounded-[3px]" />;
}

function DayCell({
  day,
  isToday,
  isSelected,
  onSelect,
  onHover,
  className,
  children,
}: DayCellProps & { className: string; children?: ReactNode }) {
  const outlines = [
    // A future day is an empty outline: nothing has been spent there yet.
    day.isFuture && 'inset 0 0 0 1px var(--divider)',
    isSelected ? '0 0 0 2px var(--primary)' : isToday ? '0 0 0 1.5px var(--foreground)' : null,
  ].filter(Boolean);

  const style: CSSProperties = outlines.length > 0 ? { boxShadow: outlines.join(', ') } : {};

  return (
    <button
      type="button"
      disabled={day.isFuture || day.isOutsideRange}
      onClick={onSelect}
      onMouseEnter={() => onHover(day)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(day)}
      onBlur={() => onHover(null)}
      style={style}
      aria-label={readout(day)}
      className={cn(
        'flex w-full text-left outline-none transition-colors',
        className,
        day.isFuture
          ? 'bg-transparent'
          : day.isOutsideRange
            ? 'bg-background'
            : cn(FILL[day.level], 'cursor-pointer'),
        day.level >= 3 && 'text-white',
        day.level < 3 && 'text-muted-foreground',
      )}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div>
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="text-[22px] font-semibold tabular-nums">
        {value}
        {children && (
          <span className="ml-1.5 text-[13px] font-normal text-muted-foreground">{children}</span>
        )}
      </p>
    </div>
  );
}

/** The one line that says what the pointer is on. */
function readout(day: HeatmapDay | null): string {
  if (!day) {
    return 'Hover or tap a day';
  }

  const date = fullDate(day.date);
  if (day.isFuture || day.isOutsideRange) {
    return date;
  }
  if (day.cents === 0) {
    return `${date} · No spend`;
  }
  return `${date} · ${formatAmount(day.cents)} · ${day.count} ${
    day.count === 1 ? 'purchase' : 'purchases'
  }`;
}

const days = (count: number): string => `${count} ${count === 1 ? 'day' : 'days'}`;

/** Whole dollars: the calendar has no room for cents. */
const compact = (cents: number): string => `$${Math.round(cents / 100).toLocaleString()}`;

const utcDate = (iso: string): Date => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
};

const fullDate = (iso: string): string =>
  utcDate(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

const shortMonth = (month: string): string =>
  utcDate(`${month}-01`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
