"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import BodyRows from "./body-rows";
import HeaderRow from "./header-row";
import SkeletonRows from "./skeleton-rows";
import { useColumns } from "./use-columns";
import { useVirtualRows } from "./use-virtual-rows";
import { rangeBetween, sortRows } from "./util";
import type { DataGridColumn, SelectionMode } from "./types";

// A virtualised grid: windowed rows, resizable and multi-sortable columns, range
// selection, and keyboard navigation that does not fall apart when the row you
// are standing on gets recycled.
//
// ── One scroller, not two ───────────────────────────────────────────────────
// Header and body live inside the same scrolling element, with the header
// `position: sticky`. The usual alternative is two scrollers whose horizontal
// offsets are kept in sync by hand, and that synchronisation is never actually
// synchronous: the header lags the body by a frame on every fast horizontal
// flick, which is the visual signature of exactly that implementation. The cost
// of doing it this way is that `scrollTop` includes the header, so the window
// calculation has to subtract it — one line, in one place, and it is why
// `useVirtualRows` takes a leading offset.
//
// ── Selection is keyed by row id, not by index ──────────────────────────────
// So it survives sorting. Re-sort the grid and the same rows stay selected under
// you instead of the same *positions* staying selected, which is what happens
// whenever a grid stores indices and is always wrong.
//
// ── Focus stays on the viewport ─────────────────────────────────────────────
// Rows are pointed at with `aria-activedescendant` rather than each holding a
// roving tabindex. A virtualised row can be unmounted while focused, at which
// point focus falls to `body` and the arrow keys go dead. The viewport never
// unmounts, so the failure mode does not exist rather than being handled.
//
// ── THE GRID NEEDS A BOUNDED HEIGHT ─────────────────────────────────────────
// Give it a parent with a definite height — a fixed height, a flex child with
// `min-h-0`, or an `absolute inset-0` box. Every windowing implementation shares
// this requirement and it is worth stating plainly, because the failure is
// silent rather than loud: in an auto-height parent the scroller grows to fit
// all its rows, the measured viewport height becomes the height of the entire
// dataset, the window resolves to "everything", and the grid renders every row
// it has. Nothing errors. It simply stops being virtualised, and you only find
// out from the node count.

export interface DataGridProps<Row> {
  rows?: Row[];
  columns?: DataGridColumn<Row>[];
  /** Stable identity per row. Selection is stored as these, never as indices. */
  getRowId: (row: Row) => string;
  className?: string;
  /** Height of one row, in px. Fixed — that is what makes the window O(1). */
  rowHeight?: number;
  /** Height of the header, in px. */
  headerHeight?: number;
  /** Extra rows rendered above and below the fold. */
  overscan?: number;
  /** Floor a column can be dragged to, in px. */
  minColumnWidth?: number;
  /** Keep the header pinned while the body scrolls. */
  stickyHeader?: boolean;
  /** Allow dragging column edges. */
  resizableColumns?: boolean;
  /** Allow clicking a header to sort. */
  sortable?: boolean;
  /** Shift-click a second header to sort by it as a tiebreak. */
  multiSort?: boolean;
  /** How rows may be selected. */
  selectionMode?: SelectionMode;
  /** Band alternate rows. */
  zebra?: boolean;
  /** Render placeholder rows instead of data. */
  showSkeleton?: boolean;
  /** Selection highlight, active-row marker and sorted-header colour. */
  accent?: string;
  /** Hold the skeleton's shimmer still. */
  reducedMotion?: boolean;
  /** Shown when there are no rows and no skeleton. */
  emptyMessage?: string;
  onSelectionChange?: (ids: string[]) => void;
}

