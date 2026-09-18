"use client";

import { cn } from "@/lib/utils";

/**
 * The playhead: a full-height line with a grab handle at the top.
 *
 * Positioned with `translate3d` rather than `left`. `left` is a layout property,
 * so moving it every frame during playback invalidates layout for the entire
 * lane — including the ruler's several hundred absolutely-positioned ticks. A
 * transform is composited and touches none of it.
 *
 * `pointer-events-none` on the line, `auto` on the handle. The line has to cross
 * the whole lane to be readable, and a full-height invisible column that eats
 * clicks would make every marker under it unreachable.
 */
export default function Playhead({
  x,
  accent,
  dragging,
  className,
}: {
  /** Distance from the start of the track, in px. */
  x: number;
  accent: string;
  dragging: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-y-0 left-0 z-20", className)}
      style={{ transform: `translate3d(${x}px, 0, 0)` }}
      aria-hidden
    >
      <span
        className="absolute inset-y-0 -left-px w-0.5"
        style={{ backgroundColor: accent }}
      />
      <span
        className={cn(
          "pointer-events-auto absolute -top-1 -left-1.5 h-3 w-3 cursor-grab rounded-[3px] transition-transform",
          dragging && "scale-125 cursor-grabbing",
        )}
        style={{ backgroundColor: accent }}
      />
    </div>
  );
}
