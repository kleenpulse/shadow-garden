"use client";

import { memo, useCallback, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
} from "motion/react";

// A machined rotary knob: angular drag, detents you can feel, inertia on a
// flick, and arrow keys that step through the same spring the hand does.
//
// Three decisions carry the component.
//
// **The angle is a motion value, never React state.** A drag writes it sixty
// times a second and a spring writes it more often than that; routing either
// through `setState` re-renders the whole knob per frame and turns an
// interruptible spring into a queue of stale renders. React holds one number —
// the detent index — and only when that integer actually changes, which is what
// the readout and the lit tick need and nothing more.
//
// **The delta is accumulated, not measured.** Taking `atan2` of the pointer and
// subtracting the angle it started at breaks the moment the hand crosses the far
// side of the knob, because the reading jumps by a full turn. Accumulating the
// shortest arc between consecutive samples has no wrap to cross, and it is also
// what lets a drag wind past a full rotation.
//
// **Release projects, then snaps.** A flick throws the knob forward by its own
// velocity, and only then is the nearest detent chosen — so a fast spin travels
// several stops and settles, rather than snapping back to the one it was passing
// through when the finger left.
export type DialTicks = "line" | "dot" | "none";

interface DialProps {
  /** Stops across the sweep. */
  detents?: number;
  /** Angular range, centred on twelve o'clock. */
  sweep?: number;
  /** Settle spring. */
  stiffness?: number;
  /** Settle spring. */
  damping?: number;
  /** How far a flick carries past where the hand let go. */
  inertia?: number;
  /** Magnetism felt during the drag itself, before any release. */
  detentPull?: number;
  /** How the stops are marked. */
  ticks?: DialTicks;
  /** Show the value readout under the knob. */
  readout?: boolean;
  /** Lit tick, pointer line and readout. */
  accent?: string;
  /** Knob diameter. */
  size?: number;
  /** Arrows still step, but nothing springs — every move is instant. */
  reducedMotion?: boolean;
  className?: string;
}

/** Degrees of give past either stop. Enough to feel the wall, not enough to
 *  look like the knob came loose. */
const GIVE = 16;

/** Velocity samples kept for the release projection. Two is noisy on a slow
 *  drag; more than four smooths a flick into a nudge. */
const SAMPLES = 4;

const DEG = 180 / Math.PI;

/** Shortest signed arc from a to b, in degrees. */
const arc = (a: number, b: number) => {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
};

/** Asymptotic give: the further past the stop, the less each degree of hand
 *  movement buys. Never reaches GIVE, so there is no second wall to hit. */
const rubber = (over: number) => GIVE * (1 - Math.exp(-over / GIVE));

