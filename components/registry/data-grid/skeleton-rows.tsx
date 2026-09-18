"use client";

import { cn } from "@/lib/utils";
import type { DataGridColumn } from "./types";

/**
 * Placeholder rows for the interval before data exists.
 *
 * They occupy the same height and the same column widths as real rows, which is
 * the entire point: a spinner in the middle of an empty box tells you to wait,
 * and then the layout jumps when the data lands. A skeleton tells you what shape
 * is coming and then nothing moves.
 *
 * Bar widths come off the row index rather than from a random number, so the
 * pattern is stable across re-renders. A skeleton whose bars change length every
 * render is a second animation nobody asked for, and it reads as the data
 * arriving over and over.
 */
const WIDTHS = [0.82, 0.55, 0.7, 0.4, 0.9, 0.62, 0.75, 0.5];

export default function SkeletonRows<Row>({
  columns,
  count,
  rowHeight,
  widthOf,
  animate,
}: {
  columns: DataGridColumn<Row>[];
  count: number;
  rowHeight: number;
  widthOf: (key: string) => number;
  /** Off under reduced motion — the placeholder still reads as a placeholder. */
  animate: boolean;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          role="row"
          aria-hidden
          className="flex items-stretch border-b border-hairline/60"
          style={{ height: rowHeight }}
        >
          {columns.map((column, column_index) => (
            <div
              key={column.key}
              className="flex shrink-0 items-center px-3"
              style={{ width: widthOf(column.key) }}
            >
              <span
                className={cn(
                  "h-2 rounded-full bg-ink-mute/25",
                  animate && "animate-pulse",
                )}
                style={{
                  width: `${WIDTHS[(index + column_index) % WIDTHS.length] * 100}%`,
                  // Staggered so the row does not pulse as one solid block,
                  // which reads as a flashing bar rather than as loading content.
                  animationDelay: animate ? `${((index * 3 + column_index) % 6) * 90}ms` : undefined,
                }}
              />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
