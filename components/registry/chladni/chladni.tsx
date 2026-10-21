"use client";

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// Sand on a vibrating plate, settling onto the lines that stay still.
//
// The plate is the classic Chladni approximation for a free square plate, on
// coordinates normalized to the plate:
//
//   u(x, y) = cos(nπx)·cos(mπy) − s·cos(mπx)·cos(nπy),   s = ±1
//
// s flips on every change of note so both families of figures appear. m and n
// are never equal: with the minus sign the two terms would cancel, u would be
// zero everywhere and every grain would freeze where it landed.
//
// Each grain hops in a random direction by an amount that grows with |u| under
// it, so sand on the moving parts of the plate jumps about and sand on a still
// line barely moves. That alone draws the figure, but slowly, and it leaves a
// soft cloud wherever several lines cross: at a crossing u is flat to a high
// order, so a grain there is neither shaken nor held. A small pull toward the
// nearest still line fixes both. It is a damped Newton step on u (the move that
// would land the grain on the line if u were linear), so it closes the same
// share of the distance on a steep line and on a flat crossing, where a plain
// gradient pull fades to nothing.
//
// A note change crossfades the field, not the picture. The still lines slide
// from one figure to the next and the sand that was resting on them starts to
// shake and follows, so the dance between figures is the simulation itself.
//
// No grain is ever drawn on its own. Grains are counted into a grid of grain-
// sized cells, the counts go through a 16-step color ramp (one grain is faint,
// a pile runs hot), and the grid is scaled up onto the canvas. Only the cells
// lit last frame are cleared, so the cost follows the grain count, not the
// canvas size. The same grains are also counted into a much coarser grid,
// blurred, and laid on top in the sand's own hue: that is the glow.

export interface ChladniProps {
  /** How many grains of sand sit on the plate. */
  grains?: number;
  /** The highest note the plate plays, 2 to 10. Higher notes draw finer figures. */
  complexity?: number;
  /** Seconds each figure holds before the plate changes note. */
  dwell?: number;
  /** How hard the plate shakes the sand loose. */
  vibration?: number;
  /** How far the pointer scatters the sand, in px. 0 turns the bow off. */
  bowRadius?: number;
  /** The size of one grain, in px. */
  grainSize?: number;
  /** Draw faint lines where the sand is heading. */
  showNodes?: boolean;
  /** The sand. */
  grainColor?: string;
  /** The metal plate under the sand. */
  plateColor?: string;
  /** Stop the plate and keep the current frame on screen. */
  paused?: boolean;
  /** Show one settled figure and stop. The system setting turns this on too. */
  reducedMotion?: boolean;
  className?: string;
}

/** One figure: the two notes and which family it belongs to. */
interface Figure {
  m: number;
  n: number;
  s: number;
}

const MAX_GRAINS = 24000;
const MAX_NOTE = 10;

/** Samples per cosine table, across the whole plate. */
const TABLE = 2048;
const LAST = TABLE - 1;

/** Hop on a still line, and extra hop per unit of |u|. px per frame at 60 fps. */
const REST_HOP = 0.12;
const SHAKE_HOP = 2.4;
/**
 * Hop along a line, px per frame. Sand arrives on a new figure from wherever
 * the old lines carried it, so without this a line keeps the gaps it started
 * with. Sliding along the line evens it out, while the hop across the line
 * stays tiny and the line stays thin.
 */
const GLIDE_HOP = 1.5;
/** Share of the way to the nearest still line the pull closes each frame. */
const PULL = 0.08;
/** Fastest the pull may carry a grain, px per frame on a card-sized plate. */
const PULL_CAP = 0.6;
/** The plate size the hops are tuned for, as the square root of its area. */
const REFERENCE_SIZE = 280;

/** The pointer counts as bowing only while it keeps moving. */
const BOW_HOLD_MS = 140;
const BOW_KICK = 6;
const BOW_PUSH = 1.5;

/** The node overlay grid, along the plate's longer side. */
const NODE_CELLS = 96;

/** Glow grid cell on a card-sized plate, px. Grows a little on big plates. */
const GLOW_CELL = 4;
/** How strongly a fully lit glow cell tints the plate, 0 to 1. */
const GLOW = 0.55;
/** Grain counts the glow curve distinguishes; more saturates. */
const GLOW_STEPS = 64;