export default function DataGrid<Row>({
  rows = [],
  columns = [],
  getRowId,
  className,
  rowHeight = 34,
  headerHeight = 34,
  overscan = 6,
  minColumnWidth = 80,
  stickyHeader = true,
  resizableColumns = true,
  sortable = true,
  multiSort = true,
  selectionMode = "range",
  zebra = true,
  showSkeleton = false,
  accent = "#a855f7",
  reducedMotion = false,
  emptyMessage = "Nothing here yet.",
  onSelectionChange,
}: DataGridProps<Row>) {
  const gridId = useId();
  const { sorts, widthOf, toggleSort, beginResize } = useColumns(columns, minColumnWidth);

  const sorted = useMemo(() => sortRows(rows, sorts, columns), [rows, sorts, columns]);

  const window_ = useVirtualRows(sorted.length, rowHeight, overscan, headerHeight);
  const { viewportRef, first, last, totalHeight, offsetTop, height, onScroll } = window_;

  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  // Where a Shift-extended range measures from. A ref, not state: changing it
  // never needs a render, and reading a stale one mid-gesture would silently
  // select the wrong range.
  const anchorIndex = useRef(0);

  useEffect(() => {
    onSelectionChange?.([...selected]);
  }, [selected, onSelectionChange]);

  const totalWidth = columns.reduce((sum, column) => sum + widthOf(column.key), 0);

  const select = useCallback(
    (index: number, mode: "replace" | "extend" | "toggle") => {
      if (selectionMode === "none") return;
      const row = sorted[index];
      if (!row) return;
      const id = getRowId(row);

      if (selectionMode === "single" || mode === "replace") {
        setSelected(new Set([id]));
        anchorIndex.current = index;
        return;
      }
      if (mode === "extend") {
        const next = new Set<string>();
        for (const i of rangeBetween(anchorIndex.current, index)) {
          const other = sorted[i];
          if (other) next.add(getRowId(other));
        }
        setSelected(next);
        return;
      }
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      anchorIndex.current = index;
    },
    [getRowId, selectionMode, sorted],
  );

  const move = useCallback(
    (to: number, extend: boolean) => {
      const clamped = Math.max(0, Math.min(sorted.length - 1, to));
      setActiveIndex(clamped);
      window_.scrollRowIntoView(clamped);
      if (extend) select(clamped, "extend");
    },
    [select, sorted.length, window_],
  );

  const slice = showSkeleton ? [] : sorted.slice(first, last);
  const skeletonCount = Math.max(1, Math.ceil((height || 240) / Math.max(rowHeight, 1)));

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-2xl border border-hairline bg-panel",
        className,
      )}
    >
      <div
        ref={viewportRef}
        onScroll={onScroll}
        tabIndex={0}
        role="grid"
        aria-rowcount={sorted.length + 1}
        aria-colcount={columns.length}
        aria-multiselectable={selectionMode === "range"}
        aria-activedescendant={
          selectionMode === "none" || showSkeleton || sorted.length === 0
            ? undefined
            : `${gridId}-row-${activeIndex}`
        }
        // `flex-1 min-h-0` rather than `h-full`: inside a flex column, a percentage
        // height resolves against a parent that this element's own overflow is
        // free to inflate, while a flex basis of zero plus a zero minimum floor
        // is what actually pins a scroller to the space left over.
        className="relative min-h-0 w-full flex-1 overflow-auto outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent"
        onKeyDown={(event) => {
          if (showSkeleton || sorted.length === 0) return;
          const extend = event.shiftKey && selectionMode === "range";
          // Page size comes off the measured viewport, so PageDown always lands
          // exactly one screenful on rather than a hardcoded guess that is wrong
          // at every height but one.
          const page = Math.max(1, Math.floor(height / Math.max(rowHeight, 1)) - 1);

          switch (event.key) {
            case "ArrowDown":
              event.preventDefault();
              move(activeIndex + 1, extend);
              return;
            case "ArrowUp":
              event.preventDefault();
              move(activeIndex - 1, extend);
              return;
            case "PageDown":
              event.preventDefault();
              move(activeIndex + page, extend);
              return;
            case "PageUp":
              event.preventDefault();
              move(activeIndex - page, extend);
              return;
            case "Home":
              event.preventDefault();
              move(0, extend);
              return;
            case "End":
              event.preventDefault();
              move(sorted.length - 1, extend);
              return;
            case " ":
            case "Enter":
              event.preventDefault();
              select(activeIndex, event.ctrlKey || event.metaKey ? "toggle" : "replace");
              return;
            case "a":
              if (!event.ctrlKey && !event.metaKey) return;
              if (selectionMode !== "range") return;
              event.preventDefault();
              setSelected(new Set(sorted.map(getRowId)));
              return;
            default:
          }
        }}
      >
        <div style={{ width: Math.max(totalWidth, 1) }}>
          <div className={cn(stickyHeader && "sticky top-0 z-20")}>
            <HeaderRow
              columns={columns}
              sorts={sorts}
              sortable={sortable}
              multiSort={multiSort}
              resizable={resizableColumns}
              height={headerHeight}
              accent={accent}
              widthOf={widthOf}
              onToggleSort={toggleSort}
              onBeginResize={beginResize}
            />
          </div>

          {showSkeleton ? (
            <SkeletonRows
              columns={columns}
              count={skeletonCount}
              rowHeight={rowHeight}
              widthOf={widthOf}
              animate={!reducedMotion}
            />
          ) : sorted.length === 0 ? (
            <p className="p-8 text-center text-xs text-ink-mute">{emptyMessage}</p>
          ) : (
            // The spacer carries the full list height so the scrollbar describes
            // the whole dataset; the window is translated into place inside it.
            <div style={{ height: totalHeight, position: "relative" }}>
              <div style={{ transform: `translateY(${offsetTop}px)` }}>
                <BodyRows
                  rows={slice}
                  columns={columns}
                  first={first}
                  rowHeight={rowHeight}
                  zebra={zebra}
                  accent={accent}
                  gridId={gridId}
                  activeIndex={activeIndex}
                  selected={selected}
                  widthOf={widthOf}
                  rowId={getRowId}
                  onPick={(index, event) => {
                    setActiveIndex(index);
                    select(
                      index,
                      event.shiftKey
                        ? "extend"
                        : event.ctrlKey || event.metaKey
                          ? "toggle"
                          : "replace",
                    );
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
