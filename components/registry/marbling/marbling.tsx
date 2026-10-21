"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// Paper marbling (suminagashi, ebru) built from the closed-form transforms in
// "Mathematical Marbling" (Lu, Jaffer et al.). There is no fluid solver and no
// grid. Every drop of ink is a polygon, and everything that happens to the bath
// is a map applied to every vertex of every polygon.
//
// The drop map p' = c + (p − c)·√(1 + Δ/|p − c|²) carries the component. It
// preserves area and it composes exactly, because |p' − c|² = |p − c|² + Δ.
// So a drop can fall over many frames, applying Δ = r²(t) − r²(t − dt) each
// time, and still land exactly where one application would put it. Older ink
// is pushed aside: stretched into rings, never overlapped, never torn.
//
// The comb (one of Jaffer's tine lines, repeated every λ) is exact in
// increments for a different reason. It only moves ink parallel to the tines,
// so a vertex's distance to its nearest tine never changes while the comb
// travels, and the pull it feels is the same on every frame.
//
// Painting is painter's order, oldest first. A drop is born inside whatever
// ink it lands on and both maps are homeomorphisms, so a newer polygon can sit
// inside an older one but can never contain it. Filling oldest to newest is
// therefore always the right stacking, with no clipping and no holes.

export interface MarblingProps {
  /** Seconds between ink drops. */
  dropInterval?: number;
  /** Radius of a fresh drop, in CSS pixels. Each drop varies a little around it. */
  dropSize?: number;
  /** How far each comb pass drags the ink. 0 turns the comb off. */
  combStrength?: number;
  /** Gap between the comb's teeth, in CSS pixels. */
  tineSpacing?: number;
  /** How fast a tooth's pull fades with distance, in CSS pixels. */
  sharpness?: number;
  /** Let a drag pull the ink. Off keeps touch scrolling on phones. */
  stylus?: boolean;
  /** The first ink in the drop cycle. */
  inkColor1?: string;
  /** The second ink. */
  inkColor2?: string;
  /** The third ink. */
  inkColor3?: string;
  /** The paper under the ink. */
  paperColor?: string;
  /** Hold the bath still. The stylus still works. */
  paused?: boolean;
  /** Show a still, already marbled sheet. The stylus still works. */
  reducedMotion?: boolean;
  className?: string;
}

/** World units across the sheet. The screen shows it with "cover" scaling. */
const WORLD = 1000;
const CENTER = WORLD / 2;
const TAU = Math.PI * 2;

/** Seconds a drop takes to spread to its full size. */
const FALL_SECONDS = 0.55;
/** Seconds one comb pass takes to travel. */
const COMB_SECONDS = 1.4;
/** Drops between comb passes. */
const COMB_EVERY = 7;
/** Comb travel per unit of combStrength, as a fraction of the tine spacing. */
const COMB_TRAVEL = 0.9;
/** Seconds an over-cap drop takes to soak away. */
const FADE_SECONDS = 1.2;

/** Vertices on a new drop. It is born tiny and the drop map grows it exactly. */
const DROP_VERTS = 48;
const BIRTH_RADIUS = 0.5;
/** Each drop's radius varies by this much either side of `dropSize`. */
const SIZE_JITTER = 0.2;
/** Chance a drop lands back on the last one, nesting rings, and the longest run. */
const NEST_ODDS = 0.42;
const NEST_MAX = 3;

/** Longest edge kept near the view, and the gap below which vertices merge. CSS px. */
const MAX_EDGE_PX = 3.5;
const MIN_GAP_PX = 0.35;
/** A polygon this small is never merged further. */
const MERGE_FLOOR = 24;
/** Offscreen vertices are thinned to this many times the on-screen edge. */
const COARSE = 4;
/** Fine detail is kept this far past the view edge. CSS px. */
const MARGIN_PX = 32;

/** How far a drawn outline may stray from the simulated one, and its longest
 *  chord, in CSS px. Drawing only: the simulation keeps every vertex. */
const RENDER_TOLERANCE_PX = 0.2;
const RENDER_CHORD_PX = 28;

/** Vertex budget across the sheet, and the hard ceiling on live drops. */
const MAX_VERTS = 30000;
const MAX_DROPS = 120;

/** Stylus pull falloff in CSS px, the longest step per application as a
 *  fraction of it (any longer and the map folds), and how many falloffs out
 *  the pull is still worth computing (2^-9 of a step). */
const STYLUS_FALLOFF_PX = 18;
const STYLUS_STEP = 0.8;
const STYLUS_REACH = 9;
const STROKE_CAP = 128;

/** First paint is already marbled: a ground of drops, one comb pass, then
 *  fresh drops on top (18 / comb / 10 at thumbnail size). A big stage gets
 *  more drops, and bigger ones, until the ink covers it this many times over:
 *  drops land in the middle, so the corners fill last. */
const WARM_GROUND = 18;
const WARM_TOP = 10;
const WARM_MAX = 48;
const WARM_COVER = 1.6;
/** The pre-warm comb is split so each step drags at most this far (CSS px). */
const WARM_COMB_STEP_PX = 6;
/** The first live comb pass waits this many drops. */
const FIRST_COMB_AFTER = 2;

