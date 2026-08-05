export interface LegendItem {
  key: string;
  name: string;
  color: string;
}

export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          {item.name}
        </li>
      ))}
    </ul>
  );
}
