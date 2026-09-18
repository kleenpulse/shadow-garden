"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { DataGridColumn, SortSpec } from "./types";
import { clamp, cycleSort } from "./util";

/**
 * Column widths and sort state.
 *
 * Widths live here as an override map rather than as a full width table seeded
 * from the column definitions. The difference matters when the caller adds a
 * column: an override map simply has no entry for it and the new column takes
 * its declared width, while a seeded table would either have to be rebuilt —
 * throwing away every resize the user has made — or would silently render the
 * new column at zero width.
 *
 * The resize itself never re-renders per pixel through React state on the
 * pointer path alone: `setWidths` is called with the same object identity when
 * the clamped width has not changed, so dragging into the minimum stops costing
 * renders instead of pinning the CPU at the end of the drag.
 */

export interface ColumnState<Row> {
  columns: DataGridColumn<Row>[];
  sorts: SortSpec[];
  widthOf(key: string): number;
  toggleSort(key: string, additive: boolean): void;
  /** Begin a resize. Returns a move handler and a release handler. */
  beginResize(key: string, startX: number): (clientX: number) => void;
}

const DEFAULT_WIDTH = 160;

export function useColumns<Row>(
  columns: DataGridColumn<Row>[],
  minColumnWidth: number,
): ColumnState<Row> {
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [sorts, setSorts] = useState<SortSpec[]>([]);

  // The width the drag started from, captured once. Deriving it from state on
  // every move makes the column creep: each move would resize relative to the
  // width the previous move produced.
  const anchor = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const declared = useMemo(() => {
    const map = new Map<string, number>();
    for (const column of columns) map.set(column.key, column.width ?? DEFAULT_WIDTH);
    return map;
  }, [columns]);

  const widthOf = useCallback(
    (key: string) => widths[key] ?? declared.get(key) ?? DEFAULT_WIDTH,
    [declared, widths],
  );

  const toggleSort = useCallback((key: string, additive: boolean) => {
    setSorts((current) => cycleSort(current, key, additive));
  }, []);

  const beginResize = useCallback(
    (key: string, startX: number) => {
      anchor.current = { key, startX, startWidth: widthOf(key) };
      return (clientX: number) => {
        const start = anchor.current;
        if (!start) return;
        const next = clamp(
          start.startWidth + (clientX - start.startX),
          minColumnWidth,
          1200,
        );
        setWidths((current) =>
          current[start.key] === next ? current : { ...current, [start.key]: next },
        );
      };
    },
    [minColumnWidth, widthOf],
  );

  return { columns, sorts, widthOf, toggleSort, beginResize };
}