/** 2^-x sampled every 1/64 out to 2^-32, read with linear interpolation. The
 *  comb pull is a fixed function of a distance that never changes, so a
 *  table keeps the increments exactly composable and costs half of exp(). */
const FALLOFF_STEPS = 64;
const FALLOFF_SPAN = 32;
const FALLOFF_END = FALLOFF_SPAN * FALLOFF_STEPS;
const FALLOFF = new Float64Array(FALLOFF_END + 2);
for (let i = 0; i <= FALLOFF_END; i++) FALLOFF[i] = 2 ** (-i / FALLOFF_STEPS);

const SEED = 0x5eed1e;

interface Drop {
  /** 0..2 picks inkColor1..3. */
  slot: number;
  /** x,y pairs in world units. */
  pts: Float64Array;
  /** The resample target, swapped with `pts` after every pass. */
  alt: Float64Array;
  n: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 1 while live; falls to 0 while an over-cap drop soaks away. */
  fade: number;
}

interface Fall {
  /** The drop's centre, carried along by everything else that moves the bath. */
  c: Float64Array;
  r2: number;
  t: number;
  done: number;
}

interface Comb {
  bx: number;
  by: number;
  nx: number;
  ny: number;
  mx: number;
  my: number;
  spacing: number;
  /** 1 / falloff, so the pull is 2^(−d/c). */
  inv: number;
  travel: number;
  t: number;
  done: number;
}

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

const subscribeReduce = (notify: () => void) => {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia(REDUCE_QUERY);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};

const readReduce = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia &&
  window.matchMedia(REDUCE_QUERY).matches;

const readReduceOnServer = () => false;

