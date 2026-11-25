/**
 * Click-to-sort for tables. Pure and client-safe: the header cycle (natural direction → reverse → default order)
 * and a stable sort where empty values always stay at the bottom, whatever the direction.
 */

export type SortDir = "asc" | "desc";
export interface SortState<K extends string = string> {
  key: K;
  dir: SortDir;
}
export type SortValue = string | number | boolean | Date | null | undefined;

/** Next state after a click on the `key` header: first click sorts in `firstDir`, the second reverses, the third clears. */
export function nextSort<K extends string>(current: SortState<K> | null, key: K, firstDir: SortDir = "asc"): SortState<K> | null {
  if (!current || current.key !== key) return { key, dir: firstDir };
  if (current.dir === firstDir) return { key, dir: firstDir === "asc" ? "desc" : "asc" };
  return null;
}

/** `aria-sort` of a header (only the sorted column carries it). */
export function ariaSort(sort: SortState | null, key: string): "ascending" | "descending" | undefined {
  if (!sort || sort.key !== key) return undefined;
  return sort.dir === "asc" ? "ascending" : "descending";
}

// French order: accents and case ignored, numbers inside text compared as numbers ("Studio 9" before "Studio 10").
const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

function normalize(v: SortValue): number | string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() === "" ? null : v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  return Number.isNaN(v) ? null : v;
}

/** Stable sort by `value`; empty values (null, undefined, "", invalid date, NaN) go last in both directions. */
export function sortRows<T>(rows: readonly T[], value: (row: T) => SortValue, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, v: normalize(value(row)) }))
    .sort((a, b) => {
      if (a.v === null || b.v === null) return a.v === b.v ? a.index - b.index : a.v === null ? 1 : -1;
      const c = typeof a.v === "number" && typeof b.v === "number" ? a.v - b.v : collator.compare(String(a.v), String(b.v));
      return c !== 0 ? sign * c : a.index - b.index;
    })
    .map((x) => x.row);
}
