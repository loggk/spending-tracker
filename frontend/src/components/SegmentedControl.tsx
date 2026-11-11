import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

/** Classes a custom segment has to carry to look like a built-in one. */
export interface SegmentRenderProps {
  className: string;
  active: boolean;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  /** `md` labels its segments; `sm` is an icon-only switch between chart views. */
  size?: 'md' | 'sm';
  value?: T;
  onChange?: (value: T) => void;
  /**
   * Lets the caller render a segment as something else, such as a router link
   * or a popover trigger. Returning `undefined` keeps the built-in button.
   */
  renderItem?: (option: SegmentOption<T>, props: SegmentRenderProps) => ReactNode | undefined;
  label?: string;
  className?: string;
}

const TRACK = {
  md: 'gap-0.5 rounded-[10px] bg-track p-[3px]',
  sm: 'gap-0.5 rounded-lg bg-muted p-0.5',
} as const;

const ITEM = {
  md: 'h-7 gap-1.5 rounded-[7px] px-3 text-[13px] font-medium',
  sm: 'h-6 w-[26px] rounded-md [&_svg]:size-3.5',
} as const;

/**
 * A raised segment on a sunken track: one option is always active. Used for the
 * top nav, the dashboard's range picker and the per-card chart toggles, so all
 * three stay the same control at different sizes.
 */
export function SegmentedControl<T extends string>({
  options,
  size = 'md',
  value,
  onChange,
  renderItem,
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('inline-flex items-center', TRACK[size], className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        const itemClassName = cn(
          'inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-primary/15',
          ITEM[size],
          active
            ? 'bg-card text-foreground shadow-segment'
            : 'text-muted-foreground hover:text-foreground',
        );

        const rendered = renderItem?.(option, { className: itemClassName, active });
        if (rendered !== undefined) {
          return rendered;
        }

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            aria-label={size === 'sm' ? option.label : undefined}
            title={size === 'sm' ? option.label : undefined}
            className={itemClassName}
            onClick={() => onChange?.(option.value)}
          >
            {option.icon}
            {size === 'md' && option.label}
          </button>
        );
      })}
    </div>
  );
}
