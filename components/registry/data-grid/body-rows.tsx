"use client";

import { cn } from "@/lib/utils";
import type { DataGridColumn } from "./types";
import { formatCell } from "./util";

/**
 * The rendered window.
 *
 * Rows carry a DOM `id` and the viewport points at one of them with
 * `aria-activedescendant`, rather than each row taking a roving tabindex. In a
 * virtualised grid the focused row can be scrolled out and unmounted while it
 * still holds focus, at which point the browser drops focus to `body` and the
 * arrow keys stop working — the classic virtualisation-plus-roving-tabindex bug.
 * Keeping real focus on the viewport, which never unmounts, removes the failure
 * mode instead of papering over it.
 */
export default function BodyRows<Row>({
  rows,
  columns,
  first,
  rowHeight,
  zebra,
  accent,
  gridId,
  activeIndex,
  selected,
  widthOf,
  rowId,
  onPick,
}: {
  /** The window slice only, not the full list. */
  rows: Row[];
  columns: DataGridColumn<Row>[];
  /** Absolute index of `rows[0]` in the full list. */
  first: number;
  rowHeight: number;
  zebra: boolean;
  accent: string;
  gridId: string;
  activeIndex: number;
  selected: ReadonlySet<string>;
  widthOf: (key: string) => number;
  rowId: (row: Row) => string;
  onPick: (index: number, event: React.MouseEvent) => void;
}) {
  return (
    <>
      {rows.map((row, offset) => {
        const index = first + offset;
        const id = rowId(row);
        const isSelected = selected.has(id);
        const isActive = index === activeIndex;

        return (
          <div
            key={id}
            id={`${gridId}-row-${index}`}
            role="row"
            aria-rowindex={index + 2}
            aria-selected={isSelected}
            onMouseDown={(event) => onPick(index, event)}
            className={cn(
              "flex cursor-default items-stretch border-b border-hairline/60",
              // Banding is computed from the ABSOLUTE index, not the offset
              // inside the window. Off the offset it would repaint itself every
              // time you scrolled, which is a stripe pattern that crawls.
              zebra && index % 2 === 1 && "bg-raised/40",
              isSelected ? "bg-accent-muted/25" : "hover:bg-raised/60",
            )}
            style={{
              height: rowHeight,
              boxShadow: isActive ? `inset 2px 0 0 0 ${accent}` : undefined,
            }}
          >
            {columns.map((column) => (
              <div
                key={column.key}
                role="gridcell"
                className={cn(
                  "flex shrink-0 items-center overflow-hidden px-3 text-xs whitespace-nowrap",
                  column.align === "right"
                    ? "justify-end text-right font-mono tabular-nums"
                    : "text-left",
                  isSelected ? "text-ink" : "text-ink-dim",
                )}
                style={{ width: widthOf(column.key) }}
              >
                <span className="truncate">
                  {column.render ? column.render(row) : formatCell(column.value(row))}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}
