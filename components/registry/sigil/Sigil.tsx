"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// An SVG crest that draws itself in when it scrolls into view, stroke by stroke,
// as if traced by an invisible pen.
//
// Every path carries pathLength="1", so the dash geometry is normalised no matter
// how long the real path is — dashoffset runs 1 → 0 and the same timing applies to
// a 40px tick and a 600px arc. That removes the usual getTotalLength() measuring
// pass, and with it any need for a layout read or an animation frame: an
// IntersectionObserver arms it, CSS draws it.
export interface SigilProps {
  className?: string;
  /** Path `d` strings, drawn in order. Defaults to the Shadow Garden crest. */
  paths?: string[];
  /** viewBox of the supplied paths. */
  viewBox?: string;
  /** Milliseconds for a single stroke to draw. */
  duration?: number;
  /** Milliseconds to wait after entering view before the first stroke. */
  delay?: number;
  /** Stroke width in viewBox units. */
  strokeWidth?: number;
  /** Intensity of the bloom trailing the stroke, 0 → 1. */
  glow?: number;
  /** Re-arm when the crest leaves the viewport, so it redraws on the way back. */
  replayOnLeave?: boolean;
  /** Curve the stroke advances on. */
  easing?: "ease-out" | "linear" | "ease-in-out" | "dramatic";
  /** Stroke colour (hex). */
  strokeColor?: string;
  /** When true, the crest renders fully drawn with no animation. */
  reducedMotion?: boolean;
}

const CREST: string[] = [
  // Outer ring.
  "M 100 12 A 88 88 0 1 1 99.9 12",
  // Cardinal ticks.
  "M 100 12 L 100 42 M 100 158 L 100 188 M 12 100 L 42 100 M 158 100 L 188 100",
  // Diamond.
  "M 100 38 L 162 100 L 100 162 L 38 100 Z",
  // Shoulder arc.
  "M 56 56 A 62 62 0 0 1 144 56",
  // Inner ring.
  "M 100 66 A 34 34 0 1 1 99.9 66",
  // Central glyph.
  "M 88 92 L 100 116 L 112 92 M 92 104 L 108 104",
];

const EASING: Record<NonNullable<SigilProps["easing"]>, string> = {
  "ease-out": "cubic-bezier(0.22, 1, 0.36, 1)",
  linear: "linear",
  "ease-in-out": "cubic-bezier(0.65, 0, 0.35, 1)",
  dramatic: "cubic-bezier(0.83, 0, 0.17, 1)",
};

const SIGIL_CSS = `
@keyframes sg-sigil-draw { to { stroke-dashoffset: 0; } }
@media (prefers-reduced-motion: reduce) {
  [data-sg-sigil] path { animation: none !important; stroke-dashoffset: 0 !important; }
}
`;

export default function Sigil({
  className,
  paths = CREST,
  viewBox = "0 0 200 200",
  duration = 1800,
  delay = 0,
  strokeWidth = 1.5,
  glow = 0.5,
  replayOnLeave = true,
  easing = "ease-out",
  strokeColor = "#a855f7",
  reducedMotion = false,
}: SigilProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([hit]) => {
        if (hit?.isIntersecting) setDrawn(true);
        else if (replayOnLeave) setDrawn(false);
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [replayOnLeave]);

  // Each stroke starts a little into the one before it, so the crest assembles as
  // one continuous gesture rather than a queue of separate line animations.
  const step = duration * 0.42;
  const still = reducedMotion || !drawn;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <style>{SIGIL_CSS}</style>
      <svg
        data-sg-sigil
        viewBox={viewBox}
        fill="none"
        aria-hidden
        className="h-full w-full overflow-visible"
        style={{
          filter:
            glow > 0 && !reducedMotion
              ? `drop-shadow(0 0 ${(glow * 10).toFixed(1)}px ${strokeColor})`
              : undefined,
        }}
      >
        {paths.map((d, i) => (
          <path
            key={d}
            d={d}
            pathLength={1}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={1}
            // Reduced motion and the pre-arm state differ: pre-arm hides the
            // stroke so it can draw, reduced motion shows it already complete.
            strokeDashoffset={reducedMotion ? 0 : drawn ? undefined : 1}
            style={
              still
                ? undefined
                : {
                    strokeDashoffset: 1,
                    animation: `sg-sigil-draw ${duration}ms ${EASING[easing]} ${delay + i * step}ms forwards`,
                  }
            }
          />
        ))}
      </svg>
    </div>
  );
}
