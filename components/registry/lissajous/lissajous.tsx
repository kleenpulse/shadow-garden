"use client";

import { useEffect, useRef } from "react";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A phosphor oscilloscope tracing Lissajous figures. The beam dwells on one
// frequency ratio, then retunes to the next by sliding a and b continuously —
// the chirp while the figure comes apart and re-locks is the whole show, the
// same thing you see turning the timebase knob on a real scope.
//
// Persistence is data, not paint. The classic trick — fade the canvas with a
// translucent fillRect each frame — never fully clears (the alpha asymptote
// leaves a permanent grey residue) and it breaks still frames: a paused paint
// would have no history to show. Here the beam keeps a ring buffer of recent
// samples and every frame redraws the whole trail from scratch, so a paint
// while halted reproduces the exact screen, and tuning the persistence knob
// re-grades the existing trail instead of waiting for new photons.

export interface LissajousProps {
  /** Beam speed along the curve. */
  speed?: number;
  /** Phosphor hold — how long the trail stays lit behind the beam. */
  persistence?: number;
  /** Seconds a figure holds before tuning to the next ratio. */
  dwell?: number;
  /** Length of the chirp between one ratio and the next. */
  morphSeconds?: number;
  /** Trace stroke width. */
  beamWidth?: number;
  /** Bloom on the beam head. */
  glow?: number;
  /** Faint scope grid behind the trace. */
  showGraticule?: boolean;
  /** The phosphor — amethyst, not heritage green. */
  phosphorColor?: string;
  /** Dead glass behind the trace. */
  backgroundColor?: string;
  paused?: boolean;
  reducedMotion?: boolean;
  className?: string;
}

// The tuning sequence. First entry is also the reduced-motion still, so it
// leads with the iconic 3:2 figure rather than the 1:1 circle.
const RATIOS: Array<[number, number]> = [
  [3, 2],
  [5, 4],
  [1, 1],
  [3, 4],
  [7, 5],
  [2, 3],
];

const CAPACITY = 2048;
const TAU = Math.PI * 2;

const easeInOut = (t: number) => t * t * (3 - 2 * t);

const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return [255, 255, 255];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
};

