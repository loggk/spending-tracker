import type { Category } from '@spending-tracker/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CategorySelectProps {
  categories: Category[];
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

export function CategorySelect({ categories, value, onChange, id }: CategorySelectProps) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next ?? '')}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Category" />
      </SelectTrigger>
      <SelectContent>
        {categories.map((category) => (
          <SelectItem key={category.id} value={category.id}>
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ backgroundColor: category.color }}
              />
              {category.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
