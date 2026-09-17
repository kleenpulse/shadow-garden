"use client";

import { useEffect, useRef } from "react";
import { useAnimationLoop } from "@/hooks/use-animation-loop";

// Stereoscopic channel-split type. The real text stays put — selectable, one
// announcement to a screen reader — while two aria-hidden copies in opposing
// ink colors slide against each other under the pointer, and the blend mode
// resolves the overlap back toward white. The depth is only ever in the
// fringes, which is exactly how a printed anaglyph works.
//
// The channels chase the pointer through an exponential lerp written straight
// to `transform` from the frame body — never through React state, which would
// re-render three text nodes per pointer sample. When the pointer has been
// quiet a moment, a slow bounded-phase sway takes the target over, so the
// split keeps breathing on an idle pane.

export type AnaglyphLayers = "two" | "three";
export type AnaglyphBlend = "screen" | "lighten" | "difference";

export interface AnaglyphProps {
  /** The headline. The base copy is real, selectable text. */
  text?: string;
  /** Peak channel separation at the pane edge. */
  maxShift?: number;
  /** How much pointer travel converts into separation. */
  response?: number;
  /** Chase time constant — the channels arrive after the cursor. */
  lag?: number;
  /** Idle drift amplitude once the pointer has gone quiet. */
  sway?: number;
  /** Two channels split on one axis; three adds a perpendicular half-shift ghost. */
  layers?: AnaglyphLayers;
  /** How the channels composite where they overlap. */
  blend?: AnaglyphBlend;
  /** First offset layer. */
  channelA?: string;
  /** Opposing offset layer. */
  channelB?: string;
  paused?: boolean;
  reducedMotion?: boolean;
  className?: string;
}

/** Seconds of pointer silence before the idle sway takes the wheel. */
const IDLE_AFTER = 1.5;
const TAU = Math.PI * 2;

const Anaglyph = ({
  text = "Anaglyph",
  maxShift = 14,
  response = 1,
  lag = 0.18,
  sway = 0.5,
  layers = "three",
  blend = "screen",
  channelA = "#c4b5fd",
  channelB = "#67e8f9",
  paused = false,
  reducedMotion = false,
  className = "",
}: AnaglyphProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const aRef = useRef<HTMLSpanElement | null>(null);
  const bRef = useRef<HTMLSpanElement | null>(null);
  const cRef = useRef<HTMLSpanElement | null>(null);

  const live = useRef({ maxShift, response, lag, sway, paused, reducedMotion });
  live.current = { maxShift, response, lag, sway, paused, reducedMotion };

  // Pointer state read by the frame body. `lastInput` is in sim time, so a
  // pause does not silently age the pointer into idleness.
  const state = useRef({
    tx: 0,
    ty: 0,
    x: 0,
    y: 0,
    time: 0,
    lastInput: -IDLE_AFTER,
    swayPhase: 0,
  });

  const loop = useAnimationLoop({
    target: containerRef,
    halted: paused || reducedMotion,
    onFrame: ({ dt }) => {
      const s = state.current;
      const cfg = live.current;
      const a = aRef.current;
      const b = bRef.current;
      const c = cRef.current;
      if (!a || !b) return;

      if (cfg.reducedMotion) {
        // A fixed diagonal split — the chromatic identity without the chase.
        const off = cfg.maxShift * 0.4;
        a.style.transform = `translate3d(${off}px, ${-off * 0.6}px, 0)`;
        b.style.transform = `translate3d(${-off}px, ${off * 0.6}px, 0)`;
        if (c) c.style.transform = `translate3d(${off * 0.3}px, ${off * 0.5}px, 0)`;
        return;
      }

      s.time += dt;

      let tx = s.tx;
      let ty = s.ty;
      if (s.time - s.lastInput > IDLE_AFTER) {
        // Two integer-harmonic components, phase wrapped mod 2π — the drift
        // loops seamlessly and the accumulator never rots.
        s.swayPhase = (s.swayPhase + dt * 0.55) % TAU;
        tx = Math.cos(s.swayPhase) * 0.5 * cfg.sway;
        ty = Math.sin(s.swayPhase * 2) * 0.35 * cfg.sway;
      }

      // Exponential chase: framerate-independent, and `lag` reads in seconds.
      const k = 1 - Math.exp(-dt / Math.max(cfg.lag, 0.01));
      s.x += (tx - s.x) * k;
      s.y += (ty - s.y) * k;

      const ox = s.x * cfg.maxShift;
      const oy = s.y * cfg.maxShift;
      a.style.transform = `translate3d(${ox}px, ${oy}px, 0)`;
      b.style.transform = `translate3d(${-ox}px, ${-oy}px, 0)`;
      if (c) c.style.transform = `translate3d(${-oy * 0.5}px, ${ox * 0.5}px, 0)`;
    },
  });

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const s = state.current;
    const cfg = live.current;
    s.tx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width - 0.5) * 2)) * cfg.response;
    s.ty = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height - 0.5) * 2)) * cfg.response;
    s.lastInput = s.time;
  };

  const onPointerLeave = () => {
    const s = state.current;
    s.tx = 0;
    s.ty = 0;
  };

  // Tuning while halted still repaints the static split once.
  useEffect(() => {
    loop.paint();
  }, [maxShift, response, lag, sway, layers, blend, channelA, channelB, loop]);

  const channel = (
    ref: React.RefObject<HTMLSpanElement | null>,
    color: string,
    opacity = 1,
  ) => (
    <span
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 will-change-transform"
      style={{ color, opacity, mixBlendMode: blend }}
    >
      {text}
    </span>
  );

  return (
    <div
      ref={containerRef}
      className={`relative inline-block ${className}`.trim()}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerLeave}
    >
      {/* The base copy carries the real color and the real text. */}
      <span className="relative">{text}</span>
      {channel(aRef, channelA)}
      {channel(bRef, channelB)}
      {layers === "three" && channel(cRef, channelB, 0.45)}
    </div>
  );
};

export default Anaglyph;
