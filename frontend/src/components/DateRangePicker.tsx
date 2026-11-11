import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Both bounds are ISO `YYYY-MM-DD`; either side may be open. */
export interface DateRange {
  from?: string;
  to?: string;
}

interface DateRangeFieldsProps {
  value: DateRange;
  onChange: (value: DateRange) => void;
  onDone: () => void;
}

/** Drops the year when both ends share it: "Sep 1 – Oct 31". */
function formatRange(value: DateRange): string | null {
  const from = value.from ? formatDate(value.from) : null;
  const to = value.to ? formatDate(value.to) : null;

  if (from && to) {
    const sameYear = value.from?.slice(0, 4) === value.to?.slice(0, 4);
    return `${sameYear ? from.replace(/,.*/, '') : from} – ${to}`;
  }
  return from ? `From ${from}` : to ? `Through ${to}` : null;
}

/**
 * The body of every date-range popover: two bounds and a way out. Shared so the
 * dashboard's custom range and the transactions filter are the same control.
 */
export function DateRangeFields({ value, onChange, onDone }: DateRangeFieldsProps) {
  return (
    <div className="grid w-[280px] gap-3 p-0.5">
      <div className="grid grid-cols-2 gap-2.5">
        <Bound label="From" id="range-from" value={value.from} onChange={(from) => onChange({ ...value, from })} />
        <Bound label="To" id="range-to" value={value.to} onChange={(to) => onChange({ ...value, to })} />
      </div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="text-[12.8px] font-medium text-muted-foreground hover:text-foreground"
          onClick={() => onChange({})}
        >
          Clear
        </button>
        <Button size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

function Bound({
  label,
  id,
  value,
  onChange,
}: {
  label: string;
  id: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="date"
        className="h-8"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || undefined)}
      />
    </div>
  );
}

/** The filter-bar control: an outline button that opens the shared fields. */
export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (value: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = formatRange(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn('max-w-full', label && 'border-transparent bg-track')}
          >
            <CalendarIcon data-icon="inline-start" />
            <span className="truncate">{label ?? 'Dates'}</span>
          </Button>
        }
      />
      <PopoverContent align="end" className="w-auto">
        <DateRangeFields value={value} onChange={onChange} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
