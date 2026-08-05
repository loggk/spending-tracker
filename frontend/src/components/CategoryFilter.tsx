import type { Category } from '@spending-tracker/shared';
import { ListFilterIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface CategoryFilterProps {
  categories: Category[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
}

/** Multi-select category filter: checked categories are ORed together. */
export function CategoryFilter({ categories, selected, onChange }: CategoryFilterProps) {
  function toggle(categoryId: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) {
      next.add(categoryId);
    } else {
      next.delete(categoryId);
    }
    onChange(next);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant={selected.size > 0 ? 'secondary' : 'outline'} size="sm">
            <ListFilterIcon data-icon="inline-start" />
            {selected.size > 0 ? `Categories (${selected.size})` : 'Categories'}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-52">
        {categories.map((category) => (
          <DropdownMenuCheckboxItem
            key={category.id}
            checked={selected.has(category.id)}
            onCheckedChange={(checked) => toggle(category.id, checked)}
            closeOnClick={false}
          >
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: category.color }}
            />
            {category.name}
          </DropdownMenuCheckboxItem>
        ))}
        {selected.size > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onChange(new Set())}>Clear filter</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
