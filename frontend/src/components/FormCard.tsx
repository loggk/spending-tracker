import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** The compact "add a thing" form that sits under a page header. */
export function FormCard({ className, children, ...props }: React.ComponentProps<'form'>) {
  return (
    <Card className="px-5 py-[18px]">
      <form className={className} {...props}>
        {children}
      </form>
    </Card>
  );
}

interface FieldProps {
  label: string;
  htmlFor: string;
  className?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, className, children }: FieldProps) {
  return (
    <div className={cn('grid gap-[5px]', className)}>
      <Label htmlFor={htmlFor} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

/** Validation message, shown under the row of fields it belongs to. */
export function FieldError({ children }: { children: ReactNode }) {
  return <p className="mt-2.5 text-xs text-destructive">{children}</p>;
}
