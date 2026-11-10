import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { HeatmapBreakdown, HeatmapDay } from '@/lib/analytics';
import { formatAmount } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface SpendingHeatmapProps {
  breakdown: HeatmapBreakdown;
}

const WEEKDAY_HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function formatHeatmapDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) {
    return dateStr;
  }
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function getLevelClass(level: HeatmapDay['level'], isNoSpend: boolean, isFuture: boolean): string {
  if (isFuture) {
    return 'border-dashed border-border/30 bg-transparent text-muted-foreground/30 cursor-default';
  }
  if (isNoSpend) {
    return 'border-border/40 bg-muted/40 text-muted-foreground/70 hover:border-foreground/30 hover:bg-muted/60';
  }
  switch (level) {
    case 1:
      return 'border-emerald-200 bg-emerald-100 text-emerald-900 hover:brightness-95 dark:border-emerald-800/60 dark:bg-emerald-950/80 dark:text-emerald-200';
    case 2:
      return 'border-emerald-400 bg-emerald-300 text-emerald-950 hover:brightness-95 dark:border-emerald-700 dark:bg-emerald-800 dark:text-emerald-100';
    case 3:
      return 'border-emerald-600 bg-emerald-500 text-white hover:brightness-95 dark:border-emerald-500 dark:bg-emerald-600 dark:text-white';
    case 4:
      return 'border-emerald-800 bg-emerald-700 text-white hover:brightness-95 dark:border-emerald-400 dark:bg-emerald-500 dark:text-white';
    default:
      return 'border-border/40 bg-muted/40 text-muted-foreground/70 hover:border-foreground/30 hover:bg-muted/60';
  }
}

/**
 * Calendar-based daily spending heatmap with Monday–Sunday columns.
 * Highlights No-Spend days, streaks, and color-scaled spending intensity.
 */
