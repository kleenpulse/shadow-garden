import type { ReactNode } from "react";

/** What a column can sort on. Anything richer has to reduce to one of these. */
export type CellValue = string | number | boolean | null;

export interface DataGridColumn<Row> {
  key: string;
  header: string;
  /** Starting width in px. Resizing overrides it; it is never read again after. */
  width?: number;
  align?: "left" | "right";
  /**
   * The sortable, comparable value. Kept separate from `render` on purpose: a
   * cell that renders a badge or a formatted date still has to sort by the thing
   * underneath, and deriving the sort key from rendered output is how grids end
   * up ordering "10 KB" before "9 KB".
   */
  value: (row: Row) => CellValue;
  /** Optional presentation. Falls back to the raw `value`. */
  render?: (row: Row) => ReactNode;
}

export type SortDirection = "asc" | "desc";

export interface SortSpec {
  key: string;
  direction: SortDirection;
}

/**
 * - `none` — rows are display only.
 * - `single` — one row at a time; a click replaces whatever was selected.
 * - `range` — click sets the anchor, Shift+click takes everything between,
 *   Ctrl/Cmd+click toggles one without disturbing the rest.
 */
export type SelectionMode = "none" | "single" | "range";
