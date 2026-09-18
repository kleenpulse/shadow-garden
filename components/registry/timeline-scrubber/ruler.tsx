"use client";

import { cn } from "@/lib/utils";
import { buildTicks, formatTimecode, tickStep } from "./util";

/**
 * The ruler. Every tick is absolutely positioned off the same seconds→px factor
 * the playhead uses, so a label can never disagree with where the head sits.
 *
 * Minor ticks are drawn at a fifth of the major step and carry no label. They
 * are not decoration: without them the eye has nothing to interpolate against
 * between two labelled seconds, and estimating a position by eye — which is what
 * a ruler is for — stops working.
 */
export default function Ruler({
  duration,
  fps,
  pxPerSecond,
  width,
  className,
}: {
  duration: number;
  fps: number;
  pxPerSecond: number;
  /** Track width in px, handed down already rounded. Deliberately not
   *  recomputed from `duration * pxPerSecond` — that product is fractional, and
   *  a ruler half a pixel wider than the track it sits in is enough to give the
   *  scroller a permanent horizontal scrollbar. One rounding, one owner. */
  width: number;
  className?: string;
}) {
  const major = tickStep(pxPerSecond);
  const minor = major / 5;

  // A tick lands on `duration` itself whenever the step divides it evenly, and a
  // one-pixel mark drawn AT the end of the track is by definition one pixel past
  // it — enough to overflow the scroller and park a horizontal scrollbar under a
  // timeline that fits. The track's own right edge already marks the end, so the
  // ruler has nothing to add there.
  const inside = (time: number) => time * pxPerSecond < width - 0.5;

  return (
    <div
      className={cn(
        "relative h-7 border-b border-hairline select-none",
        className,
      )}
      style={{ width }}
      aria-hidden
    >
      {buildTicks(duration, minor)
        .filter(inside)
        .map((time) => (
          <span
            key={`m-${time}`}
            className="absolute bottom-0 w-px bg-hairline"
            style={{ left: time * pxPerSecond, height: 6 }}
          />
        ))}

      {buildTicks(duration, major)
        .filter(inside)
        .map((time) => (
          <div
            key={`M-${time}`}
            className="absolute bottom-0 flex flex-col items-start"
            style={{ left: time * pxPerSecond }}
          >
            {/* Tabular figures, because the label is pinned to a tick: with
              proportional digits the string re-centres itself every time a 1
              becomes a 4 and the whole ruler appears to twitch. */}
            <span className="pl-1 font-mono text-[10px] tabular-nums text-ink-mute">
              {formatTimecode(time, fps)}
            </span>
            <span className="w-px bg-ink-mute/60" style={{ height: 10 }} />
          </div>
        ))}
    </div>
  );
}
