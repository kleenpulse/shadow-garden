"use client";

import { useEffect, useRef } from "react";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

export type StippleAlgorithm = "atkinson" | "floyd-steinberg" | "sierra";

export interface StippleProps {
  /** Error-diffusion kernel. Atkinson drops a quarter of the error, which is
   *  what keeps the classic-Mac look's blown highlights. */
  algorithm?: StippleAlgorithm;
  /** CSS pixels per dither cell. The grid lives in CSS pixels so a retina
   *  screen doesn't silently halve the cell size. */
  pixelSize?: number;
  /** Spatial scale of the underlying luminance field. */
  fieldScale?: number;
  /** Flow speed multiplier; 0 freezes the field but keeps drawing. */
  speed?: number;
  /** Contrast curve around mid-grey before quantization. */
  contrast?: number;
  /** Alternate scan direction per row — hides the directional worm artifacts
   *  a one-way scan drags across flat regions. */
  serpentine?: boolean;
  /** Quantized "on" tone. */
  ink?: string;
  /** Quantized "off" tone. */
  paper?: string;
  paused?: boolean;
  reducedMotion?: boolean;
  className?: string;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return [255, 255, 255];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
};

// Integer hash → [0,1). Math.imul keeps every multiply in int32 — a plain `*`
// overflows the float53 mantissa and the truncated bits bias the hash hard
// toward zero, which reads as a nearly black field.
const hash2 = (x: number, y: number): number => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

const smooth = (t: number) => t * t * (3 - 2 * t);

