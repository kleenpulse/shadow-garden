import type { CellValue, DataGridColumn, SortSpec } from "./types";

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * One ordering for every value a cell can hold.
 *
 * Nulls sort last in both directions rather than being treated as the smallest
 * value. A missing value is not a small value, and letting it flip to the top
 * when you reverse the sort means the first screenful of a descending sort is
 * the rows with no data in the column you just asked to sort by.
 */
export function compareValues(a: CellValue, b: CellValue): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);

  // `numeric` so "file10" lands after "file9", and `sensitivity: base` so case
  // does not split what a reader sees as one group.
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

/**
 * Multi-key sort, first key wins. Relies on Array.prototype.sort being stable —
 * specified since ES2019 — which is what lets an unsorted remainder keep the
 * order it arrived in instead of being scrambled on every re-sort.
 */
export function sortRows<Row>(
  rows: Row[],
  sorts: SortSpec[],
  columns: DataGridColumn<Row>[],
): Row[] {
  if (sorts.length === 0) return rows;

  const lookup = new Map(columns.map((column) => [column.key, column]));

  return [...rows].sort((left, right) => {
    for (const sort of sorts) {
      const column = lookup.get(sort.key);
      if (!column) continue;
      const result = compareValues(column.value(left), column.value(right));
      if (result !== 0) return sort.direction === "asc" ? result : -result;
    }
    return 0;
  });
}

/** Every index between two, inclusive, in ascending order. */
export function rangeBetween(a: number, b: number): number[] {
  const from = Math.min(a, b);
  const to = Math.max(a, b);
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

/**
 * Cycle a column's sort: unsorted → ascending → descending → unsorted.
 *
 * The third state is not optional. Without it there is no way back to the
 * order the data arrived in, and for a grid whose incoming order is meaningful
 * — most recent first, say — one click destroys it permanently.
 */
export function cycleSort(
  sorts: SortSpec[],
  key: string,
  additive: boolean,
): SortSpec[] {
  const existing = sorts.find((sort) => sort.key === key);
  const others = additive ? sorts.filter((sort) => sort.key !== key) : [];

  if (!existing) return [...others, { key, direction: "asc" }];
  if (existing.direction === "asc") return [...others, { key, direction: "desc" }];
  return others;
}

export function formatCell(value: CellValue): string {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
