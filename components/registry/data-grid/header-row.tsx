"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DataGridColumn, SortSpec } from "./types";

/**
 * The header: one sort button and one resize handle per column.
 *
 * The resize handle is a sibling of the sort button, not a child of it. Nesting
 * them would mean every resize drag also fires a click on the sort button when
 * it ends, so no column could be resized without being re-sorted.
 *
 * Multi-sort rank is printed next to the arrow. Two arrows with no numbers do
 * not tell you which one is the primary key, and getting that wrong is the whole
 * difference between "by department, then by name" and "by name, then by
 * department".
 */
export default function HeaderRow<Row>({
  columns,
  sorts,
  sortable,
  multiSort,
  resizable,
  height,
  accent,
  widthOf,
  onToggleSort,
  onBeginResize,
}: {
  columns: DataGridColumn<Row>[];
  sorts: SortSpec[];
  sortable: boolean;
  multiSort: boolean;
  resizable: boolean;
  height: number;
  accent: string;
  widthOf: (key: string) => number;
  onToggleSort: (key: string, additive: boolean) => void;
  onBeginResize: (key: string, startX: number) => (clientX: number) => void;
}) {
  return (
    <div role="row" className="flex border-b border-hairline bg-panel" style={{ height }}>
      {columns.map((column) => {
        const rank = sorts.findIndex((sort) => sort.key === column.key);
        const sort = rank === -1 ? null : sorts[rank];

        return (
          <div
            key={column.key}
            role="columnheader"
            aria-sort={
              !sort ? "none" : sort.direction === "asc" ? "ascending" : "descending"
            }
            className="relative flex shrink-0 items-center border-r border-hairline last:border-r-0"
            style={{ width: widthOf(column.key) }}
          >
            <button
              type="button"
              disabled={!sortable}
              onClick={(event) => onToggleSort(column.key, multiSort && event.shiftKey)}
              className={cn(
                "flex h-full w-full items-center gap-1.5 px-3 text-left outline-none transition-colors",
                "font-display text-[10px] tracking-[0.16em] uppercase",
                sort ? "text-ink" : "text-ink-mute",
                sortable && "hover:text-ink focus-visible:text-ink",
                !sortable && "cursor-default",
              )}
              style={sort ? { color: accent } : undefined}
            >
              <span className="truncate">{column.header}</span>
              {sortable ? (
                <span className="ml-auto flex shrink-0 items-center gap-0.5 [&_svg]:h-3 [&_svg]:w-3">
                  {!sort ? (
                    // Held at low opacity rather than hidden until hover: an
                    // affordance that only appears on hover is invisible to
                    // anyone deciding whether the grid sorts at all.
                    <ChevronsUpDown className="opacity-30" />
                  ) : sort.direction === "asc" ? (
                    <ArrowUp />
                  ) : (
                    <ArrowDown />
                  )}
                  {multiSort && sorts.length > 1 && rank !== -1 ? (
                    <span className="font-mono text-[9px] tabular-nums">{rank + 1}</span>
                  ) : null}
                </span>
              ) : null}
            </button>

            {resizable ? (
              <span
                role="separator"
                aria-orientation="vertical"
                aria-label={`Resize ${column.header}`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const target = event.currentTarget;
                  target.setPointerCapture(event.pointerId);
                  const move = onBeginResize(column.key, event.clientX);

                  const onMove = (moveEvent: PointerEvent) => move(moveEvent.clientX);
                  const onUp = () => {
                    target.removeEventListener("pointermove", onMove);
                    target.removeEventListener("pointerup", onUp);
                    target.removeEventListener("pointercancel", onUp);
                  };
                  target.addEventListener("pointermove", onMove);
                  target.addEventListener("pointerup", onUp);
                  target.addEventListener("pointercancel", onUp);
                }}
                // Wider than it looks. The visible line is 1px because that is
                // what reads as a column edge; the grab area is 9px because 1px
                // is not a target anybody can hit.
                className="absolute top-0 right-0 z-10 h-full w-[9px] translate-x-1/2 cursor-col-resize touch-none"
              >
                <span className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-transparent transition-colors hover:bg-current" />
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