const TAU = Math.PI * 2;

const DIRECTIONS = 256;
const DIR_X = new Float32Array(DIRECTIONS);
const DIR_Y = new Float32Array(DIRECTIONS);
for (let i = 0; i < DIRECTIONS; i++) {
  DIR_X[i] = Math.cos((i / DIRECTIONS) * TAU);
  DIR_Y[i] = Math.sin((i / DIRECTIONS) * TAU);
}

// cos(fπt) and sin(fπt) for t across [0, 1], one pair of tables per note,
// shared by every plate on the page. The field is separable, so four lookups
// per figure replace eight trig calls per grain.
const COS: Float32Array[] = [];
const SIN: Float32Array[] = [];

function buildTables() {
  if (COS.length > 0) return;
  for (let f = 0; f <= MAX_NOTE; f++) {
    const c = new Float32Array(TABLE);
    const s = new Float32Array(TABLE);
    for (let i = 0; i < TABLE; i++) {
      const a = (f * Math.PI * i) / LAST;
      c[i] = Math.cos(a);
      s[i] = Math.sin(a);
    }
    COS.push(c);
    SIN.push(s);
  }
}

/** Deterministic PRNG, so the plate looks the same every time it mounts. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Every pair of notes 1 ≤ m < n ≤ highest, in a fixed shuffled order. Sorting
 * first makes the order independent of how the pairs were generated; the
 * shuffle keeps two neighbouring figures from looking alike.
 */
function notePairs(highest: number): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let n = 2; n <= highest; n++) {
    for (let m = 1; m < n; m++) pairs.push([m, n]);
  }
  pairs.sort((p, q) => p[0] * p[0] + p[1] * p[1] - (q[0] * q[0] + q[1] * q[1]) || p[0] - q[0]);
  const rand = mulberry32(7);
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const swap = pairs[i];
    pairs[i] = pairs[j];
    pairs[j] = swap;
  }
  return pairs;
}

