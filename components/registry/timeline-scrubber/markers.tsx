"use client";

import { cn } from "@/lib/utils";
import type { TimelineMarker } from "./types";

/**
 * Marker pips over the lane.
 *
 * Each one is a real button rather than a decorated span: a marker is a
 * navigation target, so it has to be reachable by keyboard and announce itself.
 * That is also why the snap tolerance is expressed in pixels upstream — the
 * pointer path and the tab path arrive at the identical time value, and only the
 * pointer needs slack.
 */
export default function Markers({
  markers,
  pxPerSecond,
  accent,
  onSeek,
  className,
}: {
  markers: TimelineMarker[];
  pxPerSecond: number;
  accent: string;
  onSeek: (time: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("pointer-events-none absolute inset-0", className)}>
      {markers.map((marker) => (
        <button
          key={marker.id}
          type="button"
          onClick={() => onSeek(marker.time)}
          title={marker.label}
          aria-label={`Jump to ${marker.label}`}
          className={cn(
            "pointer-events-auto absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1 outline-none",
            "focus-visible:ring-1 focus-visible:ring-(--marker-color) rounded-sm",
          )}
          style={
            {
              left: marker.time * pxPerSecond,
              "--marker-color": marker.color ?? accent,
            } as React.CSSProperties
          }
        >
          <span
            className="h-2 w-2 rotate-45 rounded-[2px]"
            style={{ backgroundColor: marker.color ?? accent }}
          />
          {/* The label hangs off the pip and is allowed to overflow the lane.
              Clipping it to the marker's own position would truncate every label
              to a couple of characters at any useful zoom. */}
          <span className="max-w-24 truncate font-display text-[9px] tracking-[0.14em] text-ink-mute uppercase">
            {marker.label}
          </span>
        </button>
      ))}
    </div>
  );
}
