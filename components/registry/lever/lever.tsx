"use client";

import { memo, useCallback, useRef, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";

// An industrial breaker lever. Three things make it feel like a mechanism
// rather than a checkbox with a costume:
//
// **The throw is a motion value, never React state.** A drag writes it sixty
// times a second and the release spring writes it more often; React holds one
// boolean — the committed side — set only at the moments it actually flips.
//
// **The hand fights a breakover hump.** Displayed travel lags the raw pointer
// travel by a bump curve peaked at the threshold: approaching it the handle
// drags heavier and heavier, crossing it the lag collapses and the handle
// races ahead of the finger. That collapse is the over-centre spring every
// real breaker has, and it is why a half-hearted push falls back.
//
// **Release projects, then commits.** The release velocity is allowed to carry
// the throw past the threshold before the side is chosen, so a flick from the
// bottom of the slot slams the lever home without the finger ever crossing
// the line — and the same spring the flick uses is the one the keyboard uses.
export type LeverOrientation = "vertical" | "horizontal";

export interface LeverProps {
  /** Throw axis. Vertical reads as a breaker; horizontal as a transfer switch. */
  orientation?: LeverOrientation;
  /** Spring tension on the snap. */
  stiffness?: number;
  /** Spring friction — low enough by default to overshoot and settle. */
  damping?: number;
  /** Breakover point of the throw. */
  threshold?: number;
  /** The hump — how hard the mechanism fights before it commits. */
  resistance?: number;
  /** State lamp above the track. */
  led?: boolean;
  /** ON / OFF stencils on the housing. */
  labels?: boolean;
  /** The lamp, the lit end of the track, and the handle stripe. */
  accent?: string;
  /** Housing height (width when horizontal); internals scale on a fixed grid. */
  size?: number;
  /** Fires with the committed side whenever the lever settles a throw. */
  onChange?: (on: boolean) => void;
  reducedMotion?: boolean;
  className?: string;
}

/** Travel allowed past either end of the slot, in throw units. */
const GIVE = 0.06;

/** Velocity samples kept for the release projection. */
const SAMPLES = 4;

/** Breakover lag: a quartic bump over the threshold neighbourhood. */
const bump = (u: number) => {
  const v = 1 - u * u;
  return v > 0 ? v * v : 0;
};

const Lever = memo(
  ({
    orientation = "vertical",
    stiffness = 520,
    damping = 18,
    threshold = 0.5,
    resistance = 0.6,
    led = true,
    labels = true,
    accent = "#a855f7",
    size = 140,
    onChange,
    reducedMotion = false,
    className,
  }: LeverProps) => {
    const vertical = orientation === "vertical";

    // Fixed drawing grid; `size` only scales the rendered box.
    const G = vertical
      ? {
          vb: "0 0 100 160",
          w: (size * 100) / 160,
          h: size,
          led: [50, 21] as const,
          onLabel: [50, 45] as const,
          offLabel: [50, 147] as const,
          slot: { x: 38, y: 56, w: 24, len: 76 },
          handle: { w: 36, h: 22 },
          from: 121, // handle centre at OFF
          to: 67, // handle centre at ON
        }
      : {
          vb: "0 0 160 100",
          w: size,
          h: (size * 100) / 160,
          led: [80, 17] as const,
          onLabel: [141, 56] as const,
          offLabel: [19, 56] as const,
          slot: { x: 36, y: 40, w: 88, len: 24 },
          handle: { w: 22, h: 36 },
          from: 45,
          to: 115,
        };
    const travel = G.to - G.from;

    const pos = useMotionValue(0);
    const [on, setOn] = useState(false);

    const drag = useRef({
      active: false,
      moved: 0,
      raw: 0,
      start: 0,
      last: 0,
      samples: [] as Array<{ t: number; p: number }>,
    });

    const commit = useCallback(
      (side: 0 | 1, velocity = 0) => {
        if (reducedMotion) pos.set(side);
        else
          animate(pos, side, {
            type: "spring",
            stiffness,
            damping,
            velocity,
            restDelta: 0.001,
          });
        setOn((prev) => {
          const next = side === 1;
          if (prev !== next) onChange?.(next);
          return next;
        });
      },
      [damping, onChange, pos, reducedMotion, stiffness],
    );

    /** Raw → displayed throw: rubber past the ends, breakover lag inside. */
    const shownFor = (raw: number, dir: number) => {
      let shown = raw;
      if (shown > 1) shown = 1 + GIVE * (1 - Math.exp((1 - shown) / GIVE));
      else if (shown < 0) shown = -GIVE * (1 - Math.exp(shown / GIVE));
      const lag = resistance * 0.32 * bump((shown - threshold) / 0.38);
      return shown - dir * lag;
    };

    /** Pointer coordinate along the throw axis, in throw units. */
    const throwCoord = (event: React.PointerEvent<SVGSVGElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return 0;
      return vertical
        ? (event.clientY - rect.top) / ((Math.abs(travel) / 160) * rect.height)
        : (event.clientX - rect.left) / ((Math.abs(travel) / 160) * rect.width);
    };

    const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      const d = drag.current;
      d.active = true;
      d.moved = 0;
      d.raw = pos.get();
      d.start = d.raw;
      d.last = throwCoord(event);
      d.samples = [{ t: event.timeStamp, p: d.raw }];
    };

    const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
      const d = drag.current;
      if (!d.active) return;
      const now = throwCoord(event);
      // Screen-down is throw-down on a vertical lever, so the vertical delta
      // flips: dragging the handle up must raise the throw.
      const delta = vertical ? -(now - d.last) : now - d.last;
      d.last = now;
      d.raw = Math.min(1 + GIVE * 4, Math.max(-GIVE * 4, d.raw + delta));
      d.moved += Math.abs(delta);
      const dir = d.raw >= d.start ? 1 : -1;
      const shown = shownFor(d.raw, dir);
      pos.set(shown);
      d.samples.push({ t: event.timeStamp, p: shown });
      if (d.samples.length > SAMPLES) d.samples.shift();
    };

    const onPointerUp = () => {
      const d = drag.current;
      if (!d.active) return;
      d.active = false;

      // A press that never travelled is a click: toggle through the spring.
      if (d.moved < 0.02) {
        commit(on ? 0 : 1);
        return;
      }

      const first = d.samples[0];
      const last = d.samples[d.samples.length - 1];
      const span = last && first ? last.t - first.t : 0;
      const velocity = span > 8 ? ((last.p - first.p) / span) * 1000 : 0;

      // Project the flick before choosing a side, so momentum can finish a
      // throw the finger only started.
      const thrown = d.raw + velocity * 0.08;
      commit(thrown >= threshold ? 1 : 0, velocity);
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      const key = event.key;
      if (key === " " || key === "Enter") commit(on ? 0 : 1);
      else if (key === "ArrowUp" || key === "ArrowRight") commit(1);
      else if (key === "ArrowDown" || key === "ArrowLeft") commit(0);
      else return;
      event.preventDefault();
    };

    // Handle translation, driven by the throw. CSS translate on an SVG group
    // moves in user units, so the mapping is the raw slot geometry.
    const handleShift = useTransform(pos, (v) => v * travel);
    const handleX = vertical ? 0 : handleShift;
    const handleY = vertical ? handleShift : 0;

    const s = G.slot;
    const slotRect = { x: s.x, y: s.y, width: s.w, height: s.len };
    // Threshold notch, marked on the slot so the breakover point is visible.
    const notch = vertical
      ? { x1: s.x - 3, y1: G.from + travel * threshold, x2: s.x, y2: G.from + travel * threshold }
      : { x1: G.from + travel * threshold, y1: s.y - 3, x2: G.from + travel * threshold, y2: s.y };

    const stencil = (
      pt: readonly [number, number],
      label: string,
      lit: boolean,
    ) => (
      <text
        x={pt[0]}
        y={pt[1]}
        textAnchor="middle"
        className="font-display"
        fontSize={9}
        letterSpacing="0.18em"
        fill={lit ? accent : "#4a4a58"}
      >
        {label}
      </text>
    );

    return (
      <div
        // select-none because the ON/OFF stencils are text sitting under the
        // drag: a drag that starts on selected text becomes a native
        // drag-and-drop, the browser answers with pointercancel, and the
        // handle stops dead under a still-moving hand.
        className={`inline-flex select-none outline-none ${className ?? ""}`.trim()}
        role="switch"
        tabIndex={0}
        aria-label="Lever"
        aria-checked={on}
        onKeyDown={onKeyDown}
      >
        <svg
          viewBox={G.vb}
          width={G.w}
          height={G.h}
          // touch-none because the drag IS the component: without it, throwing
          // the lever on a phone scrolls the page instead.
          className="touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <defs>
            <linearGradient id="lever-plate" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#26262f" />
              <stop offset="100%" stopColor="#16161c" />
            </linearGradient>
            <linearGradient id="lever-handle" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3d3d4a" />
              <stop offset="55%" stopColor="#26262f" />
              <stop offset="100%" stopColor="#181820" />
            </linearGradient>
          </defs>

          {/* Housing plate with corner screws. */}
          <rect
            x={vertical ? 8 : 6}
            y={vertical ? 6 : 8}
            width={vertical ? 84 : 148}
            height={vertical ? 148 : 84}
            rx={10}
            fill="url(#lever-plate)"
            stroke="#3a3a46"
            strokeWidth={1}
          />
          {(vertical
            ? [
                [16, 14],
                [84, 14],
                [16, 146],
                [84, 146],
              ]
            : [
                [14, 16],
                [146, 16],
                [14, 84],
                [146, 84],
              ]
          ).map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r={2.2} fill="#0e0e13" stroke="#3a3a46" strokeWidth={0.6} />
          ))}

          {/* State lamp. The strike flicker on arrival is what sells the
              contact actually closing. */}
          {led && (
            <g>
              <circle cx={G.led[0]} cy={G.led[1]} r={5.4} fill="#0c0c11" stroke="#3a3a46" strokeWidth={0.8} />
              <motion.circle
                cx={G.led[0]}
                cy={G.led[1]}
                r={3.2}
                fill={accent}
                initial={false}
                animate={{
                  opacity: on ? (reducedMotion ? 1 : [0.12, 1, 0.45, 1]) : 0.12,
                }}
                transition={
                  reducedMotion ? { duration: 0 } : { duration: 0.34, times: [0, 0.4, 0.62, 1] }
                }
              />
            </g>
          )}

          {labels && stencil(G.onLabel, "ON", on)}
          {labels && stencil(G.offLabel, "OFF", !on)}

          {/* The slot, its lit end, and the breakover notch. */}
          <rect
            {...slotRect}
            rx={vertical ? s.w / 2 : s.len / 2}
            fill="#0b0b10"
            stroke="#33333e"
            strokeWidth={1}
          />
          <motion.rect
            {...slotRect}
            rx={vertical ? s.w / 2 : s.len / 2}
            fill="none"
            stroke={accent}
            strokeWidth={1}
            initial={false}
            animate={{ opacity: on ? 0.55 : 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.25 }}
          />
          <line {...notch} stroke="#4a4a58" strokeWidth={1.2} />

          {/* The handle. Underdamped by default, so a committed throw lands
              with a visible mechanical bounce. */}
          <motion.g style={{ x: handleX, y: handleY }}>
            <rect
              x={(vertical ? 50 : G.from) - G.handle.w / 2}
              y={(vertical ? G.from : 50) - G.handle.h / 2}
              width={G.handle.w}
              height={G.handle.h}
              rx={5}
              fill="url(#lever-handle)"
              stroke="#454553"
              strokeWidth={1}
            />
            {/* Grip ridges + accent stripe. */}
            {[-1, 0, 1].map((k) => (
              <line
                key={k}
                x1={vertical ? 50 - 10 : G.from + k * 5}
                y1={vertical ? G.from + k * 5 : 50 - 10}
                x2={vertical ? 50 + 10 : G.from + k * 5}
                y2={vertical ? G.from + k * 5 : 50 + 10}
                stroke="#0e0e13"
                strokeWidth={1.4}
                strokeLinecap="round"
                opacity={0.7}
              />
            ))}
            <rect
              x={(vertical ? 50 : G.from) - (vertical ? G.handle.w / 2 : 1.4)}
              y={(vertical ? G.from : 50) - (vertical ? 1.4 : G.handle.h / 2)}
              width={vertical ? G.handle.w : 2.8}
              height={vertical ? 2.8 : G.handle.h}
              fill={accent}
              opacity={0.9}
            />
          </motion.g>
        </svg>
      </div>
    );
  },
);

Lever.displayName = "Lever";

export default Lever;