export default function Marbling({
  dropInterval = 0.9,
  dropSize = 48,
  combStrength = 1,
  tineSpacing = 80,
  sharpness = 22,
  stylus = true,
  inkColor1 = "#a855f7",
  inkColor2 = "#3b0764",
  inkColor3 = "#d4a24c",
  paperColor = "#f3ecdf",
  paused = false,
  reducedMotion = false,
  className = "",
}: MarblingProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const prefersReduced = useSyncExternalStore(
    subscribeReduce,
    readReduce,
    readReduceOnServer,
  );
  const still = reducedMotion || prefersReduced;

  const live = useRef({
    dropInterval,
    dropSize,
    combStrength,
    tineSpacing,
    sharpness,
    stylus,
    inkColor1,
    inkColor2,
    inkColor3,
    paperColor,
    still,
  });
  useLayoutEffect(() => {
    live.current = {
      dropInterval,
      dropSize,
      combStrength,
      tineSpacing,
      sharpness,
      stylus,
      inkColor1,
      inkColor2,
      inkColor3,
      paperColor,
      still,
    };
  });

  const drawRef = useRef<((dt: number) => void | false) | null>(null);
  const measureRef = useRef<((m: Metrics) => void) | null>(null);

  const loop = useAnimationLoop({
    target: containerRef,
    halted: paused || still,
    dpr: 1,
    onResize: (m) => measureRef.current?.(m),
    onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // A CPU-backed canvas. These paths are thousands of short edges that
    // change every frame; GPU 2D re-tessellates or re-uploads each one and
    // measured several times slower (12 fps vs 44) than one software raster
    // plus a single upload of the finished frame.
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    // ── Screen mapping. Everything below lives in world units; only the
    //    thresholds are measured in CSS pixels, so a resize re-derives them
    //    and the sheet itself survives untouched.
    let width = 0;
    let height = 0;
    let dpr = 1;
    let scale = 1;
    let offX = 0;
    let offY = 0;
    let viewX0 = 0;
    let viewY0 = 0;
    let viewX1 = 0;
    let viewY1 = 0;
    let fineX0 = 0;
    let fineY0 = 0;
    let fineX1 = 0;
    let fineY1 = 0;
    let lod = 1;

    // ── The sheet. Rebuilt from the seed on every setup, so Strict Mode's
    //    second run lands on the exact same marbling.
    const rand = mulberry32(SEED);
    const drops: Drop[] = [];
    const spare: Drop[] = [];
    const falls: Fall[] = [];
    const combs: Comb[] = [];
    const strokes = new Float64Array(STROKE_CAP * 4);
    let strokeCount = 0;
    let strokeSlack = 0;
    // Where the last drop landed, carried by the bath like any vertex, so a
    // nested drop finds the rings it belongs inside.
    const spot = new Float64Array(2);
    let nest = 0;
    let baseSlot = -1;
    let warmed = false;
    let clock = 0;
    let made = 0;
    let passes = 0;
    let sinceComb = 0;
    let seenStrength = 0;
    let seenSpacing = 0;
    let seenSharpness = 0;

    const inks = ["#a855f7", "#3b0764", "#d4a24c"];
    let paper = "#f3ecdf";
    const colorInputs = ["", "", "", ""];

    const pointer = { id: -1, x: 0, y: 0 };

    const resolveColor = (value: string, fallback: string): string => {
      const hex = normalizeHex(value);
      if (hex) return hex;
      // Anything else CSS understands, validated by the canvas itself: an
      // invalid string leaves the fallback in place instead of quietly
      // painting with whatever colour was set last.
      ctx.fillStyle = fallback;
      ctx.fillStyle = value;
      return String(ctx.fillStyle);
    };

    const syncColors = (): boolean => {
      const cfg = live.current;
      if (
        cfg.inkColor1 === colorInputs[0] &&
        cfg.inkColor2 === colorInputs[1] &&
        cfg.inkColor3 === colorInputs[2] &&
        cfg.paperColor === colorInputs[3]
      ) {
        return false;
      }
      colorInputs[0] = cfg.inkColor1;
      colorInputs[1] = cfg.inkColor2;
      colorInputs[2] = cfg.inkColor3;
      colorInputs[3] = cfg.paperColor;
      inks[0] = resolveColor(cfg.inkColor1, inks[0]);
      inks[1] = resolveColor(cfg.inkColor2, inks[1]);
      inks[2] = resolveColor(cfg.inkColor3, inks[2]);
      paper = resolveColor(cfg.paperColor, paper);
      return true;
    };

    const map = () => {
      scale = Math.max(width, height) / WORLD;
      offX = width / 2 - CENTER * scale;
      offY = height / 2 - CENTER * scale;
      viewX0 = -offX / scale;
      viewY0 = -offY / scale;
      viewX1 = (width - offX) / scale;
      viewY1 = (height - offY) / scale;
      const margin = MARGIN_PX / scale;
      fineX0 = viewX0 - margin;
      fineY0 = viewY0 - margin;
      fineX1 = viewX1 + margin;
      fineY1 = viewY1 + margin;
    };

    // ── Transforms over the whole bath ─────────────────────────────────────

    const fallAll = (cx: number, cy: number, delta: number) => {
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        fallOn(d.pts, d.n, cx, cy, delta);
      }
      for (let i = 0; i < falls.length; i++) fallOn(falls[i].c, 1, cx, cy, delta);
      fallOn(spot, 1, cx, cy, delta);
    };

    const combAll = (comb: Comb, dz: number) => {
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        combOn(d.pts, d.n, comb, dz);
      }
      for (let i = 0; i < falls.length; i++) combOn(falls[i].c, 1, comb, dz);
      combOn(spot, 1, comb, dz);
    };

    const pullAll = (
      ax: number,
      ay: number,
      bx: number,
      by: number,
      falloff: number,
    ) => {
      // The early-out trusts boxes from the last resample, so it is widened by
      // everything the stylus has already moved in this batch.
      const reach = falloff * STYLUS_REACH;
      const loX = Math.min(ax, bx) - reach - strokeSlack;
      const loY = Math.min(ay, by) - reach - strokeSlack;
      const hiX = Math.max(ax, bx) + reach + strokeSlack;
      const hiY = Math.max(ay, by) + reach + strokeSlack;
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        if (d.x1 < loX || d.x0 > hiX || d.y1 < loY || d.y0 > hiY) continue;
        pullOn(d.pts, d.n, ax, ay, bx, by, falloff);
      }
      for (let i = 0; i < falls.length; i++) {
        pullOn(falls[i].c, 1, ax, ay, bx, by, falloff);
      }
      pullOn(spot, 1, ax, ay, bx, by, falloff);
    };

    // ── Resampling ─────────────────────────────────────────────────────────
    //
    // After every batch of transforms each polygon is walked once: long edges
    // near the view are split, crowded vertices merge, offscreen runs thin out.
    // The same walk measures the bounding box and whether any vertex sits in
    // the cover region, which is all the culling below needs.

    let clipT0 = 0;
    let clipT1 = 1;

    // Slab clip of a segment against the fine region. Both endpoints being
    // outside proves nothing: a long edge can cross the whole view.
    const clipFine = (x: number, y: number, dx: number, dy: number) => {
      let t0 = 0;
      let t1 = 1;
      if (dx === 0) {
        if (x < fineX0 || x > fineX1) return false;
      } else {
        let a = (fineX0 - x) / dx;
        let b = (fineX1 - x) / dx;
        if (a > b) {
          const t = a;
          a = b;
          b = t;
        }
        if (a > t0) t0 = a;
        if (b < t1) t1 = b;
        if (t0 > t1) return false;
      }
      if (dy === 0) {
        if (y < fineY0 || y > fineY1) return false;
      } else {
        let a = (fineY0 - y) / dy;
        let b = (fineY1 - y) / dy;
        if (a > b) {
          const t = a;
          a = b;
          b = t;
        }
        if (a > t0) t0 = a;
        if (b < t1) t1 = b;
        if (t0 > t1) return false;
      }
      clipT0 = t0;
      clipT1 = t1;
      return true;
    };

    const refine = (
      d: Drop,
      coverX0: number,
      coverY0: number,
      coverX1: number,
      coverY1: number,
    ): boolean => {
      const src = d.pts;
      const n = d.n;
      const edge = (MAX_EDGE_PX / scale) * lod;
      const edge2 = edge * edge;
      const gap = (MIN_GAP_PX / scale) * lod;
      const gap2 = gap * gap;
      const coarse2 = edge2 * COARSE * COARSE;
      const fx0 = fineX0;
      const fy0 = fineY0;
      const fx1 = fineX1;
      const fy1 = fineY1;

      let out = d.alt;
      if (out.length < n * 2 + 64) out = new Float64Array(n * 4 + 256);
      let k = 0;
      let hit = false;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;

      let lx = src[0];
      let ly = src[1];
      out[k++] = lx;
      out[k++] = ly;
      let lin = lx >= fx0 && lx <= fx1 && ly >= fy0 && ly <= fy1;

      for (let i = 1; i <= n; i++) {
        const closing = i === n;
        const j = closing ? 0 : i * 2;
        const qx = src[j];
        const qy = src[j + 1];
        const dx = qx - lx;
        const dy = qy - ly;
        const len2 = dx * dx + dy * dy;
        const qin = qx >= fx0 && qx <= fx1 && qy >= fy0 && qy <= fy1;

        if (!closing && (k >> 1) + (n - 1 - i) >= MERGE_FLOOR) {
          if (len2 < gap2) continue;
          if (!lin && !qin && len2 < coarse2) {
            const nj = i + 1 === n ? 0 : (i + 1) * 2;
            const nx = src[nj];
            const ny = src[nj + 1];
            if (!(nx >= fx0 && nx <= fx1 && ny >= fy0 && ny <= fy1)) continue;
          }
        }

        if (len2 > edge2 && clipFine(lx, ly, dx, dy)) {
          const t0 = clipT0;
          const t1 = clipT1;
          const span = (t1 - t0) * Math.sqrt(len2);
          if (span > edge) {
            const pieces = Math.ceil(span / edge);
            if (k + pieces * 2 + 8 > out.length) {
              const grown = new Float64Array((k + pieces * 2) * 2 + 256);
              grown.set(out.subarray(0, k));
              out = grown;
            }
            if (t0 > 0) {
              out[k++] = lx + dx * t0;
              out[k++] = ly + dy * t0;
            }
            for (let s = 1; s < pieces; s++) {
              const t = t0 + ((t1 - t0) * s) / pieces;
              out[k++] = lx + dx * t;
              out[k++] = ly + dy * t;
            }
            if (t1 < 1) {
              out[k++] = lx + dx * t1;
              out[k++] = ly + dy * t1;
            }
          }
        }
        if (closing) break;

        if (k + 2 > out.length) {
          const grown = new Float64Array(out.length * 2);
          grown.set(out.subarray(0, k));
          out = grown;
        }
        out[k++] = qx;
        out[k++] = qy;
        lx = qx;
        ly = qy;
        lin = qin;
      }

      for (let i = 0; i < k; i += 2) {
        const x = out[i];
        const y = out[i + 1];
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        if (
          !hit &&
          x >= coverX0 &&
          x <= coverX1 &&
          y >= coverY0 &&
          y <= coverY1
        ) {
          hit = true;
        }
      }

      d.alt = src;
      d.pts = out;
      d.n = k >> 1;
      d.x0 = x0;
      d.y0 = y0;
      d.x1 = x1;
      d.y1 = y1;
      return hit;
    };

    const recycle = (d: Drop) => {
      if (spare.length < 24) spare.push(d);
    };

    const resample = () => {
      const cfg = live.current;
      // A polygon whose boundary is further out than one comb pass can drag it
      // is safe to treat as covering the whole view.
      const reach =
        (MARGIN_PX +
          Math.max(0, cfg.combStrength) *
            COMB_TRAVEL *
            Math.max(0, cfg.tineSpacing)) /
        scale;
      const coverX0 = viewX0 - reach;
      const coverY0 = viewY0 - reach;
      const coverX1 = viewX1 + reach;
      const coverY1 = viewY1 + reach;
      // Ink is kept across the whole world square, not just the view, so a
      // resize to a different aspect still finds the sheet that was there.
      const keepLo = Math.min(0, coverX0, coverY0);
      const keepHi = Math.max(WORLD, coverX1, coverY1);

      let total = 0;
      let cover = -1;
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        const hit = refine(d, coverX0, coverY0, coverX1, coverY1);
        total += d.n;
        if (
          !hit &&
          d.x0 < CENTER &&
          d.x1 > CENTER &&
          d.y0 < CENTER &&
          d.y1 > CENTER &&
          contains(d.pts, d.n, CENTER, CENTER)
        ) {
          cover = i;
        }
      }

      // The newest polygon that covers the view becomes the paper: everything
      // older is underneath it everywhere the eye can reach.
      let w = 0;
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        if (i === cover) baseSlot = d.slot;
        const gone =
          i <= cover ||
          d.fade <= 0 ||
          d.n < 3 ||
          d.x1 < keepLo ||
          d.x0 > keepHi ||
          d.y1 < keepLo ||
          d.y0 > keepHi;
        if (gone) recycle(d);
        else drops[w++] = d;
      }
      drops.length = w;

      // Over the ceiling, the oldest drops leave. One out of sight just goes;
      // one in view soaks away over a second instead of vanishing.
      let excess = drops.length - MAX_DROPS;
      for (let i = 0; i < drops.length && excess > 0; i++) {
        const d = drops[i];
        excess--;
        if (d.fade < 1) continue;
        const visible = !(
          d.x1 < viewX0 ||
          d.x0 > viewX1 ||
          d.y1 < viewY0 ||
          d.y0 > viewY1
        );
        d.fade = visible ? 0.999 : 0;
      }

      if (total > MAX_VERTS) lod = Math.min(lod * 1.25, 16);
      else if (lod > 1 && total < MAX_VERTS * 0.7) lod = Math.max(1, lod / 1.02);
    };

    // ── Drops and combs ────────────────────────────────────────────────────

    const spawn = (instant: boolean, grow: number) => {
      const cfg = live.current;
      const w = viewX1 - viewX0;
      const h = viewY1 - viewY0;
      const zx0 = viewX0 + w * 0.15;
      const zy0 = viewY0 + h * 0.15;
      const zx1 = viewX1 - w * 0.15;
      const zy1 = viewY1 - h * 0.15;
      const radius =
        ((Math.max(1, cfg.dropSize) * grow) / scale) *
        (1 - SIZE_JITTER + 2 * SIZE_JITTER * rand());

      let cx: number;
      let cy: number;
      const inZone =
        spot[0] >= zx0 && spot[0] <= zx1 && spot[1] >= zy0 && spot[1] <= zy1;
      if (made > 0 && nest < NEST_MAX && inZone && rand() < NEST_ODDS) {
        // Back onto the last drop, a little off centre: nested rings.
        const a = rand() * TAU;
        const off = rand() * radius * 0.25;
        cx = spot[0] + Math.cos(a) * off;
        cy = spot[1] + Math.sin(a) * off;
        nest++;
      } else {
        cx = zx0 + (zx1 - zx0) * rand();
        cy = zy0 + (zy1 - zy0) * rand();
        nest = 0;
      }

      const d =
        spare.pop() ??
        ({
          slot: 0,
          pts: new Float64Array(512),
          alt: new Float64Array(512),
          n: 0,
          x0: 0,
          y0: 0,
          x1: 0,
          y1: 0,
          fade: 1,
        } satisfies Drop);
      d.slot = made % 3;
      d.fade = 1;
      made++;
      const p = d.pts;
      for (let i = 0; i < DROP_VERTS; i++) {
        const a = (i / DROP_VERTS) * TAU;
        p[i * 2] = cx + Math.cos(a) * BIRTH_RADIUS;
        p[i * 2 + 1] = cy + Math.sin(a) * BIRTH_RADIUS;
      }
      d.n = DROP_VERTS;
      d.x0 = cx - BIRTH_RADIUS;
      d.y0 = cy - BIRTH_RADIUS;
      d.x1 = cx + BIRTH_RADIUS;
      d.y1 = cy + BIRTH_RADIUS;
      drops.push(d);
      spot[0] = cx;
      spot[1] = cy;

      const r2 = radius * radius;
      if (instant) {
        fallAll(cx, cy, r2);
        resample();
      } else {
        const c = new Float64Array(2);
        c[0] = cx;
        c[1] = cy;
        falls.push({ c, r2, t: 0, done: 0 });
      }
    };

    const makeComb = (): Comb | null => {
      const cfg = live.current;
      const spacing = Math.max(1, cfg.tineSpacing) / scale;
      const falloff = Math.max(0.5, cfg.sharpness) / scale;
      const travel = Math.max(0, cfg.combStrength) * COMB_TRAVEL * spacing;
      if (!(travel > 0)) return null;
      // Passes alternate vertical and horizontal. Each orientation flips its
      // direction and shifts half a tooth every time it comes round, so the
      // return stroke runs between the last one's tines: feathers.
      const k = passes++;
      const vertical = k % 2 === 0;
      const round = Math.floor(k / 2);
      const sign = round % 2 === 0 ? 1 : -1;
      const phase = (round % 2) * spacing * 0.5;
      const nx = vertical ? 1 : 0;
      const ny = vertical ? 0 : 1;
      return {
        bx: CENTER + nx * phase,
        by: CENTER + ny * phase,
        nx,
        ny,
        mx: vertical ? 0 : sign,
        my: vertical ? sign : 0,
        spacing,
        inv: 1 / falloff,
        travel,
        t: 0,
        done: 0,
      };
    };

    const warm = () => {
      const cfg = live.current;
      const size = Math.max(1, cfg.dropSize);
      const areaPx = width * height;
      const need = (WARM_COVER * areaPx) / (Math.PI * size * size);
      const base = WARM_GROUND + WARM_TOP;
      const count = Math.max(base, Math.min(WARM_MAX, Math.round(need)));
      // Past the drop ceiling the ground drops grow instead, so a wide stage
      // starts covered without a long synchronous warm-up.
      const grow = need > count ? Math.sqrt(need / count) : 1;
      const top = Math.round((count * WARM_TOP) / base);
      for (let i = 0; i < count - top; i++) spawn(true, grow);
      const comb = makeComb();
      if (comb) {
        // Exact in one go, but split so the resampler can follow the feathers
        // out as they stretch.
        const steps = Math.min(
          24,
          Math.max(6, Math.ceil((comb.travel * scale) / WARM_COMB_STEP_PX)),
        );
        const dz = comb.travel / steps;
        for (let s = 0; s < steps; s++) {
          combAll(comb, dz);
          resample();
        }
      }
      for (let i = 0; i < top; i++) spawn(true, 1);
      sinceComb = COMB_EVERY - FIRST_COMB_AFTER;
      seenStrength = cfg.combStrength;
      seenSpacing = cfg.tineSpacing;
      seenSharpness = cfg.sharpness;
      warmed = true;
    };

    // ── Stylus ─────────────────────────────────────────────────────────────

    const applyStrokes = () => {
      const falloff = STYLUS_FALLOFF_PX / scale;
      const step = STYLUS_STEP * falloff;
      strokeSlack = 0;
      for (let s = 0; s < strokeCount; s++) {
        const o = s * 4;
        const ax = strokes[o];
        const ay = strokes[o + 1];
        const sx = strokes[o + 2] - ax;
        const sy = strokes[o + 3] - ay;
        const len = Math.sqrt(sx * sx + sy * sy);
        if (!(len > 1e-9)) continue;
        // Above ~1.44 falloffs per application the map folds: polygons cross
        // themselves and the nonzero fill opens holes. Long moves are split.
        const pieces = Math.min(256, Math.ceil(len / step));
        for (let p = 0; p < pieces; p++) {
          const t0 = p / pieces;
          const t1 = (p + 1) / pieces;
          pullAll(ax + sx * t0, ay + sy * t0, ax + sx * t1, ay + sy * t1, falloff);
        }
        strokeSlack += len;
      }
      strokeCount = 0;
      strokeSlack = 0;
    };

    const queueStroke = (x: number, y: number) => {
      const ax = pointer.x;
      const ay = pointer.y;
      pointer.x = x;
      pointer.y = y;
      if ((x - ax) * (x - ax) + (y - ay) * (y - ay) < 1e-10) return;
      if (strokeCount >= STROKE_CAP) {
        const o = (strokeCount - 1) * 4;
        strokes[o + 2] = x;
        strokes[o + 3] = y;
        return;
      }
      const o = strokeCount * 4;
      strokes[o] = ax;
      strokes[o + 1] = ay;
      strokes[o + 2] = x;
      strokes[o + 3] = y;
      strokeCount++;
    };

    const onDown = (e: PointerEvent) => {
      if (!live.current.stylus || !warmed || pointer.id !== -1) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const box = canvas.getBoundingClientRect();
      pointer.id = e.pointerId;
      pointer.x = (e.clientX - box.left - offX) / scale;
      pointer.y = (e.clientY - box.top - offY) / scale;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // A synthetic or already-released pointer cannot be captured; the
        // drag still works while it stays over the canvas.
      }
      e.preventDefault();
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointer.id) return;
      if (!live.current.stylus) {
        onUp(e);
        return;
      }
      const box = canvas.getBoundingClientRect();
      const left = box.left + offX;
      const top = box.top + offY;
      const batch =
        typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
      if (batch.length > 0) {
        for (let i = 0; i < batch.length; i++) {
          queueStroke(
            (batch[i].clientX - left) / scale,
            (batch[i].clientY - top) / scale,
          );
        }
      } else {
        queueStroke((e.clientX - left) / scale, (e.clientY - top) / scale);
      }
      // Direct manipulation works while paused or still: one frame applies
      // the stroke and repaints. While running this is a no-op.
      loop.paint();
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pointer.id) return;
      pointer.id = -1;
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    };

    // ── Paint ──────────────────────────────────────────────────────────────

    const render = () => {
      if (width <= 0 || height <= 0) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = baseSlot < 0 ? paper : inks[baseSlot];
      ctx.fillRect(0, 0, width, height);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offX, dpr * offY);
      const tol = RENDER_TOLERANCE_PX / scale;
      const reach2 = (RENDER_CHORD_PX / scale) ** 2;
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        if (d.x1 < viewX0 || d.x0 > viewX1 || d.y1 < viewY0 || d.y0 > viewY1) {
          continue;
        }
        ctx.beginPath();
        traceSimplified(ctx, d.pts, d.n, tol, reach2);
        ctx.closePath();
        ctx.fillStyle = inks[d.slot];
        if (d.fade < 1) {
          ctx.globalAlpha = d.fade > 0 ? d.fade : 0;
          ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          ctx.fill();
        }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const frame = (dt: number): void | false => {
      if (width <= 0 || height <= 0 || !warmed) return;
      const cfg = live.current;
      const step = cfg.still ? 0 : dt;
      let moved = false;

      // The stylus goes first: its early-out reads boxes from the last pass.
      if (strokeCount > 0) {
        applyStrokes();
        moved = true;
      }

      if (step > 0) {
        // Retuning the comb pulls the next pass forward, so the change shows
        // within a drop or two instead of after the next six.
        if (
          cfg.combStrength !== seenStrength ||
          cfg.tineSpacing !== seenSpacing ||
          cfg.sharpness !== seenSharpness
        ) {
          seenStrength = cfg.combStrength;
          seenSpacing = cfg.tineSpacing;
          seenSharpness = cfg.sharpness;
          sinceComb = Math.max(sinceComb, COMB_EVERY - 1);
        }

        const interval = Math.max(0.05, cfg.dropInterval);
        clock += step;
        if (clock >= interval) {
          clock = clock - interval > interval ? 0 : clock - interval;
          spawn(false, 1);
          moved = true;
          sinceComb++;
          if (sinceComb >= COMB_EVERY) {
            const comb = makeComb();
            if (comb) {
              combs.push(comb);
              sinceComb = 0;
            }
          }
        }

        let w = 0;
        for (let i = 0; i < falls.length; i++) {
          const f = falls[i];
          f.t = Math.min(FALL_SECONDS, f.t + step);
          const target = f.r2 * easeOutCubic(f.t / FALL_SECONDS);
          const delta = target - f.done;
          f.done = target;
          if (delta > 0) {
            fallAll(f.c[0], f.c[1], delta);
            moved = true;
          }
          if (f.t < FALL_SECONDS) falls[w++] = f;
        }
        falls.length = w;

        w = 0;
        for (let i = 0; i < combs.length; i++) {
          const c = combs[i];
          c.t = Math.min(COMB_SECONDS, c.t + step);
          const target = c.travel * easeInOut(c.t / COMB_SECONDS);
          const dz = target - c.done;
          c.done = target;
          if (dz !== 0) {
            combAll(c, dz);
            moved = true;
          }
          if (c.t < COMB_SECONDS) combs[w++] = c;
        }
        combs.length = w;

        for (let i = 0; i < drops.length; i++) {
          const d = drops[i];
          if (d.fade < 1) {
            d.fade -= step / FADE_SECONDS;
            moved = true;
          }
        }
      }

      if (moved) resample();
      const recolored = syncColors();
      // Between drops the bath is still; a running loop skips the redraw.
      if (moved || recolored || dt === 0) render();
    };
    drawRef.current = frame;

    measureRef.current = (m: Metrics) => {
      if (m.width <= 0 || m.height <= 0) return;
      width = m.width;
      height = m.height;
      dpr = m.dpr;
      canvas.width = m.bufferWidth;
      canvas.height = m.bufferHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      map();
      if (!warmed) warm();
      else resample();
      syncColors();
      // Painted here, not on the next frame: resizing the backing store clears
      // it, and a cleared buffer must never reach the screen.
      render();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    loop.resize();
    loop.start();

    return () => {
      drawRef.current = null;
      measureRef.current = null;
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      if (pointer.id !== -1 && canvas.hasPointerCapture(pointer.id)) {
        canvas.releasePointerCapture(pointer.id);
      }
      drops.length = 0;
      spare.length = 0;
      falls.length = 0;
      combs.length = 0;
    };
  }, [loop]);

  // Tuning while halted still repaints one frame.
  useEffect(() => {
    loop.paint();
  }, [
    dropInterval,
    dropSize,
    combStrength,
    tineSpacing,
    sharpness,
    stylus,
    inkColor1,
    inkColor2,
    inkColor3,
    paperColor,
    loop,
  ]);

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden ${className}`.trim()}
      style={{ backgroundColor: paperColor }}
    >
      {/* Out of flow, so the backing-store size never feeds back into the
          container's layout. touch-none only while the stylus is on: then a
          finger drag pulls ink instead of scrolling the page. */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={`absolute inset-0 block size-full${stylus ? " touch-none" : ""}`}
      />
    </div>
  );
}

/** Deterministic PRNG: the same seed always marbles the same sheet. */
const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const easeOutCubic = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);

const easeInOut = (t: number) => t * t * (3 - 2 * t);

const HEX = /^#?([\da-f]{3}|[\da-f]{6})$/i;

/** #rgb and #rrggbb to #rrggbb, or null for anything else. */
const normalizeHex = (value: string): string | null => {
  const m = HEX.exec(value.trim());
  if (!m) return null;
  const h = m[1].toLowerCase();
  return h.length === 3 ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : `#${h}`;
};

