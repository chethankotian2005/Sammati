/**
 * DataTable — filterable, sortable table for consent rows, ledger events, etc.
 * (ui.md §3 "Consents: table of customers by purpose with status, filterable")
 *
 * Generic over a row type T.  The caller provides column definitions.
 * - Sticky header.
 * - Sort by clicking a column header (ascending / descending toggle).
 * - Optional filter input (searches all string-valued cells).
 * - Empty state message.
 * - Row striping for scannability.
 * - Uses radius-row on cells, not on the table itself (avoids generic card).
 */

import { useMemo, useState, type ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  /** Render the cell. Defaults to String(row[key]). */
  render?: (row: T) => ReactNode;
  /** Return a sortable string/number. If absent, column is not sortable. */
  sortValue?: (row: T) => string | number;
  /** Optional width class, e.g. "w-32". */
  width?: string;
  align?: "left" | "right" | "center";
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  /** Function to get a unique key per row. */
  rowKey: (row: T) => string;
  /** Show a search input above the table. Default true. */
  filterable?: boolean;
  /** String displayed when rows is empty (after filter). */
  emptyMessage?: string;
  /** Accessible label for the table. */
  caption?: string;
  /** Optional text to search all stringified cells against. Controlled externally. */
  filterValue?: string;
  onFilterChange?: (v: string) => void;
  className?: string;
}

type SortDir = "asc" | "desc";

function alignClass(a?: "left" | "right" | "center"): string {
  if (a === "right") return "text-right";
  if (a === "center") return "text-center";
  return "text-left";
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  filterable = true,
  emptyMessage = "No rows found.",
  caption,
  filterValue,
  onFilterChange,
  className = "",
}: DataTableProps<T>): ReactNode {
  const [internalFilter, setInternalFilter] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Support both controlled and uncontrolled filter
  const filter = filterValue !== undefined ? filterValue : internalFilter;
  const setFilter = onFilterChange ?? setInternalFilter;

  // Filter rows
  const filtered = useMemo(() => {
    if (!filter.trim()) return rows;
    const q = filter.toLowerCase();
    return rows.filter((row) =>
      columns.some((col) => {
        const raw = col.sortValue
          ? String(col.sortValue(row))
          : // fall back to stringifying the key if present on row
            String((row as Record<string, unknown>)[col.key] ?? "");
        return raw.toLowerCase().includes(q);
      }),
    );
  }, [rows, filter, columns]);

  // Sort rows
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return filtered;
    return [...filtered].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir, columns]);

  function handleSort(key: string): void {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {filterable && (
        <div className="flex items-center gap-2">
          <input
            type="search"
            aria-label="Filter rows"
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-56 rounded-row border border-line bg-surface px-3 py-2 text-sm placeholder:text-mute focus:outline-none focus-visible:border-marigold"
          />
          {filter && (
            <span className="text-xs text-mute">
              {sorted.length} of {rows.length}
            </span>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-pass border border-line">
        <table className="w-full border-collapse text-sm">
          {caption && (
            <caption className="sr-only">{caption}</caption>
          )}
          <thead>
            <tr className="bg-paper">
              {columns.map((col) => {
                const isSorted = sortKey === col.key;
                const canSort = !!col.sortValue;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    className={`border-b border-line px-4 py-3 font-semibold text-mute ${alignClass(col.align)} ${col.width ?? ""}`}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className="inline-flex items-center gap-1 hover:text-ink"
                        aria-sort={
                          isSorted
                            ? sortDir === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                      >
                        {col.header}
                        <span aria-hidden="true" className="text-xs">
                          {isSorted ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-12 text-center text-mute"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sorted.map((row, i) => (
                <tr
                  key={rowKey(row)}
                  className={`border-b border-line last:border-0 ${i % 2 === 1 ? "bg-paper/60" : "bg-surface"}`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 ${alignClass(col.align)} ${col.width ?? ""}`}
                    >
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
