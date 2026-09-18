import type { TimelineMarker } from "./types";

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

const pad = (value: number) => String(Math.floor(value)).padStart(2, "0");

/**
 * `mm:ss:ff`. Frames rather than milliseconds because a timeline's smallest
 * meaningful unit is one frame — a readout in thousandths implies a precision
 * the transport cannot actually step to, and people try to hit it.
 */
export function formatTimecode(seconds: number, fps: number): string {
  const safe = Math.max(0, seconds);
  const whole = Math.floor(safe);
  // Rounding here rather than flooring would let a time one part in a thousand
  // short of the next second display as frame `fps`, which does not exist.
  const frames = Math.floor((safe - whole) * fps);
  return `${pad(whole / 60)}:${pad(whole % 60)}:${pad(frames)}`;
}

/**
 * Seconds per major tick. Picked off a fixed ladder rather than computed, so
 * zooming walks through the same handful of intervals every time instead of
 * landing on 3.7-second ticks at one zoom and 4.1 at the next. A ruler whose
 * divisions keep changing shape is a ruler nobody reads.
 */
const LADDER = [1 / 24, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

export function tickStep(pxPerSecond: number, minGapPx = 72): number {
  for (const step of LADDER) {
    if (step * pxPerSecond >= minGapPx) return step;
  }
  return LADDER[LADDER.length - 1];
}

/**
 * Tick times, built by multiplication rather than by accumulation. Adding `step`
 * in a loop drifts: at 0.1s over a ten-minute timeline the last tick lands
 * visibly off the second it claims to mark.
 */
export function buildTicks(duration: number, step: number): number[] {
  const count = Math.floor(duration / step);
  const out: number[] = [];
  for (let i = 0; i <= count; i++) out.push(i * step);
  return out;
}

/**
 * The nearest marker within `tolerance` seconds, or the original time. Ties go
 * to the earlier marker by virtue of the strict comparison — arbitrary, but
 * stable, which is what matters when two markers sit on top of each other.
 */
export function snapToMarkers(
  time: number,
  markers: TimelineMarker[],
  tolerance: number,
): number {
  let best = time;
  let bestDelta = tolerance;
  for (const marker of markers) {
    const delta = Math.abs(marker.time - time);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = marker.time;
    }
  }
  return best;
}