// 2D value noise on the integer lattice, bilinear with smoothstep fade.
const vnoise = (x: number, y: number): number => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = smooth(xf);
  const v = smooth(yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

// Hard cap on cell count — past this the effective cell size grows instead,
// so a fullscreen container never buys a 60ms CPU scan.
const MAX_CELLS = 180_000;

const Stipple = ({
  algorithm = "atkinson",
  pixelSize = 4,
  fieldScale = 2,
  speed = 0.25,
  contrast = 1.1,
  serpentine = true,
  ink = "#c4b5fd",
  paper = "#0b0812",
  paused = false,
  reducedMotion = false,
  className = "",
}: StippleProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Live props in a ref so the frame body reads current values without
  // rebuilding anything mid-drag.
  const live = useRef({
    algorithm,
    pixelSize,
    fieldScale,
    speed,
    contrast,
    serpentine,
    ink,
    paper,
    paused,
    reducedMotion,
  });
  live.current = {
    algorithm,
    pixelSize,
    fieldScale,
    speed,
    contrast,
    serpentine,
    ink,
    paper,
    paused,
    reducedMotion,
  };

  const drawRef = useRef<((dt: number) => void | false) | null>(null);
  const measureRef = useRef<((m: Metrics) => void) | null>(null);

  const loop = useAnimationLoop({
    target: containerRef,
    halted: paused || reducedMotion,
    dpr: "auto",
    onResize: (m) => measureRef.current?.(m),
    onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Offscreen buffer at cell resolution; the display canvas scales it up
    // with smoothing off so each cell lands as a crisp square.
    const cellCanvas = document.createElement("canvas");
    const cellCtx = cellCanvas.getContext("2d");
    if (!cellCtx) return;

    let cols = 0;
    let rows = 0;
    // Reused buffers — zero allocation inside the frame body.
    let field = new Float32Array(0);
    let image: ImageData | null = null;
    let simTime = 0;

    const rebuild = (width: number, height: number) => {
      const cfg = live.current;
      let cell = Math.max(2, cfg.pixelSize);
      const rawCells = Math.ceil(width / cell) * Math.ceil(height / cell);
      if (rawCells > MAX_CELLS) {
        cell = Math.ceil(Math.sqrt((width * height) / MAX_CELLS));
      }
      cols = Math.max(1, Math.ceil(width / cell));
      rows = Math.max(1, Math.ceil(height / cell));
      if (field.length < cols * rows) field = new Float32Array(cols * rows);
      cellCanvas.width = cols;
      cellCanvas.height = rows;
      image = cellCtx.createImageData(cols, rows);
    };

    measureRef.current = ({ width, height, bufferWidth, bufferHeight }) => {
      // Zero-size container (hidden tab, collapsed panel): bail, don't build
      // a zero-dimension ImageData.
      if (width <= 0 || height <= 0) return;
      canvas.width = bufferWidth;
      canvas.height = bufferHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      rebuild(width, height);
      draw(0);
    };

    const draw = (dt: number): void | false => {
      if (!image || cols === 0) return;
      const cfg = live.current;
      simTime += dt * cfg.speed;

      // ── Field pass: 2-octave flowing value noise + contrast ────────────────
      const s = cfg.fieldScale * 0.05;
      const t1 = simTime * 0.6;
      const t2 = simTime * 0.37;
      let i = 0;
      for (let r = 0; r < rows; r++) {
        const ry1 = r * s + t2;
        const ry2 = r * s * 2.3 - t1 * 0.5;
        for (let c = 0; c < cols; c++) {
          const n =
            vnoise(c * s + t1, ry1) * 0.68 +
            vnoise(c * s * 2.3 + 7.31 - t2, ry2) * 0.32;
          field[i++] = (n - 0.5) * cfg.contrast + 0.5;
        }
      }

      // ── Diffusion pass: serpentine scan, error pushed onto unvisited cells ─
      const algo = cfg.algorithm;
      const serp = cfg.serpentine;
      for (let r = 0; r < rows; r++) {
        const reverse = serp && (r & 1) === 1;
        const step = reverse ? -1 : 1;
        const start = reverse ? cols - 1 : 0;
        const end = reverse ? -1 : cols;
        for (let c = start; c !== end; c += step) {
          const idx = r * cols + c;
          const oldV = field[idx];
          const newV = oldV >= 0.5 ? 1 : 0;
          field[idx] = newV;
          const err = oldV - newV;
          if (err === 0) continue;

          const cf = c + step; // "forward" in scan direction
          const cb = c - step;
          const below = idx + cols;
          const hasBelow = r + 1 < rows;

          if (algo === "floyd-steinberg") {
            const e16 = err / 16;
            if (cf >= 0 && cf < cols) field[idx + step] += e16 * 7;
            if (hasBelow) {
              if (cb >= 0 && cb < cols) field[below - step] += e16 * 3;
              field[below] += e16 * 5;
              if (cf >= 0 && cf < cols) field[below + step] += e16 * 1;
            }
          } else if (algo === "atkinson") {
            // Only 6/8 of the error moves on — the dropped quarter is the point.
            const e8 = err / 8;
            const cf2 = c + step * 2;
            if (cf >= 0 && cf < cols) field[idx + step] += e8;
            if (cf2 >= 0 && cf2 < cols) field[idx + step * 2] += e8;
            if (hasBelow) {
              if (cb >= 0 && cb < cols) field[below - step] += e8;
              field[below] += e8;
              if (cf >= 0 && cf < cols) field[below + step] += e8;
              if (r + 2 < rows) field[below + cols] += e8;
            }
          } else {
            // sierra-3
            const e32 = err / 32;
            const cf2 = c + step * 2;
            const cb2 = c - step * 2;
            if (cf >= 0 && cf < cols) field[idx + step] += e32 * 5;
            if (cf2 >= 0 && cf2 < cols) field[idx + step * 2] += e32 * 3;
            if (hasBelow) {
              if (cb2 >= 0 && cb2 < cols) field[below - step * 2] += e32 * 2;
              if (cb >= 0 && cb < cols) field[below - step] += e32 * 4;
              field[below] += e32 * 5;
              if (cf >= 0 && cf < cols) field[below + step] += e32 * 4;
              if (cf2 >= 0 && cf2 < cols) field[below + step * 2] += e32 * 2;
              if (r + 2 < rows) {
                const below2 = below + cols;
                if (cb >= 0 && cb < cols) field[below2 - step] += e32 * 2;
                field[below2] += e32 * 3;
                if (cf >= 0 && cf < cols) field[below2 + step] += e32 * 2;
              }
            }
          }
        }
      }

      // ── Write pass: two tones into the ImageData, upscale nearest ──────────
      const [ir, ig, ib] = hexToRgb(cfg.ink);
      const [pr, pg, pb] = hexToRgb(cfg.paper);
      const data = image.data;
      const total = cols * rows;
      for (let k = 0, p = 0; k < total; k++, p += 4) {
        const on = field[k] >= 0.5;
        data[p] = on ? ir : pr;
        data[p + 1] = on ? ig : pg;
        data[p + 2] = on ? ib : pb;
        data[p + 3] = 255;
      }
      cellCtx.putImageData(image, 0, 0);

      // Resizing the display canvas resets its state, so re-assert per frame.
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(cellCanvas, 0, 0, cols, rows, 0, 0, canvas.width, canvas.height);
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

  // Cell size changes the grid geometry — rebuild buffers, not just uniforms.
  useEffect(() => {
    loop.resize();
  }, [pixelSize, loop]);

  // Tuning while halted still repaints one still frame.
  useEffect(() => {
    loop.paint();
  }, [algorithm, fieldScale, speed, contrast, serpentine, ink, paper, loop]);

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

export default Stipple;