/** The drop map: every point is pushed straight away from the centre until
 *  a disc of area πΔ fits. Exact in increments. */
function fallOn(
  p: Float64Array,
  n: number,
  cx: number,
  cy: number,
  delta: number,
) {
  for (let i = 0, m = n * 2; i < m; i += 2) {
    const dx = p[i] - cx;
    const dy = p[i + 1] - cy;
    const q = dx * dx + dy * dy;
    if (q < 1e-12) continue;
    const f = Math.sqrt(1 + delta / q);
    p[i] = cx + dx * f;
    p[i + 1] = cy + dy * f;
  }
}

/** The tine map: slide along M by dz·2^(−d/c), d being the distance to the
 *  nearest tine. Motion is parallel to the tines, so d never changes. */
function combOn(p: Float64Array, n: number, comb: Comb, dz: number) {
  const bx = comb.bx;
  const by = comb.by;
  const nx = comb.nx;
  const ny = comb.ny;
  const mx = comb.mx;
  const my = comb.my;
  const spacing = comb.spacing;
  const per = 1 / spacing;
  const half = spacing / 2;
  const toTable = comb.inv * FALLOFF_STEPS;
  for (let i = 0, m = n * 2; i < m; i += 2) {
    let u = (p[i] - bx) * nx + (p[i + 1] - by) * ny;
    u -= Math.floor(u * per) * spacing;
    const x = (half - Math.abs(u - half)) * toTable;
    if (x >= FALLOFF_END) continue;
    const j = x | 0;
    const a = FALLOFF[j];
    const w = dz * (a + (FALLOFF[j + 1] - a) * (x - j));
    p[i] += w * mx;
    p[i + 1] += w * my;
  }
}

