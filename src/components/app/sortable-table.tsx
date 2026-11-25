"use client";

import { useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { ariaSort, nextSort, sortRows, type SortDir, type SortState, type SortValue } from "@/lib/table-sort";
import { cn } from "@/lib/utils";

/** A sortable column: what to compare, and the direction of the first click (numbers often read best descending). */
export interface SortColumn<T> {
  value: (row: T) => SortValue;
  firstDir?: SortDir;
}

/**
 * Click-to-sort state of a table. `columns` must be stable (module constant or memoized). Without a sorted column
 * the rows keep the order they came in, so the page's own ranking stays the default.
 */
export function useTableSort<T, K extends string>(rows: readonly T[], columns: Record<K, SortColumn<T>>) {
  const [sort, setSort] = useState<SortState<K> | null>(null);
  const sorted = useMemo(() => {
    const column = sort ? columns[sort.key] : undefined;
    return sort && column ? sortRows(rows, column.value, sort.dir) : [...rows];
  }, [rows, sort, columns]);
  const onSort = (key: K) => setSort((s) => nextSort(s, key, columns[key]?.firstDir ?? "asc"));
  return { rows: sorted, sort, onSort };
}

/** The clickable label inside a header cell; the arrow shows the direction (and appears on hover elsewhere). */
export function SortButton<K extends string>({
  column,
  sort,
  onSort,
  align = "left",
  children,
}: {
  column: K;
  sort: SortState<K> | null;
  onSort: (key: K) => void;
  align?: "left" | "right";
  children: ReactNode;
}) {
  const dir = sort?.key === column ? sort.dir : null;
  const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={cn(
        "group/sort -mx-1 inline-flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 whitespace-nowrap transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        align === "right" && "flex-row-reverse",
        dir && "text-foreground",
      )}
    >
      {children}
      <Icon aria-hidden className={cn("size-3.5 shrink-0", dir ? "opacity-100" : "opacity-0 group-hover/sort:opacity-50 group-focus-visible/sort:opacity-50")} />
    </button>
  );
}

/** `TableHead` whose label sorts the table. */
export function SortableHead<K extends string>({
  column,
  sort,
  onSort,
  align,
  children,
  ...props
}: Omit<ComponentProps<typeof TableHead>, "children"> & {
  column: K;
  sort: SortState<K> | null;
  onSort: (key: K) => void;
  align?: "left" | "right";
  children: ReactNode;
}) {
  return (
    <TableHead aria-sort={ariaSort(sort, column)} {...props}>
      <SortButton column={column} sort={sort} onSort={onSort} align={align}>
        {children}
      </SortButton>
    </TableHead>
  );
}
