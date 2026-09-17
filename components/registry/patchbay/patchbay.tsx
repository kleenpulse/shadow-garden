"use client";

import { useEffect, useRef, useState } from "react";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A modular-synth patch bay. The jacks are real DOM buttons — focusable,
// labelled, hit-testable — and only the cables live on a canvas stretched
// underneath the pointer's reach (`pointer-events-none`), because a cable is
// pure paint: a quadratic Bézier whose control point hangs below the midpoint
// by a sprung sag. Seat a cable and the sag overshoots and settles;
// resize the bay and every cable shivers — follow-through, cheaply.
//
// Jack centres are measured from DOM rects inside the loop host's onResize,
// never from a second ResizeObserver, and the live cable's endpoint lives in
// a ref written by pointermove and read by the frame body — routing it
// through React state would re-render the whole bay per pointer sample and
// break the pause stillness the bench promises.

export interface PatchbayProps {
  /** Cable slack at rest — how far the middle hangs. */
  droop?: number;
  /** Spring in the sag when a cable seats or the bay resizes. */
  wobble?: number;
  /** Signal travel rate along a connected cable. */
  pulseSpeed?: number;
  /** Pulses in flight per cable; 0 runs the bay dark. */
  pulseCount?: number;
  /** Cable gauge. */
  cableWidth?: number;
  /** Module names under the jacks. */
  showLabels?: boolean;
  /** The patch cables. */
  cableColor?: string;
  /** The signal riding them. */
  pulseColor?: string;
  paused?: boolean;
  reducedMotion?: boolean;
  className?: string;
}

const OUTS = ["OSC A", "OSC B", "NOISE", "LFO"];
const INS = ["FILTER", "VCA", "DELAY", "OUT"];

/** Snap radius around a jack, CSS px. */
const HIT = 28;

type Conn = {
  from: number; // index into OUTS
  to: number; // index into INS
  sag: { x: number; v: number };
  phase: number;
};

