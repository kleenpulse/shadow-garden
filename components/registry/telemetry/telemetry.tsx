"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A metric board where the tiles are one instrument rather than eight.
//
// Any chart library will give you sparklines. What it will not give you is the
// thing an operator actually needs: hover anywhere and *every* trace reports the
// same instant, so you can see that the latency spike and the queue backing up
// are the same event and not two coincidences. That cross-tile cursor is the
// component; the drawing is incidental.
//
// Three decisions carry it.
//
// **Everything is keyed by time, never by index or by pixel.** The obvious
// implementation maps the cursor's x to a slot in the ring buffer. It looks
// right for about two seconds — then the ring wraps, the head advances, and the
// sample under a *stationary* pointer changes on every tick, so the readout
// crawls while the hand is still. Worse, two tiles whose heads advanced on
// different frames disagree about "now". The cursor broadcasts a timestamp, each
// tile resolves that timestamp against its own head, and both problems are gone.
//
// **A breach is a property of the sample, not of a pixel.** Storing the scar as
// an x coordinate leaves it behind while the trace scrolls out from under it,
// and within a few seconds the mark is sitting next to the spike it belongs to.
// The flag rides the sample, so the scar travels with its own data and leaves
// the window when that data does.
//
// **The cursor never enters React state.** A pointer moving at 60Hz over a
// twelve-tile tree would re-render the whole board on every mouse event to move
// one hairline. It lives in a ref, the frame body reads it, and the numeric
// readouts are written straight to their nodes.
export type TelemetryColumns = "2" | "3" | "4";
export type TelemetryFill = "none" | "gradient" | "solid";

interface TelemetryProps {
  /** Metrics on the board. */
  tiles?: number;
  /** Grid width. */
  columns?: TelemetryColumns;
  /** How often each ring buffer takes a sample. */
  sampleRate?: number;
  /** How much past each trace shows. */
  history?: number;
  /** Exponential smoothing applied on the way into the buffer. */
  smoothing?: number;
  /** Normalised level a metric must cross to count as a breach. */
  threshold?: number;
  /** Keep a permanent mark where a breach happened. */
  scars?: boolean;
  /** The shared time cursor. */
  cursor?: boolean;
  /** Area under the trace. */
  fill?: TelemetryFill;
  /** The line, the fill ramp, and the cursor rule. */
  traceColor?: string;
  /** The flash, the scar, and the trace above the threshold. */
  breachColor?: string;
  /** Halt the stream. The board holds what it has. */
  paused?: boolean;
  /** The stream stops, and the board is delivered already full — the data is
   *  content, so it is shown rather than withheld. */
  reducedMotion?: boolean;
  className?: string;
}

interface Metric {
  name: string;
  unit: string;
  /** Value at a normalised zero — the floor of the plausible range, not its
   *  centre. Centring is the version that ships a negative error rate the first
   *  time a series dips, and a readout that reports impossible numbers discredits
   *  every other number on the board. */
  base: number;
  /** Value added at a normalised one. */
  span: number;
  drift: number;
  noise: number;
  spike: number;
  digits: number;
}

/** The board is a demonstration, so the series are synthesised — but each has a
 *  different temperament, because a board where every tile wobbles the same way
 *  teaches nothing about reading one. */
