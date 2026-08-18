"use client";

import { memo, useRef } from "react";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A topographic map of a landscape that will not hold still.
//
// The lines are not drawn, they are *found*. A height field is sampled onto a
// coarse grid every frame and marching squares walks it once per iso value,
// emitting the segments where the terrain crosses that altitude. Nothing in the
// code knows what a ridge is; ridges are where the crossings bunch up.
//
// Three decisions carry the component.
//
// **The lattice is periodic, so the drift never ends.** Value noise hashed
// through a 256-entry permutation table repeats exactly every 256 units, so the
// scroll offset is reduced `% 256` and the field is seamless forever. The
// alternative — letting the offset climb — puts the sample coordinates out past
// float precision after a few minutes and the terrain quietly quantises into
// terraces.
//
// **The interval is fixed, the range is not.** Contours are emitted at every
// multiple of one interval across whatever range the field currently occupies,
// rather than N lines stretched over it. That is what a real map does, and it
// is why the cursor can raise a peak: the extra altitude produces extra rings at
// the same spacing instead of restretching every line on screen.
//
// **Index contours are indexed by altitude, not by draw order.** Every Nth line
// is brighter, keyed to its absolute iso index, so a given ring keeps its weight
// as the terrain moves under it. Keying off the loop counter would make the
// emphasis crawl through the lines like a barber pole.

interface ContourProps {
  /** Iso lines per unit of altitude — the contour interval, inverted. */
  levels?: number;
  /** Grid spacing of the height samples. Lower is crisper and costs more. */
  cellSize?: number;
  /** How fast the terrain drifts beneath the frame. */
  speed?: number;
  /** Domain warp. At zero the field is smooth blobs; raising it folds the
   *  contours into ridges and saddles. */
  warp?: number;
  /** Radius of the bump the pointer raises, as a Gaussian sigma. */
  cursorRadius?: number;
  /** Height of that bump. Negative digs a depression instead. */
  cursorStrength?: number;
  /** Every Nth contour is an index contour, drawn brighter and heavier. */
  indexEvery?: number;
  /** Weight of an ordinary contour. Index contours are drawn at 1.5x. */
  lineWidth?: number;
  /** The ordinary contours. */
  lineColor?: string;
  /** The index contours. */
  indexColor?: string;
  /** The paper. */
  background?: string;
  /** Halt the drift. The map stays exactly where it is. */
  paused?: boolean;
  /** No drift and no cursor bump — one still map, which is what a map is. */
  reducedMotion?: boolean;
  className?: string;
}

/** Noise units per CSS pixel. One feature roughly every 300px at octave 0. */
const NOISE_SCALE = 0.0034;

/** Drift in noise units per second at speed 1. */
const DRIFT = 0.055;

/** Hard cap on grid columns and rows. An ultrawide monitor at a small cell size
 *  would otherwise quietly quadruple the per-frame cost; past this the cell
 *  grows instead, which nobody can see and the frame budget can. */
const MAX_CELLS = 200;

/** Permutation table for the value noise. Built once at module scope from a
 *  fixed seed — `Math.random()` here would hand the server and the client
 *  different terrain, and the first client frame would visibly jump. */
const PERM = (() => {
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  let s = 1337 >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = base[i];
    base[i] = base[j];
    base[j] = t;
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = base[i & 255];
  return p;
})();

const latticeValue = (xi: number, yi: number) =>
  PERM[(PERM[xi & 255] + (yi & 255)) & 511] / 255;

const fade = (t: number) => t * t * (3 - 2 * t);

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = fade(x - xi);
  const v = fade(y - yi);
  const a = latticeValue(xi, yi);
  const b = latticeValue(xi + 1, yi);
  const c = latticeValue(xi, yi + 1);
  const d = latticeValue(xi + 1, yi + 1);
  const top = a + (b - a) * u;
  const bottom = c + (d - c) * u;
  return top + (bottom - top) * v;
}

/** Three octaves, normalised to roughly 0..1. Two is not enough to read as
 *  terrain — the contours come out as concentric ovals — and four costs a third
 *  more for detail the line spacing cannot resolve. */
function fbm(x: number, y: number): number {
  return (
    (valueNoise(x, y) * 0.5 +
      valueNoise(x * 2, y * 2) * 0.25 +
      valueNoise(x * 4, y * 4) * 0.125) /
    0.875
  );
}