const Lissajous = ({
  speed = 1,
  persistence = 0.6,
  dwell = 4,
  morphSeconds = 1.4,
  beamWidth = 1.6,
  glow = 12,
  showGraticule = true,
  phosphorColor = "#c4b5fd",
  backgroundColor = "#0b0812",
  paused = false,
  reducedMotion = false,
  className = "",
}: LissajousProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const live = useRef({
    speed,
    persistence,
    dwell,
    morphSeconds,
    beamWidth,
    glow,
    showGraticule,
    phosphorColor,
    backgroundColor,
    paused,
    reducedMotion,
  });
  live.current = {
    speed,
    persistence,
    dwell,
    morphSeconds,
    beamWidth,
    glow,
    showGraticule,
    phosphorColor,
    backgroundColor,
    paused,
    reducedMotion,
  };

  const drawRef = useRef<((dt: number) => void | false) | null>(null);
  const measureRef = useRef<((m: Metrics) => void) | null>(null);

  const loop = useAnimationLoop({
    target: containerRef,
    halted: paused || reducedMotion,
    dpr: "auto",
    resizeDebounceMs: 100,
    onResize: (m) => measureRef.current?.(m),
    onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;

    // Sample ring buffer — the phosphor's memory. Typed arrays, zero
    // allocation in the frame body.
    const xs = new Float32Array(CAPACITY);
    const ys = new Float32Array(CAPACITY);
    const ts = new Float32Array(CAPACITY);
    let head = 0; // next write slot
    let count = 0;

    // Tuner state. The two beam phases advance as px += a·dφ and wrap mod 2π
    // independently — sin/cos only ever see a bounded argument, and because
    // the increment (not an absolute a·φ product) carries the ratio, sliding
    // a and b mid-flight chirps instead of popping.
    const tuner = {
      index: 0,
      a: RATIOS[0][0],
      b: RATIOS[0][1],
      px: 0,
      py: 0,
      dwellLeft: 4,
      morphT: -1, // <0 = dwelling
      fromA: RATIOS[0][0],
      fromB: RATIOS[0][1],
      time: 0,
    };

    measureRef.current = ({ width: w, height: h, dpr, bufferWidth, bufferHeight }) => {
      if (w <= 0 || h <= 0) return;
      canvas.width = bufferWidth;
      canvas.height = bufferHeight;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      width = w;
      height = h;
    };

    const point = (out: { x: number; y: number }, px: number, py: number) => {
      out.x = width / 2 + Math.cos(px) * width * 0.39;
      out.y = height / 2 + Math.sin(py) * height * 0.36;
    };
    const pt = { x: 0, y: 0 };

    const drawGraticule = (r: number, g: number, b: number) => {
      const cols = 10;
      const rows = 8;
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${r},${g},${b},0.06)`;
      ctx.beginPath();
      for (let i = 1; i < cols; i++) {
        const x = (i / cols) * width;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let j = 1; j < rows; j++) {
        const y = (j / rows) * height;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
      // Centre crosshair, one notch brighter — the beam's home.
      ctx.strokeStyle = `rgba(${r},${g},${b},0.13)`;
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, height);
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
    };

    // Reduced motion: one complete closed figure at the current tuning, full
    // brightness — a scope photograph instead of a running beam.
    const drawStill = () => {
      const cfg = live.current;
      const [r, g, b] = hexToRgb(cfg.phosphorColor);
      ctx.fillStyle = cfg.backgroundColor;
      ctx.fillRect(0, 0, width, height);
      if (cfg.showGraticule) drawGraticule(r, g, b);
      ctx.lineWidth = cfg.beamWidth;
      ctx.strokeStyle = `rgba(${r},${g},${b},0.9)`;
      ctx.shadowColor = `rgba(${r},${g},${b},0.8)`;
      ctx.shadowBlur = cfg.glow * 0.6;
      ctx.beginPath();
      for (let i = 0; i <= 720; i++) {
        const phi = (i / 720) * TAU;
        pt.x = width / 2 + Math.cos(tuner.a * phi) * width * 0.39;
        pt.y = height / 2 + Math.sin(tuner.b * phi) * height * 0.36;
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    const draw = (dt: number): void | false => {
      if (width <= 0 || height <= 0) return;
      const cfg = live.current;

      if (cfg.reducedMotion) {
        drawStill();
        return;
      }

      // ── Tuner: dwell, then slide to the next ratio ─────────────────────────
      if (dt > 0) {
        tuner.time += dt;
        if (tuner.morphT < 0) {
          tuner.dwellLeft -= dt;
          if (tuner.dwellLeft <= 0) {
            tuner.fromA = tuner.a;
            tuner.fromB = tuner.b;
            tuner.index = (tuner.index + 1) % RATIOS.length;
            tuner.morphT = 0;
          }
        } else {
          tuner.morphT += dt / Math.max(cfg.morphSeconds, 0.05);
          const e = easeInOut(Math.min(tuner.morphT, 1));
          tuner.a = tuner.fromA + (RATIOS[tuner.index][0] - tuner.fromA) * e;
          tuner.b = tuner.fromB + (RATIOS[tuner.index][1] - tuner.fromB) * e;
          if (tuner.morphT >= 1) {
            tuner.morphT = -1;
            tuner.dwellLeft = cfg.dwell;
          }
        }

        // ── Beam: substep so a fast beam stays a curve, not a polyline ───────
        const rate = cfg.speed * 2.2;
        const maxAB = Math.max(tuner.a, tuner.b, 1);
        const total = dt * rate;
        const steps = Math.min(360, Math.max(1, Math.ceil((total * maxAB) / 0.045)));
        const dphi = total / steps;
        for (let s = 0; s < steps; s++) {
          tuner.px = (tuner.px + tuner.a * dphi) % TAU;
          tuner.py = (tuner.py + tuner.b * dphi) % TAU;
          point(pt, tuner.px, tuner.py);
          xs[head] = pt.x;
          ys[head] = pt.y;
          ts[head] = tuner.time;
          head = (head + 1) % CAPACITY;
          if (count < CAPACITY) count++;
        }
      }

      // ── Redraw the whole tube from data ────────────────────────────────────
      const [r, g, b] = hexToRgb(cfg.phosphorColor);
      ctx.fillStyle = cfg.backgroundColor;
      ctx.fillRect(0, 0, width, height);
      if (cfg.showGraticule) drawGraticule(r, g, b);

      const life = 0.25 + cfg.persistence * 2.75;
      // Drop what the phosphor has forgotten.
      while (count > 0) {
        const tail = (head - count + CAPACITY) % CAPACITY;
        if (tuner.time - ts[tail] <= life) break;
        count--;
      }

      if (count > 1) {
        ctx.lineWidth = cfg.beamWidth;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        // Contiguous runs of the ring share an age bucket, so the trail is a
        // handful of strokes rather than two thousand.
        const BUCKETS = 14;
        let bucket = -1;
        let started = false;
        for (let i = count - 1; i >= 0; i--) {
          const idx = (head - 1 - i + CAPACITY * 2) % CAPACITY;
          const ageFrac = Math.min((tuner.time - ts[idx]) / life, 1);
          const bk = Math.min(BUCKETS - 1, Math.floor(ageFrac * BUCKETS));
          if (bk !== bucket) {
            if (started) ctx.stroke();
            const fade = 1 - (bk + 0.5) / BUCKETS;
            const alpha = fade * fade * 0.9;
            ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
            // Bloom only on the freshest run — shadowBlur on the full trail
            // is the single most expensive thing a 2D canvas can do.
            if (bk === 0) {
              ctx.shadowColor = `rgba(${r},${g},${b},0.85)`;
              ctx.shadowBlur = cfg.glow;
            } else {
              ctx.shadowBlur = 0;
            }
            ctx.beginPath();
            ctx.moveTo(xs[idx], ys[idx]);
            bucket = bk;
            started = true;
          } else {
            ctx.lineTo(xs[idx], ys[idx]);
          }
        }
        if (started) ctx.stroke();
        ctx.shadowBlur = 0;

        // The beam head — the one spot the tube is actually being hit.
        const headIdx = (head - 1 + CAPACITY) % CAPACITY;
        ctx.fillStyle = `rgba(255,255,255,0.9)`;
        ctx.shadowColor = `rgba(${r},${g},${b},1)`;
        ctx.shadowBlur = cfg.glow * 1.4;
        ctx.beginPath();
        ctx.arc(xs[headIdx], ys[headIdx], Math.max(cfg.beamWidth * 0.9, 1.2), 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    };
    drawRef.current = draw;

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
  }, [
    speed,
    persistence,
    dwell,
    morphSeconds,
    beamWidth,
    glow,
    showGraticule,
    phosphorColor,
    backgroundColor,
    loop,
  ]);

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden ${className}`.trim()}
    >
      <canvas
        ref={canvasRef}
        // Out of flow so the explicit backing-store size never feeds back into
        // the container's layout and deadlocks the ResizeObserver.
        className="absolute inset-0 block size-full"
      />
    </div>
  );
};

export default Lissajous;
