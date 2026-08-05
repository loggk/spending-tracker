import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import type { DateRange as DayPickerRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDate } from '@/lib/format';

/** Both bounds are ISO `YYYY-MM-DD`; either side may be open. */
export interface DateRange {
  from?: string;
  to?: string;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (value: DateRange) => void;
  placeholder?: string;
  active?: boolean;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** The calendar hands back local-midnight Dates; read the calendar fields, not UTC. */
const toIso = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function parseIso(iso: string | undefined): Date | undefined {
  if (!iso) {
    return undefined;
  }
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) {
    return undefined;
  }
  return new Date(year, month - 1, day);
}

function label(value: DateRange, placeholder: string): string {
  if (value.from && value.to) {
    return value.from === value.to
      ? formatDate(value.from)
      : `${formatDate(value.from)} – ${formatDate(value.to)}`;
  }
  if (value.from) {
    return `From ${formatDate(value.from)}`;
  }
  if (value.to) {
    return `Through ${formatDate(value.to)}`;
  }
  return placeholder;
}

/**
 * A range calendar behind a button. Selections apply as they are made.
 */
export function DateRangePicker({
  value,
  onChange,
  placeholder = 'All dates',
  active = false,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const hasValue = Boolean(value.from ?? value.to);
  const selected: DayPickerRange | undefined = hasValue
    ? { from: parseIso(value.from), to: parseIso(value.to) }
    : undefined;

  function handleSelect(range: DayPickerRange | undefined) {
    onChange({
      from: range?.from ? toIso(range.from) : undefined,
      to: range?.to ? toIso(range.to) : undefined,
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant={active || hasValue ? 'secondary' : 'outline'} size="sm">
            <CalendarIcon data-icon="inline-start" />
            {label(value, placeholder)}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-auto p-2">
        <Calendar
          mode="range"
          numberOfMonths={2}
          showOutsideDays={false}
          defaultMonth={selected?.from ?? new Date()}
          selected={selected}
          onSelect={handleSelect}
        />
        {hasValue && (
          <Button
            variant="ghost"
            size="sm"
            className="self-end"
            onClick={() => {
              onChange({});
              setOpen(false);
            }}
          >
            Clear
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
