import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface IconButtonProps extends Omit<React.ComponentProps<typeof Button>, 'variant' | 'size'> {
  /** Accessible name; also the tooltip. */
  label: string;
  tone?: 'default' | 'destructive';
}

/** The quiet square action at the end of a list row: edit, delete, customize. */
export function IconButton({ label, tone = 'default', className, ...props }: IconButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      className={cn(
        'text-muted-foreground hover:bg-muted hover:text-foreground',
        tone === 'destructive' && 'hover:bg-destructive/10 hover:text-destructive',
        className,
      )}
      {...props}
    />
  );
}