const Patchbay = ({
  droop = 46,
  wobble = 0.6,
  pulseSpeed = 1,
  pulseCount = 3,
  cableWidth = 2.5,
  showLabels = true,
  cableColor = "#a78bfa",
  pulseColor = "#e9e6ff",
  paused = false,
  reducedMotion = false,
  className = "",
}: PatchbayProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const outRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const inRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const live = useRef({
    droop,
    wobble,
    pulseSpeed,
    pulseCount,
    cableWidth,
    cableColor,
    pulseColor,
    paused,
    reducedMotion,
  });
  live.current = {
    droop,
    wobble,
    pulseSpeed,
    pulseCount,
    cableWidth,
    cableColor,
    pulseColor,
    paused,
    reducedMotion,
  };

  const sim = useRef({
    w: 0,
    h: 0,
    outC: [] as Array<{ x: number; y: number }>,
    inC: [] as Array<{ x: number; y: number }>,
    conns: [
      { from: 0, to: 0, sag: { x: 0, v: 0 }, phase: 0 },
      { from: 1, to: 2, sag: { x: 0, v: 0 }, phase: 0.37 },
      { from: 3, to: 1, sag: { x: 0, v: 0 }, phase: 0.71 },
    ] as Conn[],
    pending: null as null | { side: "out" | "in"; index: number; x: number; y: number },
  });

  // Keyboard patching: arm a jack, seat on the opposite bank. React state
  // because it styles the armed ring — it changes at key-press rate, not
  // frame rate.
  const [armed, setArmed] = useState<null | { side: "out" | "in"; index: number }>(null);

  const measureRef = useRef<((m: Metrics) => void) | null>(null);
  const drawRef = useRef<((dt: number) => void | false) | null>(null);

  const loop = useAnimationLoop({
    target: containerRef,
    halted: paused || reducedMotion,
    dpr: "auto",
    onResize: (m) => measureRef.current?.(m),
    onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
  });

  const connect = (from: number, to: number) => {
    const s = sim.current;
    // One cable per jack at each end — seating over an occupied jack repatches.
    s.conns = s.conns.filter((c) => c.from !== from && c.to !== to);
    const l = live.current;
    s.conns.push({
      from,
      to,
      // Seated short and moving: the sag spring overshoots into place.
      sag: { x: l.droop * 0.15, v: -l.droop * 2.2 * (0.3 + l.wobble) },
      phase: 0,
    });
    loop.paint();
  };

  const disconnectAt = (side: "out" | "in", index: number): Conn | null => {
    const s = sim.current;
    const i = s.conns.findIndex((c) => (side === "out" ? c.from === index : c.to === index));
    if (i < 0) return null;
    const [conn] = s.conns.splice(i, 1);
    return conn;
  };

  const centerOf = (side: "out" | "in", index: number) => {
    const s = sim.current;
    return (side === "out" ? s.outC : s.inC)[index] ?? { x: 0, y: 0 };
  };

  const localPoint = (e: { clientX: number; clientY: number }) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onJackPointerDown = (side: "out" | "in", index: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const s = sim.current;
    const p = localPoint(e);
    // Grabbing an occupied IN jack picks its cable up instead of stacking a
    // second one — the gesture every hardware patcher expects.
    if (side === "in") {
      const held = disconnectAt("in", index);
      if (held) {
        s.pending = { side: "out", index: held.from, x: p.x, y: p.y };
        loop.paint();
        return;
      }
    }
    s.pending = { side, index, x: p.x, y: p.y };
    loop.paint();
  };

  const onJackPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const s = sim.current;
    if (!s.pending) return;
    const p = localPoint(e);
    s.pending.x = p.x;
    s.pending.y = p.y;
    // While the bench is paused the loop is halted — one still frame per
    // sample keeps the cable under the finger without un-pausing anything.
    if (!loop.running) loop.paint();
  };

  const onJackPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const s = sim.current;
    if (!s.pending) return;
    const p = localPoint(e);
    const targetSide = s.pending.side === "out" ? "in" : "out";
    const bank = targetSide === "in" ? s.inC : s.outC;
    let best = -1;
    let bestD = HIT * HIT;
    for (let i = 0; i < bank.length; i++) {
      const dx = bank[i].x - p.x;
      const dy = bank[i].y - p.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const pending = s.pending;
    s.pending = null;
    if (best >= 0) {
      if (pending.side === "out") connect(pending.index, best);
      else connect(best, pending.index);
    } else {
      loop.paint();
    }
  };

  const onJackClick = (side: "out" | "in", index: number) => () => {
    if (!armed) {
      setArmed({ side, index });
      return;
    }
    if (armed.side === side) {
      setArmed(armed.index === index ? null : { side, index });
      return;
    }
    if (side === "in") connect(armed.index, index);
    else connect(index, armed.index);
    setArmed(null);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    measureRef.current = ({ width, height, dpr, bufferWidth, bufferHeight }) => {
      if (width <= 0 || height <= 0) return;
      canvas.width = bufferWidth;
      canvas.height = bufferHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      // Draw in CSS px; the transform owns the dpr. Without this every cable
      // lands half a pane off on a retina screen.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const s = sim.current;
      s.w = width;
      s.h = height;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const read = (btn: HTMLButtonElement | null) => {
        if (!btn) return { x: 0, y: 0 };
        const r = btn.getBoundingClientRect();
        return { x: r.left + r.width / 2 - rect.left, y: r.top + r.height / 2 - rect.top };
      };
      s.outC = OUTS.map((_, i) => read(outRefs.current[i]));
      s.inC = INS.map((_, i) => read(inRefs.current[i]));
      // A moved bay shakes its cables.
      const l = live.current;
      for (const c of s.conns) c.sag.v += l.droop * 1.4 * l.wobble;
    };

    const cable = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      sag: number,
      width: number,
      color: string,
    ) => {
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2 + sag;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cx, cy, x1, y1);
      ctx.stroke();
      // Plug sleeves where the cable meets the jacks.
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x0, y0, width * 1.6, 0, Math.PI * 2);
      ctx.arc(x1, y1, width * 1.6, 0, Math.PI * 2);
      ctx.fill();
      return { cx, cy };
    };

    drawRef.current = (dt) => {
      const s = sim.current;
      const l = live.current;
      if (s.w <= 0) return;
      ctx.clearRect(0, 0, s.w, s.h);

      const damp = 26 - l.wobble * 18;
      for (const c of s.conns) {
        const p0 = s.outC[c.from];
        const p1 = s.inC[c.to];
        if (!p0 || !p1) continue;

        if (!l.reducedMotion) {
          c.sag.v += (-90 * (c.sag.x - l.droop) - damp * c.sag.v) * dt;
          c.sag.x += c.sag.v * dt;
          c.phase = (c.phase + dt * l.pulseSpeed * 0.45) % 1;
        } else {
          c.sag.x = l.droop;
        }

        const { cx, cy } = cable(p0.x, p0.y, p1.x, p1.y, c.sag.x, l.cableWidth, l.cableColor);

        if (!l.reducedMotion && l.pulseCount > 0) {
          ctx.fillStyle = l.pulseColor;
          ctx.shadowColor = l.pulseColor;
          ctx.shadowBlur = 8;
          for (let k = 0; k < l.pulseCount; k++) {
            const t = (c.phase + k / l.pulseCount) % 1;
            const mt = 1 - t;
            const x = mt * mt * p0.x + 2 * mt * t * cx + t * t * p1.x;
            const y = mt * mt * p0.y + 2 * mt * t * cy + t * t * p1.y;
            ctx.beginPath();
            ctx.arc(x, y, Math.max(l.cableWidth * 1.05, 2), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.shadowBlur = 0;
        }
      }

      if (s.pending) {
        const p0 = centerOf(s.pending.side, s.pending.index);
        cable(p0.x, p0.y, s.pending.x, s.pending.y, l.droop * 0.45, l.cableWidth, l.cableColor);
      }
    };

    loop.resize();
    loop.start();

    return () => {
      drawRef.current = null;
      measureRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tuning while halted still repaints one still frame.
  useEffect(() => {
    loop.paint();
  }, [droop, wobble, pulseSpeed, pulseCount, cableWidth, cableColor, pulseColor, loop]);

  const jack = (side: "out" | "in", label: string, index: number) => {
    const isArmed = armed && armed.side === side && armed.index === index;
    return (
      <div key={label} className="flex flex-col items-center gap-2">
        <button
          type="button"
          ref={(el) => {
            (side === "out" ? outRefs : inRefs).current[index] = el;
          }}
          aria-label={`${label} ${side === "out" ? "output" : "input"} jack`}
          aria-pressed={!!isArmed}
          className={`relative size-9 rounded-full border-2 bg-[#0c0c11] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-amethyst ${
            isArmed ? "border-amethyst" : "border-[#3a3a46] hover:border-[#55555f]"
          }`}
          onPointerDown={onJackPointerDown(side, index)}
          onPointerMove={onJackPointerMove}
          onPointerUp={onJackPointerUp}
          onPointerCancel={onJackPointerUp}
          onClick={onJackClick(side, index)}
        >
          <span className="absolute top-1/2 left-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black ring-1 ring-[#2c2c36]" />
        </button>
        {showLabels && (
          <span className="font-mono text-[9px] tracking-[0.18em] text-[#8b87a0]">{label}</span>
        )}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      // touch-none because dragging a cable IS the component — without it a
      // finger patch scrolls the page. select-none because the module labels
      // are text under that drag: selected text turns the next press into
      // native drag-and-drop and the browser cancels the gesture mid-cable.
      className={`relative h-full w-full touch-none overflow-hidden select-none ${className}`.trim()}
      onKeyDown={(e) => {
        if (e.key === "Escape" && armed) {
          setArmed(null);
          e.preventDefault();
        }
      }}
    >
      <div className="flex h-full w-full flex-col justify-between px-8 py-7">
        <div>
          <p className="mb-3 font-mono text-[9px] tracking-[0.3em] text-[#6e6a82]">OUTPUTS</p>
          <div className="flex items-start justify-between">
            {OUTS.map((label, i) => jack("out", label, i))}
          </div>
        </div>
        <div>
          <div className="flex items-end justify-between">
            {INS.map((label, i) => jack("in", label, i))}
          </div>
          <p className="mt-3 font-mono text-[9px] tracking-[0.3em] text-[#6e6a82]">INPUTS</p>
        </div>
      </div>
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 block size-full" />
    </div>
  );
};

export default Patchbay;