const Contour = memo(
  ({
    levels = 22,
    cellSize = 14,
    speed = 0.6,
    warp = 0.35,
    cursorRadius = 180,
    cursorStrength = 0.55,
    indexEvery = 5,
    lineWidth = 1,
    lineColor = "#5b5772",
    indexColor = "#a855f7",
    background = "#0d0d12",
    paused = false,
    reducedMotion = false,
    className,
  }: ContourProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawRef = useRef<((dt: number) => void | false) | null>(null);
    const measureRef = useRef<((m: Metrics) => void) | null>(null);
    const pointer = useRef({ x: 0, y: 0, inside: false });

    const loop = useAnimationLoop({
      target: containerRef,
      halted: paused || reducedMotion,
      dpr: "auto",
      onResize: (metrics) => measureRef.current?.(metrics),
      onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
    });

    const live = useRef({
      levels, cellSize, speed, warp, cursorRadius, cursorStrength,
      indexEvery, lineWidth, lineColor, indexColor, background, reducedMotion,
    });
    live.current = {
      levels, cellSize, speed, warp, cursorRadius, cursorStrength,
      indexEvery, lineWidth, lineColor, indexColor, background, reducedMotion,
    };

    // Everything the draw owns lives here rather than in the effect, because the
    // component has no setup phase worth speaking of — one canvas context and a
    // field buffer that the resize reallocates.
    const state = useRef({
      ctx: null as CanvasRenderingContext2D | null,
      field: new Float32Array(0),
      gw: 0,
      gh: 0,
      cs: 0,
      w: 0,
      h: 0,
      ox: 0,
      oy: 0,
      px: 0,
      py: 0,
      influence: 0,
      elapsed: 0,
    });

    measureRef.current = ({ width, height, dpr, bufferWidth, bufferHeight }) => {
      const canvas = canvasRef.current;
      if (!canvas || width < 1 || height < 1) return;
      const s = state.current;
      if (!s.ctx) s.ctx = canvas.getContext("2d", { alpha: false });
      canvas.width = bufferWidth;
      canvas.height = bufferHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      s.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);

      // The cell can only grow past the requested size, never shrink below it —
      // the cap is a cost ceiling, not a resolution target.
      const cs = Math.max(
        live.current.cellSize,
        width / MAX_CELLS,
        height / MAX_CELLS,
      );
      const gw = Math.max(2, Math.ceil(width / cs));
      const gh = Math.max(2, Math.ceil(height / cs));
      s.cs = cs;
      s.gw = gw;
      s.gh = gh;
      s.w = width;
      s.h = height;
      const need = (gw + 1) * (gh + 1);
      if (s.field.length !== need) s.field = new Float32Array(need);
      // The pointer bump is in CSS pixels, so a resize leaves it where the hand
      // last was rather than where it proportionally was.
      if (!pointer.current.inside) {
        s.px = width / 2;
        s.py = height / 2;
      }
    };

    drawRef.current = (dt) => {
      const s = state.current;
      const l = live.current;
      const ctx = s.ctx;
      if (!ctx || s.gw < 2) return;

      s.elapsed = (s.elapsed + dt) % 3600;

      // Reduced `% 256` against the lattice period, so the scroll is exact
      // rather than approximately seamless.
      s.ox = (s.ox + dt * l.speed * DRIFT) % 256;
      s.oy = (s.oy + dt * l.speed * DRIFT * 0.62) % 256;

      // Framerate-independent damping: the bump follows the hand with weight
      // instead of teleporting, and lets go over about a second on exit.
      const ease = (rate: number) => 1 - Math.exp(-dt * rate);
      s.px += (pointer.current.x - s.px) * ease(9);
      s.py += (pointer.current.y - s.py) * ease(9);
      const want = pointer.current.inside && !l.reducedMotion ? 1 : 0;
      s.influence += (want - s.influence) * ease(4);

      const { gw, gh, cs, field } = s;
      const bump = l.cursorStrength * s.influence;
      const sigma = Math.max(8, l.cursorRadius * 0.5);
      const inv2s2 = 1 / (2 * sigma * sigma);
      const warpAmt = l.warp * 1.6;

      let min = Infinity;
      let max = -Infinity;

      for (let j = 0; j <= gh; j++) {
        const py = j * cs;
        const ny = py * NOISE_SCALE + s.oy;
        const rowBase = j * (gw + 1);
        for (let i = 0; i <= gw; i++) {
          const px = i * cs;
          const nx = px * NOISE_SCALE + s.ox;

          // Domain warp: one extra fetch displaces the sample coordinates, which
          // is what turns smooth blobs into folded ridges. Sampling the same
          // field at an offset rather than a second field keeps it to one table.
          let sx = nx;
          let sy = ny;
          if (warpAmt > 0) {
            sx += (valueNoise(nx * 1.7 + 11.3, ny * 1.7) - 0.5) * warpAmt;
            sy += (valueNoise(nx * 1.7, ny * 1.7 + 5.7) - 0.5) * warpAmt;
          }

          let v = fbm(sx, sy);

          if (bump !== 0) {
            const dx = px - s.px;
            const dy = py - s.py;
            v += bump * Math.exp(-(dx * dx + dy * dy) * inv2s2);
          }

          field[rowBase + i] = v;
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }

      ctx.fillStyle = l.background;
      ctx.fillRect(0, 0, s.w, s.h);

      const interval = 1 / Math.max(1, l.levels);
      const first = Math.ceil(min / interval);
      const last = Math.floor(max / interval);
      const every = Math.max(2, Math.round(l.indexEvery));

      const regular = new Path2D();
      const indexed = new Path2D();

      for (let k = first; k <= last; k++) {
        const iso = k * interval;
        // Modulo on a negative k would flip the emphasis below sea level, so the
        // index test is taken on the distance from zero.
        const path = Math.abs(k) % every === 0 ? indexed : regular;

        for (let j = 0; j < gh; j++) {
          const top = j * (gw + 1);
          const bot = top + gw + 1;
          const y0 = j * cs;
          const y1 = y0 + cs;

          for (let i = 0; i < gw; i++) {
            const a = field[top + i];
            const b = field[top + i + 1];
            const c = field[bot + i + 1];
            const d = field[bot + i];

            let code = 0;
            if (a >= iso) code |= 1;
            if (b >= iso) code |= 2;
            if (c >= iso) code |= 4;
            if (d >= iso) code |= 8;
            if (code === 0 || code === 15) continue;

            const x0 = i * cs;
            const x1 = x0 + cs;

            // Crossing points on each edge, computed only where the case needs
            // them — the interpolation is the reason the lines are smooth
            // instead of stepping around the grid.
            const tx = x0 + (cs * (iso - a)) / (b - a);
            const rx = y0 + (cs * (iso - b)) / (c - b);
            const bx = x0 + (cs * (iso - d)) / (c - d);
            const lx = y0 + (cs * (iso - a)) / (d - a);

            const seg = (ax: number, ay: number, bx2: number, by: number) => {
              path.moveTo(ax, ay);
              path.lineTo(bx2, by);
            };

            switch (code) {
              case 1:
              case 14:
                seg(x0, lx, tx, y0);
                break;
              case 2:
              case 13:
                seg(tx, y0, x1, rx);
                break;
              case 3:
              case 12:
                seg(x0, lx, x1, rx);
                break;
              case 4:
              case 11:
                seg(x1, rx, bx, y1);
                break;
              case 6:
              case 9:
                seg(tx, y0, bx, y1);
                break;
              case 7:
              case 8:
                seg(x0, lx, bx, y1);
                break;
              // Saddles. Both diagonals cross this cell and the grid cannot say
              // which pair joins; the centre value decides, and getting it wrong
              // is visible as two contours that touch at a point.
              case 5: {
                if ((a + b + c + d) * 0.25 >= iso) {
                  seg(x0, lx, bx, y1);
                  seg(tx, y0, x1, rx);
                } else {
                  seg(x0, lx, tx, y0);
                  seg(x1, rx, bx, y1);
                }
                break;
              }
              case 10: {
                if ((a + b + c + d) * 0.25 >= iso) {
                  seg(x0, lx, tx, y0);
                  seg(x1, rx, bx, y1);
                } else {
                  seg(x0, lx, bx, y1);
                  seg(tx, y0, x1, rx);
                }
                break;
              }
            }
          }
        }
      }

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = 0.42;
      ctx.strokeStyle = l.lineColor;
      ctx.lineWidth = l.lineWidth;
      ctx.stroke(regular);
      ctx.globalAlpha = 0.92;
      ctx.strokeStyle = l.indexColor;
      ctx.lineWidth = l.lineWidth * 1.5;
      ctx.stroke(indexed);
      ctx.globalAlpha = 1;
    };

    const track = (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      pointer.current.x = e.clientX - rect.left;
      pointer.current.y = e.clientY - rect.top;
      pointer.current.inside = true;
    };

    const leave = () => {
      pointer.current.inside = false;
    };

    return (
      <div
        ref={containerRef}
        className={`relative h-full w-full ${className ?? ""}`}
        // No touch-action here on purpose. The bump follows a hover; a finger is
        // scrolling the page past a background, and taking that gesture would
        // trap the reader on the section.
        onPointerMove={track}
        onPointerLeave={leave}
        onPointerCancel={leave}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block h-full w-full"
        />
      </div>
    );
  },
);

Contour.displayName = "Contour";

export default Contour;