const Dial = memo(
  ({
    detents = 12,
    sweep = 270,
    stiffness = 380,
    damping = 26,
    inertia = 0.6,
    detentPull = 0.5,
    ticks = "line",
    readout = true,
    accent = "#a855f7",
    size = 160,
    reducedMotion = false,
    className,
  }: DialProps) => {
    const stops = Math.max(2, Math.round(detents));
    const half = sweep / 2;
    const spacing = sweep / (stops - 1);

    const angle = useMotionValue(-half);
    const [index, setIndex] = useState(0);

    const drag = useRef({
      active: false,
      raw: -half,
      last: 0,
      samples: [] as Array<{ t: number; a: number }>,
    });

    const angleFor = useCallback(
      (i: number) => -half + i * spacing,
      [half, spacing],
    );

    const indexFor = useCallback(
      (a: number) =>
        Math.min(stops - 1, Math.max(0, Math.round((a + half) / spacing))),
      [half, spacing, stops],
    );

    // The only bridge from the motion value into React, and it fires on an
    // integer rather than on every frame the spring produces.
    useMotionValueEvent(angle, "change", (v) => {
      const i = indexFor(v);
      setIndex((prev) => (prev === i ? prev : i));
    });

    const settle = useCallback(
      (target: number, velocity = 0) => {
        const clamped = Math.min(half, Math.max(-half, target));
        if (reducedMotion) {
          angle.set(clamped);
          return;
        }
        animate(angle, clamped, {
          type: "spring",
          stiffness,
          damping,
          velocity,
          restDelta: 0.01,
        });
      },
      [angle, damping, half, reducedMotion, stiffness],
    );

    const pointerAngle = (
      event: React.PointerEvent<SVGSVGElement>,
    ): number => {
      const rect = event.currentTarget.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      // atan2(dx, -dy) rather than atan2(dy, dx): zero points up and positive
      // runs clockwise, which is the frame every other number here is in.
      return Math.atan2(dx, -dy) * DEG;
    };

    const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      const d = drag.current;
      d.active = true;
      d.raw = angle.get();
      d.last = pointerAngle(event);
      d.samples = [{ t: event.timeStamp, a: d.raw }];
    };

    const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
      const d = drag.current;
      if (!d.active) return;

      const now = pointerAngle(event);
      d.raw += arc(d.last, now);
      d.last = now;

      let shown = d.raw;
      if (shown > half) shown = half + rubber(shown - half);
      else if (shown < -half) shown = -half - rubber(-half - shown);

      if (detentPull > 0) {
        const nearest = angleFor(indexFor(shown));
        const gap = nearest - shown;
        // Magnetism falls off toward the midpoint between two stops, so the
        // exact centre is an unstable equilibrium the knob slides off rather
        // than a flat spot it can rest in.
        const strength = detentPull * Math.max(0, 1 - Math.abs(gap) / (spacing * 0.5));
        shown += gap * strength;
      }

      angle.set(shown);

      d.samples.push({ t: event.timeStamp, a: shown });
      if (d.samples.length > SAMPLES) d.samples.shift();
    };

    const onPointerUp = () => {
      const d = drag.current;
      if (!d.active) return;
      d.active = false;

      const first = d.samples[0];
      const last = d.samples[d.samples.length - 1];
      const span = last && first ? last.t - first.t : 0;
      const velocity = span > 8 ? ((last.a - first.a) / span) * 1000 : 0;

      // Project first, choose second. Snapping to the stop the hand happened to
      // be passing through throws away the whole flick.
      const thrown = angle.get() + velocity * inertia * 0.15;
      settle(angleFor(indexFor(thrown)), velocity);
      d.raw = angle.get();
    };

    const step = (delta: number) => {
      const next = Math.min(stops - 1, Math.max(0, index + delta));
      settle(angleFor(next));
      drag.current.raw = angleFor(next);
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      const key = event.key;
      if (key === "ArrowRight" || key === "ArrowUp") step(1);
      else if (key === "ArrowLeft" || key === "ArrowDown") step(-1);
      else if (key === "Home") step(-stops);
      else if (key === "End") step(stops);
      else return;
      event.preventDefault();
    };

    const marks = Array.from({ length: stops }, (_, i) => i);
    const knurl = Array.from({ length: 48 }, (_, i) => i);

    return (
      <div
        // select-none because the readout is text sitting under the drag: a drag
        // that starts on selected text becomes a native drag-and-drop, the
        // browser answers with pointercancel, and the knob stops dead under a
        // still-moving hand.
        className={`flex select-none flex-col items-center gap-4 outline-none ${className ?? ""}`}
        role="slider"
        tabIndex={0}
        aria-label="Dial"
        aria-valuemin={0}
        aria-valuemax={stops - 1}
        aria-valuenow={index}
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
      >
        <svg
          viewBox="0 0 100 100"
          width={size}
          height={size}
          // touch-none because the drag IS the component: without it, turning
          // the knob on a phone scrolls the page instead.
          className="touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <defs>
            <radialGradient id="dial-face" cx="38%" cy="30%" r="78%">
              <stop offset="0%" stopColor="#3a3a46" />
              <stop offset="55%" stopColor="#23232c" />
              <stop offset="100%" stopColor="#141419" />
            </radialGradient>
            <linearGradient id="dial-bevel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5a5a68" />
              <stop offset="100%" stopColor="#1a1a20" />
            </linearGradient>
          </defs>

          {/* Detent marks. Outside the knob and fixed to the panel, because a
              scale that turns with the pointer tells you nothing. */}
          {ticks !== "none" &&
            marks.map((i) => {
              const a = (angleFor(i) - 90) / DEG;
              const lit = i === index;
              const r1 = ticks === "dot" ? 45 : 43;
              const r2 = 47.5;
              const cx = 50 + Math.cos(a) * r1;
              const cy = 50 + Math.sin(a) * r1;
              if (ticks === "dot") {
                return (
                  <circle
                    key={i}
                    cx={cx}
                    cy={cy}
                    r={lit ? 1.9 : 1.1}
                    fill={lit ? accent : "#4a4a58"}
                  />
                );
              }
              return (
                <line
                  key={i}
                  x1={cx}
                  y1={cy}
                  x2={50 + Math.cos(a) * r2}
                  y2={50 + Math.sin(a) * r2}
                  stroke={lit ? accent : "#4a4a58"}
                  strokeWidth={lit ? 2 : 1.1}
                  strokeLinecap="round"
                />
              );
            })}

          <circle cx="50" cy="50" r="38" fill="url(#dial-bevel)" />
          <circle cx="50" cy="50" r="35.5" fill="url(#dial-face)" />

          <motion.g
            // transformBox against the view box, so motion's own 50% origin
            // lands on the centre of the 100-unit grid instead of on the centre
            // of each child's own bounding box.
            style={{ rotate: angle, transformBox: "view-box", transformOrigin: "50% 50%" }}
          >
            {/* Knurling. Without something textured turning, a knob with only a
                pointer line reads as a dial face rather than as a part. */}
            {knurl.map((i) => {
              const a = ((i / knurl.length) * 360 - 90) / DEG;
              return (
                <line
                  key={i}
                  x1={50 + Math.cos(a) * 32.5}
                  y1={50 + Math.sin(a) * 32.5}
                  x2={50 + Math.cos(a) * 35.2}
                  y2={50 + Math.sin(a) * 35.2}
                  stroke="#0d0d12"
                  strokeWidth="0.9"
                  opacity="0.55"
                />
              );
            })}
            <circle cx="50" cy="50" r="22" fill="#1c1c23" />
            <circle cx="50" cy="50" r="22" fill="none" stroke="#3d3d4a" strokeWidth="0.8" />
            <line
              x1="50"
              y1="30"
              x2="50"
              y2="17"
              stroke={accent}
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <circle cx="50" cy="50" r="3.4" fill="#2c2c36" />
          </motion.g>
        </svg>

        {readout && (
          <p className="font-display text-[11px] tracking-[0.28em] text-ink-mute tabular-nums uppercase">
            <span style={{ color: accent }}>
              {String(index + 1).padStart(2, "0")}
            </span>
            {" / "}
            {String(stops).padStart(2, "0")}
          </p>
        )}
      </div>
    );
  },
);

Dial.displayName = "Dial";

export default Dial;
