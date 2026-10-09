// Data categories are picked from the fixed registry (prd.md §6.1a, trd.md §4.6), never typed: a company cannot
// invent one, and the customer's wallet knows what each id means.
import type { ReactNode } from "react";
import { CATEGORY_GROUPS, DATA_CATEGORIES, normalizeCategories } from "@sammati/shared";

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
  invalid?: boolean;
  describedBy?: string;
}

export function CategoryPicker({ value, onChange, invalid, describedBy }: Props): ReactNode {
  const toggle = (id: string, on: boolean): void => onChange(normalizeCategories(on ? [...value, id] : value.filter((v) => v !== id)));
  return (
    <div className="mt-1 space-y-3 rounded-row border border-line bg-surface p-3" aria-invalid={invalid || undefined} aria-describedby={describedBy}>
      {CATEGORY_GROUPS.map((g) => (
        <fieldset key={g.id}>
          <legend className="text-sm font-bold text-ink">{g.label.en}</legend>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
            {DATA_CATEGORIES.filter((c) => c.group === g.id).map((c) => (
              <label key={c.id} className="flex min-h-8 items-center gap-2 text-base">
                <input type="checkbox" checked={value.includes(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} className="h-5 w-5 accent-ink" />
                <span>{c.label.en}</span>
                <span className="font-mono text-xs text-mute">{c.id}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