const METRICS: Metric[] = [
  { name: "p99 latency", unit: "ms", base: 60, span: 180, drift: 0.09, noise: 0.1, spike: 0.02, digits: 0 },
  { name: "throughput", unit: "rps", base: 1900, span: 1100, drift: 0.05, noise: 0.05, spike: 0, digits: 0 },
  { name: "error rate", unit: "%", base: 0.02, span: 2.4, drift: 0.04, noise: 0.06, spike: 0.035, digits: 2 },
  { name: "cpu", unit: "%", base: 22, span: 62, drift: 0.07, noise: 0.07, spike: 0.008, digits: 0 },
  { name: "heap", unit: "MB", base: 480, span: 380, drift: 0.03, noise: 0.03, spike: 0, digits: 0 },
  { name: "queue depth", unit: "", base: 2, span: 180, drift: 0.06, noise: 0.09, spike: 0.03, digits: 0 },
  { name: "cache hit", unit: "%", base: 90, span: 9, drift: 0.05, noise: 0.04, spike: 0, digits: 1 },
  { name: "connections", unit: "", base: 620, span: 520, drift: 0.04, noise: 0.05, spike: 0.006, digits: 0 },
  { name: "gc pause", unit: "ms", base: 2, span: 38, drift: 0.11, noise: 0.12, spike: 0.03, digits: 1 },
  { name: "disk io", unit: "MB/s", base: 40, span: 220, drift: 0.08, noise: 0.09, spike: 0.012, digits: 0 },
  { name: "retries", unit: "", base: 0, span: 42, drift: 0.1, noise: 0.14, spike: 0.028, digits: 0 },
  { name: "saturation", unit: "%", base: 30, span: 60, drift: 0.06, noise: 0.06, spike: 0.01, digits: 0 },
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

interface Series {
  values: Float32Array;
  breached: Uint8Array;
  head: number;
  filled: number;
  phase: number;
  /** Three frequencies per series. Offsetting only the phase is not enough:
   *  every tile then carries the same hump at a different moment, the board
   *  reads as one signal drawn eight times, and the shared cursor looks like a
   *  trick rather than a correlation worth having. */
  freq: [number, number, number];
  level: number;
  smoothed: number;
  rng: () => number;
}

const Telemetry = memo(
  ({
    tiles = 8,
    columns = "4",
    sampleRate = 8,
    history = 45,
    smoothing = 0.25,
    threshold = 0.82,
    scars = true,
    cursor = true,
    fill = "gradient",
    traceColor = "#a855f7",
    breachColor = "#f87171",
    paused = false,
    reducedMotion = false,
    className,
  }: TelemetryProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
    const plotRefs = useRef<(HTMLDivElement | null)[]>([]);
    const readoutRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const drawRef = useRef<((dt: number) => void | false) | null>(null);
    const measureRef = useRef<((m: Metrics) => void) | null>(null);

    // Fraction across the window, and whether the hand is on the board. A ref,
    // because a pointer at 60Hz must not re-render twelve tiles to move a line.
    const cursorRef = useRef({ at: 0, active: false });

    const count = Math.max(1, Math.min(METRICS.length, Math.round(tiles)));
    const shown = useMemo(() => METRICS.slice(0, count), [count]);

    const live = useRef({
      sampleRate, history, smoothing, threshold, scars, cursor, fill,
      traceColor, breachColor, reducedMotion,
    });
    live.current = {
      sampleRate, history, smoothing, threshold, scars, cursor, fill,
      traceColor, breachColor, reducedMotion,
    };

    const loop = useAnimationLoop({
      target: containerRef,
      halted: paused || reducedMotion,
      dpr: "auto",
      onResize: (metrics) => measureRef.current?.(metrics),
      onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
    });

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const rate = Math.max(1, Math.round(live.current.sampleRate));
      const windowSeconds = Math.max(5, Math.round(live.current.history));
      const capacity = Math.max(8, rate * windowSeconds);

      const series: Series[] = shown.map((m, i) => ({
        values: new Float32Array(capacity),
        breached: new Uint8Array(capacity),
        head: 0,
        filled: 0,
        phase: i * 1.37,
        // Irrational-ish spacing so no two series share a period and the board
        // never falls into lockstep, however long it runs.
        freq: [
          0.42 + ((i * 0.618) % 1) * 0.62,
          0.15 + ((i * 0.379) % 1) * 0.3,
          1.2 + ((i * 0.827) % 1) * 1.4,
        ],
        level: 0.5,
        smoothed: 0.5,
        rng: mulberry32(0x9e37 + i * 7919),
      }));

      // Normalised, because the threshold and the shading are shared across
      // tiles whose units are not — a percentage and a megabyte have to be
      // comparable for one cursor to mean anything.
      const advance = (s: Series, m: Metric, step: number) => {
        s.phase += step * (0.35 + m.drift * 4);
        const wave =
          Math.sin(s.phase * s.freq[0]) * 0.28 +
          Math.sin(s.phase * s.freq[1] + 1.1) * 0.17 +
          Math.sin(s.phase * s.freq[2] + 2.3) * 0.06;
        const jitter = (s.rng() - 0.5) * 2 * m.noise;
        let next = 0.5 + wave + jitter;
        if (m.spike > 0 && s.rng() < m.spike * step * 8) {
          next += 0.35 + s.rng() * 0.45;
        }
        s.level = Math.max(0, Math.min(1, next));
      };

      const push = (s: Series, value: number, breach: boolean) => {
        s.values[s.head] = value;
        s.breached[s.head] = breach ? 1 : 0;
        s.head = (s.head + 1) % capacity;
        if (s.filled < capacity) s.filled++;
      };

      const sampleOnce = (s: Series, m: Metric, step: number) => {
        const l = live.current;
        advance(s, m, step);
        const k = Math.max(0, Math.min(0.95, l.smoothing));
        s.smoothed = s.smoothed * k + s.level * (1 - k);
        push(s, s.smoothed, s.smoothed >= l.threshold);
      };

      // The board arrives full. An empty chart that fills in over forty-five
      // seconds is not a demonstration of anything, and under reduced motion it
      // would never fill at all — the data here is content, so it is delivered.
      for (let i = 0; i < series.length; i++) {
        for (let k = 0; k < capacity; k++) {
          sampleOnce(series[i], shown[i], 1 / rate);
        }
      }

      let accumulator = 0;

      const sizeCanvases = (dpr: number) => {
        for (let i = 0; i < canvasRefs.current.length; i++) {
          const canvas = canvasRefs.current[i];
          const plot = plotRefs.current[i];
          if (!canvas || !plot) continue;
          const box = plot.getBoundingClientRect();
          const w = Math.max(1, Math.floor(box.width));
          const h = Math.max(1, Math.floor(box.height));
          canvas.width = Math.max(1, Math.round(w * dpr));
          canvas.height = Math.max(1, Math.round(h * dpr));
          canvas.style.width = `${w}px`;
          canvas.style.height = `${h}px`;
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
      };

      /** Value at a fraction across the window, resolved against this series'
       *  own head. `frac` is time, not a slot: 0 is the oldest edge and 1 is now. */
      const at = (s: Series, frac: number): { value: number; breach: boolean } => {
        const back = Math.round((1 - frac) * (capacity - 1));
        const idx = (s.head - 1 - back + capacity * 2) % capacity;
        return { value: s.values[idx], breach: s.breached[idx] === 1 };
      };

      const drawTile = (i: number) => {
        const l = live.current;
        const canvas = canvasRefs.current[i];
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const s = series[i];
        const m = shown[i];

        // CSS pixels, read back from the style the sizing pass wrote. The
        // backing store is in device pixels and the context already carries the
        // dpr transform, so drawing against canvas.width would double every
        // coordinate on a retina display.
        const width = parseFloat(canvas.style.width) || 1;
        const height = parseFloat(canvas.style.height) || 1;

        ctx.clearRect(0, 0, width, height);
        if (s.filled < 2) return;

        const [tr, tg, tb] = hexToRgb(l.traceColor);
        const [br, bg, bb] = hexToRgb(l.breachColor);

        const pad = 3;
        const plotH = Math.max(1, height - pad * 2);
        const xAt = (k: number) => (k / (capacity - 1)) * width;
        const yAt = (v: number) => pad + (1 - v) * plotH;

        // Oldest first, so the trace reads left to right in time order.
        const valueAt = (k: number) => {
          const idx = (s.head - capacity + k + capacity * 2) % capacity;
          return { v: s.values[idx], b: s.breached[idx] === 1 };
        };

        if (l.fill !== "none") {
          ctx.beginPath();
          ctx.moveTo(0, height);
          for (let k = 0; k < capacity; k++) ctx.lineTo(xAt(k), yAt(valueAt(k).v));
          ctx.lineTo(width, height);
          ctx.closePath();
          if (l.fill === "gradient") {
            const grad = ctx.createLinearGradient(0, 0, 0, height);
            grad.addColorStop(0, `rgba(${tr}, ${tg}, ${tb}, 0.34)`);
            grad.addColorStop(1, `rgba(${tr}, ${tg}, ${tb}, 0.02)`);
            ctx.fillStyle = grad;
          } else {
            ctx.fillStyle = `rgba(${tr}, ${tg}, ${tb}, 0.16)`;
          }
          ctx.fill();
        }

        // Threshold rule, so a breach is legible as crossing something.
        ctx.strokeStyle = `rgba(${br}, ${bg}, ${bb}, 0.28)`;
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, yAt(l.threshold));
        ctx.lineTo(width, yAt(l.threshold));
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.lineWidth = 1.4;
        ctx.lineJoin = "round";
        ctx.strokeStyle = `rgba(${tr}, ${tg}, ${tb}, 0.95)`;
        ctx.beginPath();
        for (let k = 0; k < capacity; k++) {
          const x = xAt(k);
          const y = yAt(valueAt(k).v);
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        if (l.scars) {
          ctx.strokeStyle = `rgba(${br}, ${bg}, ${bb}, 0.9)`;
          ctx.lineWidth = 1;
          for (let k = 0; k < capacity; k++) {
            const point = valueAt(k);
            if (!point.b) continue;
            const x = xAt(k);
            ctx.beginPath();
            ctx.moveTo(x, yAt(point.v) - 3);
            ctx.lineTo(x, yAt(point.v) + 3);
            ctx.stroke();
          }
        }

        const c = cursorRef.current;
        if (l.cursor && c.active) {
          const x = c.at * width;
          const point = at(s, c.at);
          ctx.strokeStyle = `rgba(${tr}, ${tg}, ${tb}, 0.55)`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();

          ctx.fillStyle = point.breach
            ? `rgba(${br}, ${bg}, ${bb}, 1)`
            : `rgba(${tr}, ${tg}, ${tb}, 1)`;
          ctx.beginPath();
          ctx.arc(x, yAt(point.value), 2.6, 0, Math.PI * 2);
          ctx.fill();
        }

        // The readout follows the cursor when there is one and the live edge
        // otherwise — written to the node rather than through state.
        const node = readoutRefs.current[i];
        if (node) {
          const point = l.cursor && c.active ? at(s, c.at) : at(s, 1);
          const real = m.base + point.value * m.span;
          node.textContent = `${real.toFixed(m.digits)}${m.unit ? ` ${m.unit}` : ""}`;
          node.style.color = point.breach ? l.breachColor : "";
        }
      };

      drawRef.current = (dt) => {
        const l = live.current;
        const step = 1 / Math.max(1, Math.round(l.sampleRate));

        // The buffer advances on its own accumulator, so a machine dropping to
        // 30fps shows the same history as one at 120. A chart whose past depends
        // on the viewer's GPU is lying about the data.
        accumulator += Math.min(dt, 0.5);
        let guard = 0;
        while (accumulator >= step && guard < 30) {
          for (let i = 0; i < series.length; i++) sampleOnce(series[i], shown[i], step);
          accumulator -= step;
          guard++;
        }

        for (let i = 0; i < series.length; i++) drawTile(i);
      };

      measureRef.current = ({ dpr }) => {
        sizeCanvases(dpr);
        for (let i = 0; i < series.length; i++) drawTile(i);
      };

      loop.resize();
      loop.start();

      return () => {
        drawRef.current = null;
        measureRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shown, sampleRate, history]);

    const track = (event: React.PointerEvent<HTMLDivElement>) => {
      const box = event.currentTarget.getBoundingClientRect();
      if (box.width === 0) return;
      cursorRef.current.at = Math.max(
        0,
        Math.min(1, (event.clientX - box.left) / box.width),
      );
      cursorRef.current.active = true;
      loop.paint();
    };
    const release = () => {
      cursorRef.current.active = false;
      loop.paint();
    };

    return (
      <div
        ref={containerRef}
        className={className ?? "grid h-full w-full gap-2 p-3"}
        style={{
          // minmax(0, 1fr) rather than 1fr: a grid track defaults to a
          // min-content floor, and a canvas carrying an explicit pixel width
          // would hold the board open at whatever size it first measured.
          gridTemplateColumns: `repeat(${Math.max(1, Number(columns) || 4)}, minmax(0, 1fr))`,
        }}
        onPointerLeave={release}
      >
        {shown.map((metric, i) => (
          <div
            key={metric.name}
            className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-hairline bg-panel/50 p-2"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-display text-[9px] tracking-[0.18em] text-ink-mute uppercase">
                {metric.name}
              </span>
              <span
                ref={(node) => {
                  readoutRefs.current[i] = node;
                }}
                className="font-mono text-[11px] text-ink tabular-nums"
              >
                —
              </span>
            </div>
            <div
              ref={(node) => {
                plotRefs.current[i] = node;
              }}
              className="relative mt-1.5 min-h-0 flex-1 select-none"
              onPointerMove={track}
            >
              <canvas
                ref={(node) => {
                  canvasRefs.current[i] = node;
                }}
                className="absolute top-0 left-0 block touch-none"
              />
            </div>
          </div>
        ))}
      </div>
    );
  },
);

Telemetry.displayName = "Telemetry";

export default Telemetry;
