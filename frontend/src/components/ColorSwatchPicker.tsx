import { PlusIcon } from 'lucide-react';
import { CATEGORY_COLORS } from '@/lib/palette';
import { cn } from '@/lib/utils';

interface ColorSwatchPickerProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
}

const SWATCH = 'size-[22px] shrink-0 cursor-pointer rounded-full outline-none transition-shadow';

/** Two rings: a gap in the card color, then the selection itself. */
const SELECTED_RING = 'shadow-[0_0_0_2px_var(--card),0_0_0_3.5px_var(--foreground)]';

/**
 * The preset palette, plus a well that opens the OS color picker for anything
 * else. The chosen color is always shown as a hex value beside the swatches.
 */
export function ColorSwatchPicker({ id, value, onChange }: ColorSwatchPickerProps) {
  const preset = CATEGORY_COLORS.some((color) => color.toLowerCase() === value.toLowerCase());

  return (
    <div className="flex items-center gap-1.5">
      {CATEGORY_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Use ${color}`}
          aria-pressed={color.toLowerCase() === value.toLowerCase()}
          onClick={() => onChange(color)}
          style={{ backgroundColor: color }}
          className={cn(
            SWATCH,
            'focus-visible:shadow-[0_0_0_2px_var(--card),0_0_0_3.5px_var(--primary)]',
            color.toLowerCase() === value.toLowerCase() && SELECTED_RING,
          )}
        />
      ))}

      <span aria-hidden className="mx-1 h-5 w-px bg-border" />

      <label
        className={cn(
          SWATCH,
          'relative flex items-center justify-center',
          preset
            ? 'border border-dashed border-input text-muted-foreground'
            : cn('text-primary-foreground', SELECTED_RING),
        )}
        style={preset ? undefined : { backgroundColor: value }}
        title="Pick a custom color"
      >
        {preset && <PlusIcon className="size-3" />}
        <input
          id={id}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>

      <span className="ml-1 text-xs text-muted-foreground uppercase tabular-nums">{value}</span>
    </div>
  );
}
