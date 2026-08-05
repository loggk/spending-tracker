interface ColorInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
}

/**
 * A native color well that opens the OS color picker.
 */
export function ColorInput({ id, value, onChange }: ColorInputProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="size-9 cursor-pointer rounded-md border p-0 [&::-moz-color-swatch]:rounded-[inherit] [&::-moz-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-[inherit] [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch-wrapper]:p-0"
      />
      <span className="text-sm text-muted-foreground uppercase tabular-nums">{value}</span>
    </div>
  );
}