/** The stylus: a tine of finite length. Points slide along the stroke by its
 *  length times 2^(−d/c), d being the distance to the stroke segment. */
function pullOn(
  p: Float64Array,
  n: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  falloff: number,
) {
  const sx = bx - ax;
  const sy = by - ay;
  const len2 = sx * sx + sy * sy;
  if (!(len2 > 1e-18)) return;
  const len = Math.sqrt(len2);
  const mx = sx / len;
  const my = sy / len;
  const toTable = FALLOFF_STEPS / falloff;
  const reach = falloff * STYLUS_REACH;
  const loX = Math.min(ax, bx) - reach;
  const loY = Math.min(ay, by) - reach;
  const hiX = Math.max(ax, bx) + reach;
  const hiY = Math.max(ay, by) + reach;
  for (let i = 0, m = n * 2; i < m; i += 2) {
    const px = p[i];
    const py = p[i + 1];
    if (px < loX || px > hiX || py < loY || py > hiY) continue;
    const wx = px - ax;
    const wy = py - ay;
    let t = (wx * sx + wy * sy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = wx - t * sx;
    const ey = wy - t * sy;
    const d = Math.sqrt(ex * ex + ey * ey);
    if (d > reach) continue;
    const x = d * toTable;
    const j = x | 0;
    const a = FALLOFF[j];
    const w = len * (a + (FALLOFF[j + 1] - a) * (x - j));
    p[i] = px + w * mx;
    p[i + 1] = py + w * my;
  }
}

/**
 * Trace a polygon for filling with only the vertices the eye can see.
 *
 * The simulation needs dense vertices so later maps bend the outline in the
 * right places, but rasterising costs per edge, and on a gentle curve most of
 * those edges are invisible. A sleeve fit (Zhao and Saalfeld) walks out from
 * the last emitted point keeping the cone of directions that pass within
 * `tol` of every skipped vertex; the first vertex that falls outside the cone,
 * or comes back towards the anchor, closes the chord. The outline moves by at
 * most `tol` and the vertices themselves are untouched.
 */
function traceSimplified(
  ctx: CanvasRenderingContext2D,
  p: Float64Array,
  n: number,
  tol: number,
  reach2: number,
) {
  const tol2 = tol * tol;
  let ax = p[0];
  let ay = p[1];
  ctx.moveTo(ax, ay);
  let open = false;
  let lox = 0;
  let loy = 0;
  let hix = 0;
  let hiy = 0;
  let px = ax;
  let py = ay;
  let pd2 = 0;
  for (let i = 1; i < n; i++) {
    const vx = p[i * 2];
    const vy = p[i * 2 + 1];
    let dx = vx - ax;
    let dy = vy - ay;
    let d2 = dx * dx + dy * dy;
    if (
      open &&
      !(
        d2 >= pd2 &&
        d2 <= reach2 &&
        lox * dy - loy * dx >= 0 &&
        hix * dy - hiy * dx <= 0
      )
    ) {
      ctx.lineTo(px, py);
      ax = px;
      ay = py;
      open = false;
      dx = vx - ax;
      dy = vy - ay;
      d2 = dx * dx + dy * dy;
    }
    px = vx;
    py = vy;
    pd2 = d2;
    if (d2 <= tol2) continue;
    const len = Math.sqrt(d2);
    const s = tol / len;
    const c = Math.sqrt(1 - s * s);
    const ux = dx / len;
    const uy = dy / len;
    // This vertex allows chord directions within asin(tol/len) of its own.
    const nlx = ux * c + uy * s;
    const nly = uy * c - ux * s;
    const nhx = ux * c - uy * s;
    const nhy = uy * c + ux * s;
    if (!open) {
      lox = nlx;
      loy = nly;
      hix = nhx;
      hiy = nhy;
      open = true;
    } else {
      if (lox * nly - loy * nlx > 0) {
        lox = nlx;
        loy = nly;
      }
      if (hix * nhy - hiy * nhx < 0) {
        hix = nhx;
        hiy = nhy;
      }
    }
  }
  ctx.lineTo(px, py);
}

/** Even-odd point in polygon. */
function contains(p: Float64Array, n: number, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2];
    const yi = p[i * 2 + 1];
    const xj = p[j * 2];
    const yj = p[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
