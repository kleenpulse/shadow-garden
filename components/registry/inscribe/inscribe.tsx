"use client";

import { useLayoutEffect, useRef } from "react";
import { useAnimationLoop } from "@/hooks/use-animation-loop";

// Text engraved stroke by stroke. Each character is a real SVG <tspan> — the
// glyphs keep their native kerning and stay selectable — wearing the uniform
// dash trick: glyph outlines expose no pathLength, so every character carries
// the same dasharray and the chisel appears to travel at slightly different
// speeds through an M and an i. That variance is accepted on purpose; there
// is no API for measuring a <text> glyph's true perimeter, and chasing it
// per-glyph is a rabbit hole with no floor.
//
// The whole timeline — staggered strokes, the fill carving in, the hold, the
// wipe — runs as one clock on the animation-loop host, so the bench pause
// freezes the chisel mid-stroke instead of letting a timer chain finish
// without you. The hidden state is applied from JS before first paint, never
// in markup: with no JS at all the text simply sits there finished.

export type InscribeFinish = "engraved" | "inlay" | "stroke-only";

export interface InscribeProps {
  /** The inscription. */
  text?: string;
  /** Time for one character's stroke to draw. */
  duration?: number;
  /** Delay between one chisel start and the next. */
  stagger?: number;
  /** Beat between a finished stroke and its fill arriving. */
  fillDelay?: number;
  /** Chisel line weight in viewBox units. */
  strokeWidth?: number;
  /** Carved-in fill, bright accent inlay, or the bare trace. */
  finish?: InscribeFinish;
  /** Wipe and re-engrave on a timer. */
  replay?: boolean;
  /** Dwell on the finished engraving before the wipe. */
  replayDelay?: number;
  /** The chisel trace; the engraved fill derives from it at lower luminance,
   *  the inlay at full. */
  strokeColor?: string;
  paused?: boolean;
  reducedMotion?: boolean;
  className?: string;
}

/** Uniform dash length. Sized for the heaviest glyphs at font-size 84 —
 *  shorter and an M finishes drawing before its outline is closed. */
const DASH = 520;

/** Fill fade length once a character's stroke has closed. */
const FILL_S = 0.3;

/** Multiply a hex color toward black — the carved body of an engraved glyph. */
const darken = (hex: string, factor: number): string => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const ch = (s: string) =>
    Math.round(parseInt(s, 16) * factor)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(m[1])}${ch(m[2])}${ch(m[3])}`;
};

const Inscribe = ({
  text = "Inscribe",
  duration = 900,
  stagger = 90,
  fillDelay = 250,
  strokeWidth = 1.5,
  finish = "engraved",
  replay = true,
  replayDelay = 2500,
  strokeColor = "#c4b5fd",
  paused = false,
  reducedMotion = false,
  className = "",
}: InscribeProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const glyphRefs = useRef<Array<SVGTSpanElement | null>>([]);

  const chars = Array.from(text);

  const live = useRef({
    duration,
    stagger,
    fillDelay,
    replay,
    replayDelay,
    paused,
    reducedMotion,
    count: chars.length,
  });
  live.current = {
    duration,
    stagger,
    fillDelay,
    replay,
    replayDelay,
    paused,
    reducedMotion,
    count: chars.length,
  };

  const clock = useRef({ t: 0 });

  // Write a character's progress, skipping no-op writes so a long hold does
  // not spray identical style mutations every frame.
  const apply = (el: SVGTSpanElement, offset: number, fill: number) => {
    const o = offset.toFixed(2);
    const f = fill.toFixed(3);
    if (el.style.strokeDashoffset !== o) el.style.strokeDashoffset = o;
    if (el.style.fillOpacity !== f) el.style.fillOpacity = f;
  };

  const render = (t: number) => {
    const cfg = live.current;
    const dur = Math.max(cfg.duration, 50) / 1000;
    const stag = cfg.stagger / 1000;
    const fdel = cfg.fillDelay / 1000;
    for (let i = 0; i < cfg.count; i++) {
      const el = glyphRefs.current[i];
      if (!el) continue;
      const start = i * stag;
      const p = Math.min(Math.max((t - start) / dur, 0), 1);
      const fp = Math.min(Math.max((t - start - dur - fdel) / FILL_S, 0), 1);
      apply(el, DASH * (1 - p), fp);
    }
  };

  const totalFor = () => {
    const cfg = live.current;
    return (
      ((cfg.count - 1) * cfg.stagger + Math.max(cfg.duration, 50)) / 1000 +
      cfg.fillDelay / 1000 +
      FILL_S
    );
  };

  const loop = useAnimationLoop({
    target: containerRef,
    halted: paused,
    onFrame: ({ dt }) => {
      const cfg = live.current;
      const c = clock.current;

      if (cfg.reducedMotion) {
        // Straight to the finished engraving, then nothing left to advance.
        render(Number.POSITIVE_INFINITY);
        return false;
      }

      c.t += dt;
      const total = totalFor();

      if (c.t >= total) {
        render(total);
        if (!cfg.replay) return false;
        if (c.t >= total + cfg.replayDelay / 1000) c.t = 0;
        return;
      }
      render(c.t);
    },
  });

  // Reset before first paint — the markup itself never hides the text, so a
  // page with no JS shows the finished inscription instead of a blank line.
  useLayoutEffect(() => {
    clock.current.t = 0;
    if (reducedMotion) render(Number.POSITIVE_INFINITY);
    else render(0);
    loop.start();
    // render/totalFor read everything through live refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, finish, reducedMotion, loop]);

  // Re-arm the self-halted clock when the pause lifts or replay switches on.
  useLayoutEffect(() => {
    loop.start();
  }, [paused, replay, loop]);

  const vbWidth = Math.max(240, chars.length * 52 + 64);
  const fillColor =
    finish === "stroke-only"
      ? "none"
      : finish === "engraved"
        ? darken(strokeColor, 0.42)
        : strokeColor;

  return (
    <div ref={containerRef} className={`w-full ${className}`.trim()}>
      <svg viewBox={`0 0 ${vbWidth} 150`} className="block h-auto w-full">
        <text
          x={vbWidth / 2}
          y={78}
          textAnchor="middle"
          dominantBaseline="central"
          className="font-display font-bold"
          fontSize={84}
          letterSpacing="0.02em"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={DASH}
          style={
            finish === "engraved"
              ? {
                  // Inset relief: dark above, light below — carved into the
                  // panel rather than printed on it. One CSS filter beats
                  // duplicating the whole text twice for the same effect.
                  filter:
                    "drop-shadow(0 -1px 0 rgba(0,0,0,0.55)) drop-shadow(0 1px 0 rgba(255,255,255,0.14))",
                }
              : undefined
          }
        >
          {chars.map((ch, i) => (
            <tspan
              key={`${i}-${ch}`}
              ref={(el) => {
                glyphRefs.current[i] = el;
              }}
            >
              {ch === " " ? "\u00A0" : ch}
            </tspan>
          ))}
        </text>
      </svg>
    </div>
  );
};

export default Inscribe;