export function SpendingHeatmap({ breakdown }: { breakdown: HeatmapBreakdown }) {
  const [selectedDay, setSelectedDay] = useState<HeatmapDay | null>(null);
  const [hovered, setHovered] = useState<{ day: HeatmapDay; rect: DOMRect } | null>(null);

  const { months, noSpendDays, noSpendPercentage, currentStreak, recordStreak } = breakdown;

  return (
    <div className="space-y-4">
      {/* Gamification & Discipline stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">No-spend days</p>
          <p className="text-xl font-semibold tracking-tight text-foreground tabular-nums">
            {noSpendDays}
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              ({noSpendPercentage}%)
            </span>
          </p>
        </div>

        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">Current streak</p>
          <p className="text-xl font-semibold tracking-tight text-foreground tabular-nums">
            {currentStreak} {currentStreak === 1 ? 'day' : 'days'}
          </p>
        </div>

        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">Best streak</p>
          <p className="text-xl font-semibold tracking-tight text-foreground tabular-nums">
            {recordStreak} {recordStreak === 1 ? 'day' : 'days'}
          </p>
        </div>
      </div>

      {/* Color Intensity Scale Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>No-spend days indicate zero purchases</span>
        <div className="flex items-center gap-1.5">
          <span>$0</span>
          <span className="size-3 rounded-xs border border-border/40 bg-muted/40" />
          <span className="size-3 rounded-xs bg-emerald-100 dark:bg-emerald-950" />
          <span className="size-3 rounded-xs bg-emerald-300 dark:bg-emerald-800" />
          <span className="size-3 rounded-xs bg-emerald-500 dark:bg-emerald-600" />
          <span className="size-3 rounded-xs bg-emerald-700 dark:bg-emerald-400" />
          <span>High spend</span>
        </div>
      </div>

      {/* Selected Day Inspection Bar (for tap on mobile or desktop click) */}
      {selectedDay && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-xs">
          <span className="font-medium text-foreground">
            {formatHeatmapDate(selectedDay.date)}
          </span>
          <span className="tabular-nums">
            {selectedDay.isNoSpend ? (
              <span className="text-muted-foreground">No spend · $0.00</span>
            ) : selectedDay.isFuture ? (
              <span className="text-muted-foreground">Upcoming day</span>
            ) : (
              <span>
                <strong className="font-semibold text-foreground">
                  {formatAmount(selectedDay.cents)}
                </strong>{' '}
                · {selectedDay.count} purchase{selectedDay.count === 1 ? '' : 's'}
              </span>
            )}
          </span>
        </div>
      )}

      {/* Calendar Months Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {months.map((month) => (
          <div key={month.month} className="rounded-lg border bg-card p-3 shadow-xs">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold text-foreground">{month.label}</h4>
              <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                {formatAmount(month.totalCents)}
              </span>
            </div>

            {/* Weekday headers: Mon through Sun */}
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-muted-foreground/75">
              {WEEKDAY_HEADERS.map((name, i) => (
                <div key={i}>{name}</div>
              ))}
            </div>

            {/* Days grid */}
            <div className="mt-1.5 grid grid-cols-7 gap-1">
              {/* Spacers before the 1st of the month */}
              {Array.from({ length: month.firstDayOffset }).map((_, i) => (
                <div key={`spacer-${i}`} className="aspect-square" />
              ))}

              {/* Day square tiles */}
              {month.days.map((day) => {
                const isSelected = selectedDay?.date === day.date;
                return (
                  <button
                    key={day.date}
                    type="button"
                    disabled={day.isFuture}
                    onClick={() => setSelectedDay(day)}
                    onMouseEnter={(e) => {
                      if (!day.isFuture) {
                        setHovered({ day, rect: e.currentTarget.getBoundingClientRect() });
                      }
                    }}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={(e) => {
                      if (!day.isFuture) {
                        setHovered({ day, rect: e.currentTarget.getBoundingClientRect() });
                      }
                    }}
                    onBlur={() => setHovered(null)}
                    className={cn(
                      'relative flex aspect-square items-center justify-center rounded-xs border text-[10px] font-medium transition-all outline-none',
                      getLevelClass(day.level, day.isNoSpend, day.isFuture),
                      isSelected ? 'ring-2 ring-ring ring-offset-1' : '',
                      day.isFuture ? '' : 'cursor-pointer hover:scale-105',
                    )}
                    aria-label={`${formatHeatmapDate(day.date)}: ${
                      day.isNoSpend ? 'No spend' : formatAmount(day.cents)
                    }`}
                  >
                    <span>{day.dayOfMonth}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Floating portal tooltip immune to overflow-hidden and screen clipping */}
      {hovered && typeof document !== 'undefined' && (
        <HeatmapPortalTooltip day={hovered.day} rect={hovered.rect} />
      )}
    </div>
  );
}

function HeatmapPortalTooltip({ day, rect }: { day: HeatmapDay; rect: DOMRect }) {
  const tooltipWidth = 170;
  const centerX = rect.left + rect.width / 2;
  const minX = tooltipWidth / 2 + 12;
  const maxX = window.innerWidth - tooltipWidth / 2 - 12;
  const clampedX = Math.max(minX, Math.min(maxX, centerX));

  const showBelow = rect.top < 64;
  const top = showBelow ? rect.bottom + 8 : rect.top - 8;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: `${clampedX}px`,
        top: `${top}px`,
        transform: showBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
      className="whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
    >
      <p className="font-semibold text-foreground">{formatHeatmapDate(day.date)}</p>
      {day.isNoSpend ? (
        <p className="text-muted-foreground">No spend · $0.00</p>
      ) : (
        <p className="tabular-nums">
          <span className="font-medium text-foreground">{formatAmount(day.cents)}</span>
          <span className="text-muted-foreground">
            {' '}
            · {day.count} purchase{day.count === 1 ? '' : 's'}
          </span>
        </p>
      )}
    </div>,
    document.body,
  );
}
