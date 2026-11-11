import type { DateRange } from '@/components/DateRangePicker';
import type { RangeKey } from './analytics';

const UTC_MONTH_DAY = { month: 'short', day: 'numeric', timeZone: 'UTC' } as const;

const parse = (iso: string): Date => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
};

const monthDay = (iso: string): string => parse(iso).toLocaleDateString('en-US', UTC_MONTH_DAY);

/**
 * Says a span as briefly as it can be said without losing it: "Nov 1 – 10"
 * inside one month, "Jan 1 – Nov 10" inside one year, both years otherwise.
 * `withYear` keeps the year on a same-year span, for use as a heading.
 */
export function formatSpan(from: string, to: string, withYear = false): string {
  const [fromYear, fromMonth] = [from.slice(0, 4), from.slice(5, 7)];
  const [toYear, toMonth] = [to.slice(0, 4), to.slice(5, 7)];

  if (fromYear !== toYear) {
    return `${monthDay(from)}, ${fromYear} – ${monthDay(to)}, ${toYear}`;
  }

  const span =
    fromMonth === toMonth
      ? `${monthDay(from)} – ${parse(to).getUTCDate()}`
      : `${monthDay(from)} – ${monthDay(to)}`;

  return withYear ? `${span}, ${toYear}` : span;
}

export interface Period {
  /** The span itself, above the title. */
  eyebrow: string;
  /** What the period is called: "November 2026", "2026", "All time". */
  title: string;
  /**
   * What the trend chart spans. It runs to the end of the period rather than to
   * today, so the days or months still to come read as empty rather than absent.
   */
  display: DateRange;
}

const iso = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Turns the chosen range into everything the dashboard header and trend chart
 * need to label themselves.
 */
export function describePeriod(
  preset: RangeKey,
  custom: DateRange,
  firstTransactionDate: string | undefined,
  now = new Date(),
): Period {
  const today = iso(now);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  if (custom.from ?? custom.to) {
    const from = custom.from ?? firstTransactionDate ?? today;
    const to = custom.to ?? today;
    return {
      eyebrow: 'Custom range',
      title: formatSpan(from, to, true),
      display: { from, to },
    };
  }

  if (preset === 'month') {
    const from = iso(new Date(Date.UTC(year, month, 1)));
    return {
      eyebrow: formatSpan(from, today),
      title: parse(from).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
      display: { from, to: iso(new Date(Date.UTC(year, month + 1, 0))) },
    };
  }

  if (preset === 'year') {
    const from = iso(new Date(Date.UTC(year, 0, 1)));
    return {
      eyebrow: formatSpan(from, today),
      title: String(year),
      display: { from, to: iso(new Date(Date.UTC(year, 11, 31))) },
    };
  }

  const from = firstTransactionDate ?? today;
  return {
    eyebrow: formatSpan(from, today),
    title: 'All time',
    display: { from, to: today },
  };
}