function hexToRgb(hex: string, fallback: [number, number, number]): [number, number, number] {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return fallback;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

/** One RGBA pixel as the Uint32 view of an ImageData stores it. */
function packPixel(r: number, g: number, b: number, a: number) {
  return LITTLE_ENDIAN
    ? ((a << 24) | (b << 16) | (g << 8) | r) >>> 0
    : ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

function clampInt(value: number, lo: number, hi: number) {
  const v = Math.round(Number.isFinite(value) ? value : lo);
  return v < lo ? lo : v > hi ? hi : v;
}

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduce(onChange: () => void) {
  const query = window.matchMedia(REDUCE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readReduce() {
  return window.matchMedia(REDUCE_QUERY).matches;
}

function readReduceOnServer() {
  return false;
}

/**
 * Sand on a vibrating plate that gathers on the still lines and draws a
 * Chladni figure, then dances into the next one each time the note changes.
 * Fills its parent.
 */
export default function Chladni({
  grains = 9000,
  complexity = 6,
  dwell = 4.5,
  vibration = 1,
  bowRadius = 90,
  grainSize = 1.5,
  showNodes = false,
  grainColor = "#e9d5ff",
  plateColor = "#0b0812",
  paused = false,
  reducedMotion = false,
  className = "",
}: ChladniProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<((dt: number, now: number) => void | false) | null>(null);
  const measureRef = useRef<((m: Metrics) => void) | null>(null);

  const systemReduce = useSyncExternalStore(subscribeReduce, readReduce, readReduceOnServer);
  const still = reducedMotion || systemReduce;

  // The frame reads props from here, so tuning never rebuilds the plate.
  const live = useRef({
    grains,
    complexity,
    dwell,
    vibration,
    bowRadius,
    grainSize,
    showNodes,
    grainColor,
    plateColor,
    paused,
    still,
  });
  useLayoutEffect(() => {
    live.current = {
      grains,
      complexity,
      dwell,
      vibration,
      bowRadius,
      grainSize,
      showNodes,
      grainColor,
      plateColor,
      paused,
      still,
    };
  });

  const loop = useAnimationLoop({
    target: rootRef,
    halted: paused || still,
    dpr: "auto",
    resizeDebounceMs: 100,
    onResize: (m) => measureRef.current?.(m),
    onFrame: ({ dt, now }) => (drawRef.current ? drawRef.current(dt, now) : false),
  });

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { alpha: false });
    const sand = document.createElement("canvas");
    const sandCtx = sand.getContext("2d");
    const glow = document.createElement("canvas");
    const glowCtx = glow.getContext("2d");
    const nodes = document.createElement("canvas");
    const nodesCtx = nodes.getContext("2d");
    if (!root || !canvas || !ctx || !sandCtx || !glowCtx || !nodesCtx) return;

    buildTables();

    // ── Grains ─────────────────────────────────────────────────────────────
    const xs = new Float32Array(MAX_GRAINS);
    const ys = new Float32Array(MAX_GRAINS);
    let count = 0;
    const rand = mulberry32(1);
    let hopSeed = 0x2545f491;

    // ── Plate size and the density grid ────────────────────────────────────
    let width = 0;
    let height = 0;
    let collapsed = true;
    let bufferW = 0;
    let bufferH = 0;
    let cell = 1;
    let gridW = 0;
    let gridH = 0;
    let counts = new Uint16Array(0);
    let image: ImageData | null = null;
    let pixels = new Uint32Array(0);
    // Cells lit last frame. At most one per grain, so it never outgrows this.
    const lit = new Int32Array(MAX_GRAINS);
    let litCount = 0;
    // The glow: the same grains counted into a much coarser grid, softened,
    // and laid over the sharp layer. Coarse enough to cost almost nothing.
    let glowCell = GLOW_CELL;
    let glowW = 0;
    let glowH = 0;
    let glowCounts = new Uint16Array(0);
    let glowLevel = new Float32Array(0);
    let glowBlur = new Float32Array(0);
    let glowImage: ImageData | null = null;
    let glowPixels = new Uint32Array(0);
    // Glow per grain count, so the frame never calls Math.exp.
    const glowCurve = new Float32Array(GLOW_STEPS);
    let nodeW = 0;
    let nodeH = 0;
    let nodeImage: ImageData | null = null;
    let nodePixels = new Uint32Array(0);
    // Hop and pull lengths are tuned on a card-sized plate. A big plate gets
    // a faster pull, so a figure forms in about the same time at any size,
    // and slightly wider hops, so its lines keep some body.
    let plateScale = 1;
    let hopScale = 1;

    // ── Color ramp ─────────────────────────────────────────────────────────
    const ramp = new Uint32Array(16);
    let rampFor = "";
    let sandR = 0;
    let sandG = 0;
    let sandB = 0;
    // Light sand glows by brightening the plate, dark sand by shading it.
    let glowBlend: GlobalCompositeOperation = "screen";
    let glowTint = 0;

    // ── The note timeline ──────────────────────────────────────────────────
    let pairs: Array<[number, number]> = [];
    let builtFor = 0;
    let index = 0;
    let family = 1;
    let to: Figure = { m: 1, n: 2, s: 1 };
    let from: Figure = to;
    let mix = 1;
    let clock = 0;
    let fade = 0;
    let settledOn: Figure | null = null;
    let resettle = false;

    // ── The bow ────────────────────────────────────────────────────────────
    const pointer = { x: 0, y: 0, at: -Infinity, active: false };
    const bow = { x: 0, y: 0, strength: 0 };

    const paintRamp = () => {
      const cfg = live.current;
      const key = `${cfg.grainColor}|${cfg.plateColor}`;
      if (key === rampFor) return;
      rampFor = key;
      const grain = hexToRgb(cfg.grainColor, [233, 213, 255]);
      const plate = hexToRgb(cfg.plateColor, [11, 8, 18]);
      [sandR, sandG, sandB] = grain;
      // Dense cells run past the grain color, toward white on a dark plate and
      // toward black on a light one, so the lines glow instead of flattening.
      const luma = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      const hot = luma(grain) >= luma(plate) ? 255 : 0;
      glowBlend = hot === 255 ? "screen" : "multiply";
      // The halo takes the sand's own hue, half way to full saturation: pale
      // lavender sand glows violet, while white or grey sand glows neutral.
      const lo = Math.min(grain[0], grain[1], grain[2]);
      const hi = Math.max(grain[0], grain[1], grain[2]);
      const tint = hi - lo < 16 ? grain : grain.map((v) => Math.round((v + (hi * (v - lo)) / (hi - lo)) / 2));
      glowTint = packPixel(tint[0], tint[1], tint[2], 0);
      for (let c = 0; c < 16; c++) {
        const t = c === 0 ? 0 : 1 - Math.exp(-0.7 * c);
        const h = c <= 3 ? 0 : Math.pow((c - 3) / 12, 0.8) * 0.55;
        const rgb = [0, 1, 2].map((j) => {
          const v = plate[j] + (grain[j] - plate[j]) * t;
          return Math.round(v + (hot - v) * h);
        });
        ramp[c] = packPixel(rgb[0], rgb[1], rgb[2], 255);
      }
      pixels.fill(ramp[0]);
      litCount = 0;
    };

    const figureAt = (i: number): Figure => {
      const [m, n] = pairs[i];
      return { m, n, s: family };
    };

    // ── The field ──────────────────────────────────────────────────────────
    // u and its gradient in px at one point, for the slow paths (settling and
    // the node overlay). The grain loop inlines the same arithmetic.
    let probeX = 0;
    let probeY = 0;
    const probe = (x: number, y: number) => {
      const ix = ((x / width) * LAST + 0.5) | 0;
      const iy = ((y / height) * LAST + 0.5) | 0;
      let u = 0;
      let gx = 0;
      let gy = 0;
      for (let k = 0; k < 2; k++) {
        const f = k === 0 ? to : from;
        const w = k === 0 ? mix : 1 - mix;
        if (w <= 0) continue;
        const cn = COS[f.n];
        const cm = COS[f.m];
        const p = cn[ix];
        const q = cm[iy];
        const v = cm[ix];
        const r = cn[iy];
        u += w * (p * q - f.s * v * r);
        gx += w * (-f.n * Math.PI * SIN[f.n][ix] * q + f.s * f.m * Math.PI * SIN[f.m][ix] * r);
        gy += w * (-f.m * Math.PI * p * SIN[f.m][iy] + f.s * f.n * Math.PI * v * SIN[f.n][iy]);
      }
      probeX = gx / width;
      probeY = gy / height;
      return u;
    };

    /** The squared gradient a figure typically shows on its still lines, px⁻². */
    const typicalSlope = (f: Figure) =>
      Math.PI * Math.PI * (f.n * f.n + f.m * f.m) * 0.5 * (1 / (width * width) + 1 / (height * height));

    // Grains placed straight onto the still lines: the frame a still plate
    // shows, and where new sand lands while the plate is stopped. The nearest
    // of a few random tries, then Newton steps onto the line.
    const settle = (start: number, end: number) => {
      const xMax = width - 0.001;
      const yMax = height - 0.001;
      const floor = 1e-8 * typicalSlope(to);
      for (let i = start; i < end; i++) {
        let bx = rand() * width;
        let by = rand() * height;
        let best = Infinity;
        for (let t = 0; t < 40; t++) {
          const x = rand() * width;
          const y = rand() * height;
          const u = probe(x, y);
          // First-order distance to the line, px. Close enough is good
          // enough: the Newton steps below finish the job.
          const d = Math.abs(u) / Math.sqrt(probeX * probeX + probeY * probeY + floor);
          if (d < best) {
            best = d;
            bx = x;
            by = y;
            if (d < 12) break;
          }
        }
        for (let t = 0; t < 4; t++) {
          const u = probe(bx, by);
          const g2 = probeX * probeX + probeY * probeY + floor;
          let sx = (-u * probeX) / g2;
          let sy = (-u * probeY) / g2;
          const len = Math.sqrt(sx * sx + sy * sy);
          if (len > 8) {
            sx *= 8 / len;
            sy *= 8 / len;
          }
          bx = Math.min(xMax, Math.max(0, bx + sx));
          by = Math.min(yMax, Math.max(0, by + sy));
        }
        // A little scatter, the width settled sand has on a running plate.
        const a = rand() * TAU;
        const spread = rand() * 0.6 * hopScale;
        xs[i] = Math.min(xMax, Math.max(0, bx + Math.cos(a) * spread));
        ys[i] = Math.min(yMax, Math.max(0, by + Math.sin(a) * spread));
      }
    };

    // New sand on a running plate is sprinkled evenly and finds the lines.
    const sprinkle = (start: number, end: number) => {
      for (let i = start; i < end; i++) {
        xs[i] = rand() * (width - 0.001);
        ys[i] = rand() * (height - 0.001);
      }
    };

    const tune = (highest: number, halted: boolean) => {
      const first = pairs.length === 0;
      pairs = notePairs(highest);
      builtFor = highest;
      clock = 0;
      if (first) {
        index = 0;
        to = figureAt(0);
        from = to;
        mix = 1;
        return;
      }
      // Show the change at once: jump to the first figure that reaches the
      // new top note, instead of waiting out the current dwell.
      index = Math.max(0, pairs.findIndex((p) => p[1] === highest));
      family = -family;
      const next = figureAt(index);
      if (halted) {
        to = next;
        from = next;
        mix = 1;
        resettle = true;
      } else {
        from = mix >= 0.5 ? to : from;
        to = next;
        fade = 0;
        mix = 0;
      }
    };

    const advance = (dt: number) => {
      const cfg = live.current;
      const hold = Math.max(0.25, cfg.dwell);
      clock += dt;
      fade += dt;
      if (clock >= hold && pairs.length > 0) {
        clock = 0;
        from = mix >= 0.5 ? to : from;
        index = (index + 1) % pairs.length;
        family = -family;
        to = figureAt(index);
        fade = 0;
      }
      if (from === to) {
        mix = 1;
        return;
      }
      const span = Math.min(2, Math.max(0.8, 0.35 * hold));
      const t = Math.min(1, fade / span);
      mix = t * t * (3 - 2 * t);
      if (mix >= 1) from = to;
    };

    const steerBow = (dt: number, now: number) => {
      const cfg = live.current;
      let target = 0;
      if (cfg.bowRadius > 0 && pointer.active && now - pointer.at < BOW_HOLD_MS) {
        const rect = root.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const fx = (pointer.x - rect.left) / rect.width;
          const fy = (pointer.y - rect.top) / rect.height;
          if (fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1) {
            target = 1;
            bow.x = fx * width;
            bow.y = fy * height;
          }
        }
      }
      // Quick to bite, slow to let go: the sand keeps jumping for a moment
      // after the bow lifts, the way a plate rings on.
      const rate = target > bow.strength ? 10 : 3;
      bow.strength += (target - bow.strength) * (1 - Math.exp(-rate * dt));
    };

    // ── One step of the plate ──────────────────────────────────────────────
    const simulate = (dt: number) => {
      const cfg = live.current;
      const k = dt * 60;
      // Random hops scale with √k and drift with k, so the sand behaves the
      // same at 30, 60 or 120 fps.
      const hop = Math.max(0, cfg.vibration) * Math.sqrt(k) * hopScale;
      const glide = GLIDE_HOP * hop;
      const pull = Math.min(1, PULL * k);
      const cap = PULL_CAP * plateScale * k;
      const capSq = cap * cap;

      const a = to;
      const b = from;
      const blend = a !== b && mix < 1;
      const wa = blend ? mix : 1;
      const wb = 1 - wa;
      const aCn = COS[a.n];
      const aSn = SIN[a.n];
      const aCm = COS[a.m];
      const aSm = SIN[a.m];
      const aN = a.n * Math.PI;
      const aM = a.m * Math.PI;
      const aS = a.s;
      const bCn = COS[b.n];
      const bSn = SIN[b.n];
      const bCm = COS[b.m];
      const bSm = SIN[b.m];
      const bN = b.n * Math.PI;
      const bM = b.m * Math.PI;
      const bS = b.s;
      const tx = LAST / width;
      const ty = LAST / height;
      const iw = 1 / width;
      const ih = 1 / height;
      // Keeps a grain parked exactly on a crossing from dividing by zero.
      const floor = 1e-8 * (wa * typicalSlope(a) + wb * typicalSlope(b));

      const reach = Math.max(0, cfg.bowRadius);
      const power = bow.strength;
      const bowing = reach > 0 && power > 0.01;
      const reachSq = reach * reach;
      const kick = power * BOW_KICK * Math.sqrt(k);
      const push = power * BOW_PUSH * k;
      const bx = bow.x;
      const by = bow.y;

      const xMax = width - 0.001;
      const yMax = height - 0.001;
      let r = hopSeed;

      for (let i = 0; i < count; i++) {
        let x = xs[i];
        let y = ys[i];
        const ix = (x * tx + 0.5) | 0;
        const iy = (y * ty + 0.5) | 0;

        let p = aCn[ix];
        let q = aCm[iy];
        let v = aCm[ix];
        let w = aCn[iy];
        let u = p * q - aS * v * w;
        let gx = -aN * aSn[ix] * q + aS * aM * aSm[ix] * w;
        let gy = -aM * p * aSm[iy] + aS * aN * v * aSn[iy];
        if (blend) {
          p = bCn[ix];
          q = bCm[iy];
          v = bCm[ix];
          w = bCn[iy];
          u = wa * u + wb * (p * q - bS * v * w);
          gx = wa * gx + wb * (-bN * bSn[ix] * q + bS * bM * bSm[ix] * w);
          gy = wa * gy + wb * (-bM * p * bSm[iy] + bS * bN * v * bSn[iy]);
        }
        gx *= iw;
        gy *= ih;

        // The pull: a damped Newton step toward u = 0, capped.
        const inv = 1 / (gx * gx + gy * gy + floor);
        let px = -pull * u * gx * inv;
        let py = -pull * u * gy * inv;
        const pullSq = px * px + py * py;
        if (pullSq > capSq) {
          const c = cap / Math.sqrt(pullSq);
          px *= c;
          py *= c;
        }

        // The hop: tiny on a still line, big where the plate swings.
        let step = (REST_HOP + SHAKE_HOP * (u < 0 ? -u : u)) * hop;
        if (bowing) {
          const dx = x - bx;
          const dy = y - by;
          const d2 = dx * dx + dy * dy;
          if (d2 < reachSq) {
            const d = Math.sqrt(d2) + 1e-3;
            const f = 1 - d / reach;
            const ff = f * f;
            // Under the bow the plate is driven, not resting, so it lets go of
            // the sand: the pull fades out and the kick takes over.
            const hold = 1 - power * ff;
            step += kick * ff;
            px = px * hold + (dx / d) * push * ff;
            py = py * hold + (dy / d) * push * ff;
          }
        }

        r ^= r << 13;
        r ^= r >>> 17;
        r ^= r << 5;
        const dir = r >>> 24;
        const hx = DIR_X[dir];
        const hy = DIR_Y[dir];
        // The same random direction, stretched along the line: `step` across
        // it, `along` down it. Splitting on the gradient reuses the pull's
        // 1/|∇u|², so no square root.
        const along = glide > step ? glide : step;
        const across = (step - along) * (hx * gx + hy * gy) * inv;
        x += px + along * hx + across * gx;
        y += py + along * hy + across * gy;

        // The plate's rim reflects.
        if (x < 0) x = -x;
        else if (x > xMax) x = 2 * xMax - x;
        if (y < 0) y = -y;
        else if (y > yMax) y = 2 * yMax - y;
        xs[i] = x < 0 ? 0 : x > xMax ? xMax : x;
        ys[i] = y < 0 ? 0 : y > yMax ? yMax : y;
      }
      hopSeed = r;
    };

    // ── Drawing ────────────────────────────────────────────────────────────
    const drawNodes = () => {
      if (!nodeImage) return;
      const span = width / nodeW;
      const floor = 1e-8 * typicalSlope(to);
      for (let j = 0; j < nodeH; j++) {
        const y = ((j + 0.5) / nodeH) * height;
        for (let i = 0; i < nodeW; i++) {
          const u = probe(((i + 0.5) / nodeW) * width, y);
          // Distance to the nearest still line, in overlay cells. Measured as
          // a distance rather than as |u| so every line gets the same soft
          // width, whether the plate is steep or flat around it.
          const d = Math.abs(u) / Math.sqrt(probeX * probeX + probeY * probeY + floor) / span;
          const alpha = Math.round(46 * Math.exp(-d * d));
          nodePixels[j * nodeW + i] = packPixel(sandR, sandG, sandB, alpha);
        }
      }
      nodesCtx.putImageData(nodeImage, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(nodes, 0, 0, width, height);
    };

    const render = () => {
      if (!image || !glowImage) return;
      for (let j = 0; j < litCount; j++) pixels[lit[j]] = ramp[0];
      litCount = 0;
      const inv = 1 / cell;
      const glowInv = 1 / glowCell;
      for (let i = 0; i < count; i++) {
        const x = xs[i];
        const y = ys[i];
        const idx = ((y * inv) | 0) * gridW + ((x * inv) | 0);
        if (counts[idx]++ === 0) lit[litCount++] = idx;
        glowCounts[((y * glowInv) | 0) * glowW + ((x * glowInv) | 0)]++;
      }
      for (let j = 0; j < litCount; j++) {
        const idx = lit[j];
        const c = counts[idx];
        pixels[idx] = ramp[c > 15 ? 15 : c];
        counts[idx] = 0;
      }

      // Glow level per cell, then a [1 2 1] blur across and down, so the
      // halo falls off softly instead of showing its cells.
      const cells = glowW * glowH;
      for (let c = 0; c < cells; c++) {
        const n = glowCounts[c];
        glowLevel[c] = glowCurve[n < GLOW_STEPS ? n : GLOW_STEPS - 1];
        glowCounts[c] = 0;
      }
      for (let y = 0; y < glowH; y++) {
        const row = y * glowW;
        for (let x = 0; x < glowW; x++) {
          const left = glowLevel[row + (x > 0 ? x - 1 : x)];
          const right = glowLevel[row + (x < glowW - 1 ? x + 1 : x)];
          glowBlur[row + x] = (left + 2 * glowLevel[row + x] + right) * 0.25;
        }
      }
      const shift = LITTLE_ENDIAN ? 24 : 0;
      const strength = 255 * GLOW;
      for (let y = 0; y < glowH; y++) {
        const row = y * glowW;
        const up = (y > 0 ? y - 1 : y) * glowW;
        const down = (y < glowH - 1 ? y + 1 : y) * glowW;
        for (let x = 0; x < glowW; x++) {
          const v = (glowBlur[up + x] + 2 * glowBlur[row + x] + glowBlur[down + x]) * 0.25;
          glowPixels[row + x] = glowTint | (((v * strength) | 0) << shift);
        }
      }

      sandCtx.putImageData(image, 0, 0);
      glowCtx.putImageData(glowImage, 0, 0);
      ctx.imageSmoothingEnabled = cell > 1;
      ctx.drawImage(sand, 0, 0, gridW * cell, gridH * cell);
      ctx.globalCompositeOperation = glowBlend;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(glow, 0, 0, glowW * glowCell, glowH * glowCell);
      ctx.globalCompositeOperation = "source-over";
      if (live.current.showNodes) drawNodes();
    };

    // ── Size ───────────────────────────────────────────────────────────────
    // Every buffer is sized here and nowhere else; the frame only fills them.
    measureRef.current = ({ width: w, height: h, dpr, bufferWidth, bufferHeight }) => {
      // Keep the last real size through a collapse, so the sand can be
      // stretched from it when the plate comes back.
      collapsed = w < 1 || h < 1;
      if (collapsed) return;
      if (bufferWidth !== bufferW || bufferHeight !== bufferH) {
        canvas.width = bufferWidth;
        canvas.height = bufferHeight;
        bufferW = bufferWidth;
        bufferH = bufferHeight;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Stretch the sand with the plate. The field lives on the plate's own
      // coordinates, so the figure stays where it was.
      if (width > 0 && (w !== width || h !== height)) {
        const sx = (w - 0.001) / width;
        const sy = (h - 0.001) / height;
        for (let i = 0; i < count; i++) {
          xs[i] *= sx;
          ys[i] *= sy;
        }
      }
      width = w;
      height = h;
      plateScale = Math.min(4, Math.max(1, Math.sqrt(w * h) / REFERENCE_SIZE));
      hopScale = Math.sqrt(plateScale);

      const size = Math.min(8, Math.max(0.5, live.current.grainSize));
      const gw = Math.max(1, Math.ceil(w / size));
      const gh = Math.max(1, Math.ceil(h / size));
      cell = size;
      if (gw !== gridW || gh !== gridH || !image) {
        gridW = gw;
        gridH = gh;
        sand.width = gw;
        sand.height = gh;
        counts = new Uint16Array(gw * gh);
        image = new ImageData(gw, gh);
        pixels = new Uint32Array(image.data.buffer);
        pixels.fill(ramp[0]);
        litCount = 0;
      }

      const gc = Math.max(2, Math.round(GLOW_CELL * hopScale));
      const glw = Math.max(1, Math.ceil(w / gc));
      const glh = Math.max(1, Math.ceil(h / gc));
      if (gc !== glowCell || glw !== glowW || glh !== glowH || !glowImage) {
        glowCell = gc;
        glowW = glw;
        glowH = glh;
        glow.width = glw;
        glow.height = glh;
        glowCounts = new Uint16Array(glw * glh);
        glowLevel = new Float32Array(glw * glh);
        glowBlur = new Float32Array(glw * glh);
        glowImage = new ImageData(glw, glh);
        glowPixels = new Uint32Array(glowImage.data.buffer);
        // A line carrying about one grain per 1.5 px lights its cells fully,
        // whatever size the cells are.
        const full = gc / 1.5;
        for (let c = 0; c < GLOW_STEPS; c++) glowCurve[c] = 1 - Math.exp(-c / full);
      }

      const nw = w >= h ? NODE_CELLS : Math.max(8, Math.round((NODE_CELLS * w) / h));
      const nh = w >= h ? Math.max(8, Math.round((NODE_CELLS * h) / w)) : NODE_CELLS;
      if (nw !== nodeW || nh !== nodeH || !nodeImage) {
        nodeW = nw;
        nodeH = nh;
        nodes.width = nw;
        nodes.height = nh;
        nodeImage = new ImageData(nw, nh);
        nodePixels = new Uint32Array(nodeImage.data.buffer);
      }
    };

    // ── The frame ──────────────────────────────────────────────────────────
    drawRef.current = (dt, now) => {
      // A collapsed container has nothing to draw into. Halt; the next resize
      // starts the loop again.
      if (collapsed || !image) return false;
      const cfg = live.current;
      const halted = cfg.paused || cfg.still;

      paintRamp();

      const highest = clampInt(cfg.complexity, 2, MAX_NOTE);
      if (highest !== builtFor) tune(highest, halted);

      // A still plate shows one whole figure, never the middle of a change.
      if (cfg.still && settledOn !== to) {
        from = to;
        mix = 1;
        resettle = true;
      }

      const want = clampInt(cfg.grains, 0, MAX_GRAINS);
      if (resettle) {
        count = want;
        settle(0, count);
        settledOn = to;
        resettle = false;
      } else if (want > count) {
        if (halted) settle(count, want);
        else sprinkle(count, want);
        count = want;
      } else {
        count = want;
      }

      if (dt > 0 && !cfg.still) {
        advance(dt);
        steerBow(dt, now);
        simulate(dt);
        settledOn = null;
      }

      render();
    };

    // The bow is tracked on the window, so it still works when content is laid
    // over the plate. The containment test happens in the frame, against the
    // plate's live rect.
    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.at = performance.now();
      pointer.active = true;
    };
    const onEnd = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") pointer.active = false;
    };
    const onLeave = () => {
      pointer.active = false;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    window.addEventListener("pointerup", onEnd, { passive: true });
    window.addEventListener("pointercancel", onEnd, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);

    loop.resize();
    loop.start();

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      drawRef.current = null;
      measureRef.current = null;
      sand.width = 0;
      glow.width = 0;
      nodes.width = 0;
    };
  }, [loop]);

  // Tuning while stopped still repaints one frame.
  useEffect(() => {
    loop.paint();
  }, [grains, complexity, dwell, vibration, bowRadius, showNodes, grainColor, plateColor, still, loop]);

  // A new grain size needs a new density grid, which only a resize builds.
  useEffect(() => {
    loop.resize();
  }, [grainSize, loop]);

  return (
    <div
      ref={rootRef}
      // touch-none while the bow is on: a finger dragging across the plate
      // bows the sand instead of scrolling the page.
      className={`relative h-full w-full overflow-hidden ${bowRadius > 0 ? "touch-none " : ""}${className}`.trim()}
      style={{ backgroundColor: plateColor }}
    >
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 block size-full" />
    </div>
  );
}
