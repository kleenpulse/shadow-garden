"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";
import {
  generate,
  Search,
  type Maze,
  type PathfinderAlgorithm,
  type PathfinderMaze,
} from "./pathfinder-engine";

export type { PathfinderAlgorithm, PathfinderMaze } from "./pathfinder-engine";

// A pathfinding bench. Left alone it runs a loop: build a maze, let a search
// spread through it, trace the route it found, hold, fade, build the next one.
// Touch it and the loop steps aside: every wall you draw re-solves the board on
// the spot, and nothing automatic will ever paint over your walls again until
// you ask for a new maze or flip `autoplay`.
//
// Three decisions carry it.
//
// **The search is data, the picture is derived.** The engine keeps per-cell
// state and the expansion count each cell closed at. The renderer turns that
// count into age, so the bright wavefront is not a particle effect: it is the
// last few hundred cells the search touched, and it cools on its own after the
// search ends. A paused frame or a resize can redraw any moment exactly.
//
// **Edits re-solve instantly; Run animates.** A solve on a few thousand cells
// costs well under a millisecond, so a drag can afford one per pointer move and
// the route follows your hand. Watching a search is a separate, explicit act.
//
// **Integer geometry.** Cell size is a whole number of pixels and the grid is
// placed on whole pixels, and walls are filled as merged runs in one path, so
// neighbouring blocks never show hairline seams.

export interface PathfinderProps {
  /** Which search runs. */
  algorithm?: PathfinderAlgorithm;
  /** How new walls are laid out. */
  maze?: PathfinderMaze;
  /** Allow diagonal steps. A diagonal never cuts across a wall's corner. */
  diagonal?: boolean;
  /** How fast the search spreads. */
  speed?: number;
  /** Size of one grid cell, in px. */
  cellSize?: number;
  /** Build, solve and start over while nobody is editing. */
  autoplay?: boolean;
  /** Cells the search has explored. */
  searchColor?: string;
  /** The path it found. */
  pathColor?: string;
  /** The grid. Walls are drawn a shade off it. */
  boardColor?: string;
  paused?: boolean;
  reducedMotion?: boolean;
  className?: string;
}

type Phase = "carve" | "search" | "trace" | "hold" | "fade" | "idle";
type Action = "new" | "run" | "clear";
type Rgb = [number, number, number];

interface Drag {
  id: number;
  kind: "start" | "goal" | "wall";
  value: number;
  last: number;
}

const CARVE_MIN = 1;
const CARVE_MAX = 1.4;
const TRACE = 0.45;
const HOLD = 1.6;
const FADE = 0.35;

/** Below this height the readout and toolbar would eat the board, so they go. */
const CHROME_MIN_HEIGHT = 280;
const CHROME_MIN_WIDTH = 260;
/** Margin around the grid, and the bands kept clear for the readout and toolbar. */
const PAD = 8;
const BAND_TOP = 40;
const BAND_BOTTOM = 46;

const LABELS: Record<PathfinderAlgorithm, string> = {
  astar: "A*",
  dijkstra: "Dijkstra",
  bfs: "BFS",
  greedy: "Greedy",
};

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
const readReduced = () => window.matchMedia(REDUCED_QUERY).matches;
const readReducedOnServer = () => false;

export default function Pathfinder({
  algorithm = "astar",
  maze = "backtracker",
  diagonal = false,
  speed = 1,
  cellSize = 18,
  autoplay = true,
  searchColor = "#a855f7",
  pathColor = "#f0abfc",
  boardColor = "#0d0b12",
  paused = false,
  reducedMotion = false,
  className = "",
}: PathfinderProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const exploredRef = useRef<HTMLSpanElement>(null);
  const stepsRef = useRef<HTMLSpanElement>(null);
  const announceRef = useRef<HTMLParagraphElement>(null);
  const drawRef = useRef<((dt: number) => void | false) | null>(null);
  const measureRef = useRef<((m: Metrics) => void) | null>(null);
  const actRef = useRef<((action: Action) => void) | null>(null);
  const [chrome, setChrome] = useState(false);

  const osReduced = useSyncExternalStore(subscribeReduced, readReduced, readReducedOnServer);
  const reduce = reducedMotion || osReduced;

  const live = useRef({
    algorithm,
    maze,
    diagonal,
    speed,
    cellSize,
    autoplay,
    searchColor,
    pathColor,
    boardColor,
    paused,
    reduce,
  });
  useLayoutEffect(() => {
    live.current = {
      algorithm,
      maze,
      diagonal,
      speed,
      cellSize,
      autoplay,
      searchColor,
      pathColor,
      boardColor,
      paused,
      reduce,
    };
  });

  const loop = useAnimationLoop({
    target: wrapRef,
    halted: paused || reduce,
    dpr: "auto",
    resizeDebounceMs: 120,
    onResize: (m) => measureRef.current?.(m),
    onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
  });

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ── Layout ────────────────────────────────────────────────────────────
    let width = 0;
    let height = 0;
    let dpr = 1;
    let cols = 0;
    let rows = 0;
    let cs = 0;
    let ox = 0;
    let oy = 0;
    let ready = false;
    let gridLines = new Path2D();

    // ── Board ─────────────────────────────────────────────────────────────
    let walls: Uint8Array = new Uint8Array(0);
    let shown: Uint8Array = new Uint8Array(0);
    let build: Maze | null = null;
    let next: Maze | null = null;
    let revealed = 0;
    let start = 0;
    let goal = 0;
    let turn = -1;
    let edited = false;

    // ── Search ────────────────────────────────────────────────────────────
    let search: Search | null = null;
    let budget = 0;
    // Expansions on a virtual clock that keeps running after the search ends,
    // so the bright front cools off instead of freezing hot.
    let clock = 0;
    let path: Int32Array = new Int32Array(0);
    let pathLength = 0;
    let progress = 0;

    // ── Phase ─────────────────────────────────────────────────────────────
    let phase: Phase = "idle";
    let t = 0;
    let carveFor = CARVE_MIN;
    let announceRun = false;

    // ── Input ─────────────────────────────────────────────────────────────
    let cursor = 0;
    let focused = false;
    let keyboard = false;
    let drag: Drag | null = null;
    let pointerLook = "";

    const initial = live.current;
    const applied = {
      algorithm: initial.algorithm,
      diagonal: initial.diagonal,
      maze: initial.maze,
      autoplay: initial.autoplay,
      reduce: initial.reduce,
    };

    const cycling = () => {
      const l = live.current;
      return l.autoplay && !edited && !l.reduce;
    };
    const still = () => live.current.paused || live.current.reduce;
    const rate = () => Math.max(0.05, live.current.speed) * Math.max(60, (cols * rows) / 3.2);

    // ── Colour ────────────────────────────────────────────────────────────
    const pal = {
      key: "",
      board: "",
      wall: "",
      lip: "",
      grid: "",
      age: ["", "", ""],
      glow: ["", "", ""],
      front: "",
      path: "",
      core: "",
      ink: "",
      halo: "",
    };
    const palette = () => {
      const l = live.current;
      const key = `${l.boardColor}|${l.searchColor}|${l.pathColor}`;
      if (key === pal.key) return pal;
      const board = toRgb(ctx, l.boardColor, [13, 11, 18]);
      const seek = toRgb(ctx, l.searchColor, [168, 85, 247]);
      const route = toRgb(ctx, l.pathColor, [240, 171, 252]);
      const dark = luminance(board) < 0.5;
      pal.key = key;
      pal.board = rgba(board, 1);
      // "A shade lighter" on a dark board; on a light one, a shade darker, or
      // the walls would vanish into it.
      pal.wall = rgba(mix(board, dark ? [255, 255, 255] : [0, 0, 0], dark ? 0.1 : 0.13), 1);
      pal.lip = dark
        ? rgba(mix(board, [255, 255, 255], 0.2), 1)
        : rgba(mix(board, [255, 255, 255], 0.55), 1);
      pal.grid = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";
      pal.age = [rgba(seek, 0.66), rgba(seek, 0.42), rgba(seek, 0.25)];
      // The build sparks in near-white, not in the search colour, so the three
      // acts read apart: light for the build, search colour for the search,
      // path colour for the route. A hint of the search colour keeps the
      // faint tail of the spark from landing on the neutral grey of a wall.
      const spark = dark
        ? mix([255, 255, 255], seek, 0.28)
        : mix(mix(board, [0, 0, 0], 0.7), seek, 0.28);
      pal.glow = [rgba(spark, 0.55), rgba(spark, 0.32), rgba(spark, 0.17)];
      pal.front = dark
        ? rgba(mix(seek, [255, 255, 255], 0.5), 0.92)
        : rgba(mix(seek, [0, 0, 0], 0.25), 0.92);
      pal.path = rgba(route, 1);
      pal.core = rgba(mix(route, [255, 255, 255], 0.65), 0.95);
      pal.ink = dark ? "rgba(255,255,255,0.96)" : "rgba(18,16,24,0.92)";
      pal.halo = rgba(board, 0.72);
      return pal;
    };

    // ── Geometry helpers ──────────────────────────────────────────────────
    const cx = (cell: number) => ox + ((cell % cols) + 0.5) * cs;
    const cy = (cell: number) => oy + (Math.floor(cell / cols) + 0.5) * cs;
    const lengthOf = (route: Int32Array) => {
      let total = 0;
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1];
        const b = route[i];
        total += a % cols !== b % cols && Math.floor(a / cols) !== Math.floor(b / cols) ? Math.SQRT2 : 1;
      }
      return total;
    };

    // ── State transitions ─────────────────────────────────────────────────
    const fresh = (): Maze => {
      turn++;
      const seed = (Math.imul(turn + 1, 0x9e3779b1) ^ 0x5eed) >>> 0;
      return generate(cols, rows, live.current.maze, seed, turn);
    };

    const adopt = (m: Maze) => {
      build = m;
      walls = m.walls.slice();
      start = m.start;
      goal = m.goal;
      search = null;
      path = new Int32Array(0);
      pathLength = 0;
      progress = 0;
    };

    const say = (message: string) => {
      const el = announceRef.current;
      if (!el) return;
      // A repeat of the same sentence is still news; nudge it so it is read.
      el.textContent = el.textContent === message ? message + String.fromCharCode(160) : message;
    };

    const finishSearch = () => {
      const s = search;
      path = s && s.found ? s.path() : new Int32Array(0);
      pathLength = lengthOf(path);
      if (announceRun && s) {
        announceRun = false;
        say(
          s.found
            ? `Path found: ${path.length - 1} steps, ${s.visited} cells explored.`
            : `No path found. ${s.visited} cells explored.`,
        );
      }
    };

    const solveNow = () => {
      const l = live.current;
      search = new Search(walls, cols, rows, start, goal, l.algorithm, l.diagonal).solve();
      budget = 0;
      clock = Infinity;
      finishSearch();
      progress = search.found ? 1 : 0;
    };

    const startSearch = () => {
      const l = live.current;
      search = new Search(walls, cols, rows, start, goal, l.algorithm, l.diagonal);
      budget = 0;
      clock = 0;
      path = new Int32Array(0);
      pathLength = 0;
      progress = 0;
      phase = "search";
      t = 0;
    };

    const beginCarve = (m: Maze) => {
      adopt(m);
      shown = new Uint8Array(cols * rows).fill(m.solid ? 1 : 0);
      revealed = 0;
      carveFor = CARVE_MIN + (CARVE_MAX - CARVE_MIN) * Math.min(1, m.order.length / 1200);
      phase = "carve";
      t = 0;
    };

    /** A finished, solved board with no build and no search to watch. */
    const settle = (m: Maze) => {
      next = null;
      adopt(m);
      solveNow();
      phase = cycling() ? "hold" : "idle";
      t = 0;
    };

    const beginFade = () => {
      next = fresh();
      // Asked again mid-fade: swap the maze waiting behind it, keep fading.
      if (phase === "fade") return;
      phase = "fade";
      t = 0;
    };

    /** Stop any build or fade in its tracks, keeping the board on screen. */
    const completeBuild = () => {
      if (phase === "carve" && build) revealed = build.order.length;
      next = null;
    };

    const beginEdit = () => {
      completeBuild();
      edited = true;
      announceRun = false;
      phase = "idle";
      t = 0;
    };

    const newMaze = () => {
      edited = false;
      announceRun = false;
      if (still()) settle(fresh());
      else beginFade();
    };

    const run = () => {
      completeBuild();
      announceRun = true;
      if (still()) {
        solveNow();
        phase = cycling() ? "hold" : "idle";
        t = 0;
      } else {
        startSearch();
      }
    };

    const clear = () => {
      beginEdit();
      walls.fill(0);
      solveNow();
    };

    const restart = () => {
      next = null;
      shown = new Uint8Array(cols * rows);
      cursor = (rows >> 1) * cols + (cols >> 1);
      const m = fresh();
      if (still() || !live.current.autoplay) settle(m);
      else beginCarve(m);
    };

    /** Carry hand-drawn walls across a grid change, anchored at the centre. */
    const refit = (pc: number, pr: number, pw: Uint8Array, ps: number, pg: number, pcur: number) => {
      const n = cols * rows;
      const nw = new Uint8Array(n);
      const dx = Math.floor((cols - pc) / 2);
      const dy = Math.floor((rows - pr) / 2);
      for (let y = 0; y < rows; y++) {
        const sy = y - dy;
        if (sy < 0 || sy >= pr) continue;
        for (let x = 0; x < cols; x++) {
          const sx = x - dx;
          if (sx >= 0 && sx < pc) nw[y * cols + x] = pw[sy * pc + sx];
        }
      }
      const carry = (cell: number) => {
        const x = Math.min(cols - 1, Math.max(0, (cell % pc) + dx));
        const y = Math.min(rows - 1, Math.max(0, Math.floor(cell / pc) + dy));
        return y * cols + x;
      };
      walls = nw;
      start = carry(ps);
      goal = carry(pg);
      if (goal === start) goal = start + 1 < n ? start + 1 : start - 1;
      walls[start] = 0;
      walls[goal] = 0;
      cursor = carry(pcur);
      build = null;
      next = null;
      shown = new Uint8Array(n);
      solveNow();
      phase = "idle";
      t = 0;
    };

    // Props are applied here, in the frame, rather than in effects: the sim
    // owns its own state, and a paused loop still gets exactly one frame to
    // react when something changes.
    const syncProps = () => {
      const l = live.current;
      if (l.reduce !== applied.reduce) {
        applied.reduce = l.reduce;
        if (l.reduce) {
          if (phase !== "idle") {
            completeBuild();
            if (!search || !search.done) solveNow();
            else {
              clock = Infinity;
              progress = search.found ? 1 : 0;
            }
            phase = "idle";
            t = 0;
          }
        } else if (cycling() && phase === "idle") {
          phase = "hold";
          t = HOLD;
        }
      }
      if (l.autoplay !== applied.autoplay) {
        applied.autoplay = l.autoplay;
        edited = false;
        if (l.autoplay && !l.reduce && phase === "idle") {
          phase = "hold";
          t = HOLD;
        }
      }
      if (l.maze !== applied.maze) {
        applied.maze = l.maze;
        if (!edited) newMaze();
      }
      if (l.algorithm !== applied.algorithm || l.diagonal !== applied.diagonal) {
        applied.algorithm = l.algorithm;
        applied.diagonal = l.diagonal;
        if (phase === "carve" || phase === "fade") {
          // The search that follows the build picks the new settings up.
        } else if (phase === "idle" || still()) {
          solveNow();
          if (phase !== "idle") {
            phase = cycling() ? "hold" : "idle";
            t = 0;
          }
        } else {
          startSearch();
        }
      }
    };

    const advance = (dt: number) => {
      switch (phase) {
        case "carve": {
          t += dt;
          if (!build) {
            phase = "idle";
            break;
          }
          const total = build.order.length;
          const k = t >= carveFor ? total : Math.floor((total * t) / carveFor);
          while (revealed < k) {
            const cell = build.order[revealed++];
            shown[cell] = build.walls[cell];
          }
          if (t >= carveFor) startSearch();
          break;
        }
        case "search": {
          const s = search;
          if (!s) {
            phase = "idle";
            break;
          }
          const r = rate();
          budget += r * dt;
          clock += r * dt;
          const n = Math.floor(budget);
          if (n > 0) {
            s.step(n);
            budget -= n;
          }
          if (s.done) {
            finishSearch();
            phase = s.found ? "trace" : "hold";
            t = 0;
          }
          break;
        }
        case "trace": {
          t += dt;
          clock += rate() * dt;
          const k = Math.min(1, t / TRACE);
          progress = 1 - (1 - k) * (1 - k) * (1 - k);
          if (t >= TRACE) {
            progress = 1;
            phase = "hold";
            t = 0;
          }
          break;
        }
        case "hold": {
          t += dt;
          clock += rate() * dt;
          if (t >= HOLD) {
            if (cycling()) beginFade();
            else {
              clock = Infinity;
              phase = "idle";
              t = 0;
            }
          }
          break;
        }
        case "fade": {
          t += dt;
          if (t >= FADE) {
            const m = next;
            next = null;
            if (m) beginCarve(m);
            else phase = "idle";
          }
          break;
        }
        default:
          break;
      }
    };

    // ── Drawing ───────────────────────────────────────────────────────────
    const drawWalls = (P: typeof pal, src: Uint8Array) => {
      const body = new Path2D();
      // A one-pixel lit edge wherever a wall faces open floor above it. It is
      // the only thing that makes the blocks read as raised rather than as a
      // second floor colour.
      const lip = new Path2D();
      for (let y = 0; y < rows; y++) {
        const row = y * cols;
        let x = 0;
        while (x < cols) {
          if (!src[row + x]) {
            x++;
            continue;
          }
          const x0 = x;
          while (x < cols && src[row + x]) x++;
          body.rect(ox + x0 * cs, oy + y * cs, (x - x0) * cs, cs);
        }
        x = 0;
        while (x < cols) {
          const i = row + x;
          if (!src[i] || (y > 0 && src[i - cols])) {
            x++;
            continue;
          }
          const x0 = x;
          x++;
          while (x < cols && src[row + x] && !(y > 0 && src[row + x - cols])) x++;
          lip.rect(ox + x0 * cs, oy + y * cs, (x - x0) * cs, 1);
        }
      }
      ctx.fillStyle = P.wall;
      ctx.fill(body);
      ctx.fillStyle = P.lip;
      ctx.fill(lip);
    };

    const drawExplored = (P: typeof pal, s: Search) => {
      const { state, closedAt } = s;
      const r = rate();
      const hot = r * 0.16;
      const warm = r * 0.55;
      const layers = [new Path2D(), new Path2D(), new Path2D()];
      for (let y = 0; y < rows; y++) {
        const row = y * cols;
        let x = 0;
        while (x < cols) {
          const i = row + x;
          if (state[i] !== 2) {
            x++;
            continue;
          }
          const age = clock - closedAt[i];
          const b = age < hot ? 0 : age < warm ? 1 : 2;
          const x0 = x;
          x++;
          while (x < cols) {
            const j = row + x;
            if (state[j] !== 2) break;
            const a = clock - closedAt[j];
            if ((a < hot ? 0 : a < warm ? 1 : 2) !== b) break;
            x++;
          }
          layers[b].rect(ox + x0 * cs, oy + y * cs, (x - x0) * cs, cs);
        }
      }
      for (let b = 2; b >= 0; b--) {
        ctx.fillStyle = P.age[b];
        ctx.fill(layers[b]);
      }
      // Queued but not yet expanded: small, bright, and clearly not "done".
      const inset = Math.max(1, Math.round(cs * 0.31));
      const side = cs - inset * 2;
      if (side <= 0) return;
      const front = new Path2D();
      let any = false;
      for (let i = 0; i < state.length; i++) {
        if (state[i] !== 1) continue;
        front.rect(ox + (i % cols) * cs + inset, oy + Math.floor(i / cols) * cs + inset, side, side);
        any = true;
      }
      if (any) {
        ctx.fillStyle = P.front;
        ctx.fill(front);
      }
    };

    const drawCarveGlow = (P: typeof pal) => {
      if (!build || revealed === 0 || revealed >= build.order.length) return;
      // A short bright head, not a tenth of the maze: on a big board a
      // time-based trail would light up hundreds of cells at once.
      const span = Math.min(42, Math.max(3, Math.ceil((build.order.length * 0.14) / carveFor)));
      const from = Math.max(0, revealed - span);
      const layers = [new Path2D(), new Path2D(), new Path2D()];
      for (let i = from; i < revealed; i++) {
        const cell = build.order[i];
        const b = Math.min(2, Math.floor(((revealed - 1 - i) / span) * 3));
        layers[b].rect(ox + (cell % cols) * cs, oy + Math.floor(cell / cols) * cs, cs, cs);
      }
      for (let b = 2; b >= 0; b--) {
        ctx.fillStyle = P.glow[b];
        ctx.fill(layers[b]);
      }
    };

    const drawPath = (P: typeof pal, glow: number) => {
      if (path.length < 2 || progress <= 0) return;
      let left = progress * pathLength;
      let px = cx(path[0]);
      let py = cy(path[0]);
      let tipX = px;
      let tipY = py;
      ctx.beginPath();
      ctx.moveTo(px, py);
      for (let i = 1; i < path.length; i++) {
        const nx = cx(path[i]);
        const ny = cy(path[i]);
        const seg = nx !== px && ny !== py ? Math.SQRT2 : 1;
        if (left >= seg) {
          ctx.lineTo(nx, ny);
          left -= seg;
          tipX = nx;
          tipY = ny;
        } else {
          const f = left / seg;
          tipX = px + (nx - px) * f;
          tipY = py + (ny - py) * f;
          ctx.lineTo(tipX, tipY);
          break;
        }
        px = nx;
        py = ny;
      }
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.lineWidth = cs * 0.32;
      ctx.strokeStyle = P.path;
      // The only blurred thing on the board. shadowBlur ignores the transform,
      // so it is scaled by dpr by hand to look the same on every screen.
      ctx.shadowColor = P.path;
      ctx.shadowBlur = cs * 0.75 * glow * dpr;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
      ctx.lineWidth = Math.max(1, cs * 0.09);
      ctx.strokeStyle = P.core;
      ctx.stroke();
      if (progress < 1) {
        ctx.fillStyle = P.ink;
        ctx.beginPath();
        ctx.arc(tipX, tipY, cs * 0.17, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawMarker = (P: typeof pal, cell: number, isGoal: boolean, alpha: number) => {
      if (alpha <= 0) return;
      const x = cx(cell);
      const y = cy(cell);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = P.halo;
      ctx.beginPath();
      ctx.arc(x, y, cs * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = P.ink;
      ctx.strokeStyle = P.ink;
      ctx.beginPath();
      if (isGoal) {
        ctx.lineWidth = Math.max(1.25, cs * 0.1);
        ctx.arc(x, y, cs * 0.27, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, cs * 0.09, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.arc(x, y, cs * 0.27, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const drawGrid = (P: typeof pal) => {
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.stroke(gridLines);
    };

    const drawScene = (P: typeof pal) => {
      ctx.fillStyle = P.board;
      ctx.fillRect(0, 0, width, height);
      if (!ready) return;
      const carving = phase === "carve";
      if (search && !carving) drawExplored(P, search);
      drawGrid(P);
      drawWalls(P, carving ? shown : walls);
      if (carving) drawCarveGlow(P);
      const pulse = phase === "hold" ? 0.5 - 0.5 * Math.cos((t / HOLD) * Math.PI * 4) : 0;
      drawPath(P, 1 + 0.8 * pulse);
      const alpha = carving ? Math.min(1, t / 0.3) : 1;
      drawMarker(P, start, false, alpha);
      drawMarker(P, goal, true, alpha);
    };

    /**
     * The next maze's first build frame, laid over the outgoing board at
     * `alpha`. Every fill here is opaque and none overlaps another, so the
     * result is an exact blend between the two pictures, and at alpha 1 it is
     * pixel for pixel what the build draws first. No second canvas needed.
     */
    const drawBaseOver = (P: typeof pal, m: Maze, alpha: number) => {
      if (alpha <= 0) return;
      ctx.globalAlpha = alpha;
      const gw = cols * cs;
      const gh = rows * cs;
      if (m.solid) {
        const around = new Path2D();
        around.rect(0, 0, width, height);
        around.rect(ox, oy, gw, gh);
        ctx.fillStyle = P.board;
        ctx.fill(around, "evenodd");
        ctx.fillStyle = P.lip;
        ctx.fillRect(ox, oy, gw, 1);
        ctx.fillStyle = P.wall;
        ctx.fillRect(ox, oy + 1, gw, gh - 1);
      } else {
        ctx.fillStyle = P.board;
        ctx.fillRect(0, 0, width, height);
        drawGrid(P);
      }
      ctx.globalAlpha = 1;
    };

    const drawCursor = () => {
      if (!focused || !keyboard || !ready) return;
      const x = ox + (cursor % cols) * cs;
      const y = oy + Math.floor(cursor / cols) * cs;
      ctx.strokeStyle = "rgba(255,255,255,0.92)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 1.25, y + 1.25, cs - 2.5, cs - 2.5);
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 2.5, y + 2.5, cs - 5, cs - 5);
    };

    const render = () => {
      const P = palette();
      drawScene(P);
      if (phase === "fade" && next) {
        const k = Math.min(1, t / FADE);
        drawBaseOver(P, next, k * k * (3 - 2 * k));
      }
      drawCursor();
    };

    const hud = () => {
      const explored = exploredRef.current;
      const steps = stepsRef.current;
      if (!explored || !steps) return;
      // The old numbers stay up while the old board fades; they reset when
      // the next build starts.
      const s = phase === "carve" ? null : search;
      const e = s ? String(s.visited) : "0";
      const p = !s || !s.done ? "…" : s.found ? String(path.length - 1) : "none";
      if (explored.textContent !== e) explored.textContent = e;
      if (steps.textContent !== p) steps.textContent = p;
    };

    drawRef.current = (dt) => {
      if (!ready) return false;
      syncProps();
      advance(dt);
      render();
      hud();
      return phase === "idle" ? false : undefined;
    };

    measureRef.current = ({ width: w, height: h, dpr: d, bufferWidth, bufferHeight }) => {
      if (w <= 0 || h <= 0) return;
      width = w;
      height = h;
      dpr = d;
      // Assigning a canvas dimension clears it even when the value is the
      // same, so only touch them when they actually change.
      if (canvas.width !== bufferWidth) canvas.width = bufferWidth;
      if (canvas.height !== bufferHeight) canvas.height = bufferHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const withChrome = h >= CHROME_MIN_HEIGHT && w >= CHROME_MIN_WIDTH;
      setChrome(withChrome);
      const top = withChrome ? BAND_TOP : PAD;
      const bottom = withChrome ? BAND_BOTTOM : PAD;
      const availW = w - PAD * 2;
      const availH = h - top - bottom;
      let size = Math.max(4, Math.round(live.current.cellSize));
      let c = Math.floor(availW / size);
      let r = Math.floor(availH / size);
      if (c < 5 || r < 5) {
        size = Math.max(4, Math.floor(Math.min(availW, availH) / 5));
        c = Math.floor(availW / size);
        r = Math.floor(availH / size);
      }
      if (c % 2 === 0) c--;
      if (r % 2 === 0) r--;
      if (c < 3 || r < 3) {
        ready = false;
        return;
      }

      ox = PAD + Math.floor((availW - c * size) / 2);
      oy = top + Math.floor((availH - r * size) / 2);
      wrap.style.setProperty("--pf-x", `${ox}px`);
      wrap.style.setProperty("--pf-top", `${oy}px`);
      wrap.style.setProperty("--pf-bottom", `${h - oy - r * size}px`);

      const changed = c !== cols || r !== rows || size !== cs;
      const pc = cols;
      const pr = rows;
      cols = c;
      rows = r;
      cs = size;

      // Half-pixel offsets keep 1px lines crisp. The closing line sits inside
      // the last cell, not past it, so the grid is symmetric at its edges.
      gridLines = new Path2D();
      for (let x = 0; x <= cols; x++) {
        const at = ox + x * cs + (x === cols ? -0.5 : 0.5);
        gridLines.moveTo(at, oy);
        gridLines.lineTo(at, oy + rows * cs);
      }
      for (let y = 0; y <= rows; y++) {
        const at = oy + y * cs + (y === rows ? -0.5 : 0.5);
        gridLines.moveTo(ox, at);
        gridLines.lineTo(ox + cols * cs, at);
      }

      if (ready && !changed) return;
      if (edited && pc > 0 && walls.length === pc * pr) refit(pc, pr, walls, start, goal, cursor);
      else restart();
      ready = true;
    };

    // ── Input ─────────────────────────────────────────────────────────────
    const cellAt = (e: PointerEvent, clamp: boolean) => {
      const box = canvas.getBoundingClientRect();
      const sx = box.width > 0 ? width / box.width : 1;
      const sy = box.height > 0 ? height / box.height : 1;
      let x = Math.floor(((e.clientX - box.left) * sx - ox) / cs);
      let y = Math.floor(((e.clientY - box.top) * sy - oy) / cs);
      if (clamp) {
        x = Math.min(cols - 1, Math.max(0, x));
        y = Math.min(rows - 1, Math.max(0, y));
      } else if (x < 0 || y < 0 || x >= cols || y >= rows) {
        return -1;
      }
      return y * cols + x;
    };

    const look = (value: string) => {
      if (value === pointerLook) return;
      pointerLook = value;
      canvas.style.cursor = value;
    };

    const onDown = (e: PointerEvent) => {
      if (!ready || drag) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const cell = cellAt(e, false);
      if (cell < 0) return;
      keyboard = false;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // A pointer that is already gone cannot be captured; the stroke still works.
      }
      beginEdit();
      if (cell === start || cell === goal) {
        drag = { id: e.pointerId, kind: cell === start ? "start" : "goal", value: 0, last: cell };
        look("grabbing");
      } else {
        const value = walls[cell] ? 0 : 1;
        drag = { id: e.pointerId, kind: "wall", value, last: cell };
        walls[cell] = value;
      }
      solveNow();
      loop.paint();
    };

    const onMove = (e: PointerEvent) => {
      if (!ready) return;
      if (!drag || e.pointerId !== drag.id) {
        if (drag || e.pointerType !== "mouse") return;
        const cell = cellAt(e, false);
        look(cell < 0 ? "" : cell === start || cell === goal ? "grab" : "crosshair");
        return;
      }
      const cell = cellAt(e, true);
      if (cell === drag.last) return;
      let changed = false;
      if (drag.kind === "wall") {
        const value = drag.value;
        // Every cell between the last sample and this one, so a fast stroke
        // leaves an unbroken wall instead of a dotted line.
        trace(drag.last, cell, cols, (c) => {
          if (c === start || c === goal || walls[c] === value) return;
          walls[c] = value;
          changed = true;
        });
      } else if (!walls[cell] && cell !== start && cell !== goal) {
        if (drag.kind === "start") start = cell;
        else goal = cell;
        changed = true;
      }
      drag.last = cell;
      if (changed) {
        solveNow();
        loop.paint();
      }
    };

    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      drag = null;
      look("");
      loop.paint();
    };

    const onMenu = (e: Event) => e.preventDefault();

    const moveCursor = (x: number, y: number) => {
      cursor = Math.min(rows - 1, Math.max(0, y)) * cols + Math.min(cols - 1, Math.max(0, x));
    };

    const place = (isGoal: boolean) => {
      if (cursor === (isGoal ? start : goal)) return;
      beginEdit();
      walls[cursor] = 0;
      if (isGoal) goal = cursor;
      else start = cursor;
      solveNow();
    };

    const onKey = (e: KeyboardEvent) => {
      // Keys typed into the toolbar buttons belong to the buttons.
      if (e.target !== wrap || !ready) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const x = cursor % cols;
      const y = Math.floor(cursor / cols);
      const by = e.shiftKey ? 5 : 1;
      switch (e.key) {
        case "ArrowLeft":
          moveCursor(x - by, y);
          break;
        case "ArrowRight":
          moveCursor(x + by, y);
          break;
        case "ArrowUp":
          moveCursor(x, y - by);
          break;
        case "ArrowDown":
          moveCursor(x, y + by);
          break;
        case " ":
        case "Spacebar":
          if (!e.repeat && cursor !== start && cursor !== goal) {
            beginEdit();
            walls[cursor] = walls[cursor] ? 0 : 1;
            solveNow();
          }
          break;
        case "s":
        case "S":
          if (!e.repeat) place(false);
          break;
        case "g":
        case "G":
          if (!e.repeat) place(true);
          break;
        case "Enter":
          if (!e.repeat) run();
          break;
        case "m":
        case "M":
          if (!e.repeat) newMaze();
          break;
        case "c":
        case "C":
          if (!e.repeat) clear();
          break;
        default:
          return;
      }
      // Consumed, so the page does not scroll and the stage around us does not
      // read it as navigation.
      e.preventDefault();
      keyboard = true;
      loop.paint();
    };

    const onFocus = () => {
      focused = true;
      try {
        keyboard = wrap.matches(":focus-visible");
      } catch {
        keyboard = false;
      }
      loop.paint();
    };

    const onBlur = () => {
      focused = false;
      keyboard = false;
      loop.paint();
    };

    actRef.current = (action) => {
      if (!ready) return;
      if (action === "new") newMaze();
      else if (action === "run") run();
      else clear();
      loop.paint();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("lostpointercapture", onUp);
    canvas.addEventListener("contextmenu", onMenu);
    wrap.addEventListener("keydown", onKey);
    wrap.addEventListener("focus", onFocus);
    wrap.addEventListener("blur", onBlur);

    // The host's own setup ran before this effect and found every ref empty.
    loop.resize();
    loop.start();

    return () => {
      drawRef.current = null;
      measureRef.current = null;
      actRef.current = null;
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("lostpointercapture", onUp);
      canvas.removeEventListener("contextmenu", onMenu);
      wrap.removeEventListener("keydown", onKey);
      wrap.removeEventListener("focus", onFocus);
      wrap.removeEventListener("blur", onBlur);
    };
  }, [loop]);

  // Re-arm a loop that halted itself on a finished board. The frame works out
  // what changed.
  useEffect(() => {
    loop.start();
  }, [paused, reduce, autoplay, algorithm, maze, diagonal, loop]);

  useEffect(() => {
    loop.paint();
  }, [searchColor, pathColor, boardColor, chrome, loop]);

  useEffect(() => {
    loop.resize();
  }, [cellSize, loop]);

  return (
    <div className={`relative flex h-full w-full flex-col overflow-hidden ${className}`.trim()}>
      <div
        ref={wrapRef}
        tabIndex={0}
        role="application"
        aria-roledescription="pathfinding grid"
        aria-label="Pathfinding grid. Arrow keys move the cursor, and Shift moves it five cells. Space adds or removes a wall. S sets the start and G sets the goal. Enter runs the search, M builds a new maze and C clears the board."
        // The drag draws walls, so a finger must not scroll the page with it.
        className="@container relative min-h-0 flex-1 touch-none select-none outline-none focus-visible:outline-2 focus-visible:-outline-offset-2"
        style={{ backgroundColor: boardColor, outlineColor: searchColor }}
      >
        {/* Out of flow, so the backing store's pixel size never feeds back into
            the layout the ResizeObserver is measuring. */}
        <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 block size-full" />
        {chrome && (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md bg-black/45 px-2 font-mono text-[11px] leading-none tabular-nums text-white/85 backdrop-blur-sm"
              style={{
                left: "var(--pf-x, 8px)",
                bottom: "calc(100% - var(--pf-top, 40px) + 6px)",
              }}
            >
              <span className="font-semibold text-white">{LABELS[algorithm]}</span>
              <span className="text-white/30">·</span>
              <span className="text-white/50">explored</span>
              <span ref={exploredRef} />
              <span className="text-white/30">·</span>
              <span className="text-white/50">path</span>
              <span ref={stepsRef} />
            </div>
            <div
              className="absolute flex items-center gap-0.5 rounded-md bg-black/45 p-0.5 text-white/85 backdrop-blur-sm"
              style={{
                left: "var(--pf-x, 8px)",
                top: "calc(100% - var(--pf-bottom, 46px) + 6px)",
              }}
            >
              <ToolButton label="New maze" shortcut="M" onPress={() => actRef.current?.("new")}>
                <svg {...ICON}>
                  <path d="M4 9V4h16v11" />
                  <path d="M20 20H4v-7" />
                  <path d="M8 8h8v4" />
                  <path d="M8 12v4h4" />
                </svg>
              </ToolButton>
              <ToolButton label="Run" shortcut="Enter" onPress={() => actRef.current?.("run")}>
                <svg {...ICON}>
                  <path d="M8 5.5v13l10-6.5z" fill="currentColor" />
                </svg>
              </ToolButton>
              <ToolButton label="Clear" shortcut="C" onPress={() => actRef.current?.("clear")}>
                <svg {...ICON}>
                  <path d="M17.5 13.5 11 20H8l-4-4 9.5-9.5a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8z" />
                  <path d="M8.5 11.5 14 17" />
                  <path d="M12 20h8" />
                </svg>
              </ToolButton>
            </div>
          </>
        )}
      </div>
      <p ref={announceRef} aria-live="polite" className="sr-only" />
    </div>
  );
}

const ICON = {
  viewBox: "0 0 24 24",
  width: 14,
  height: 14,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function ToolButton({
  label,
  shortcut,
  onPress,
  children,
}: {
  label: string;
  shortcut: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={`${label} (${shortcut})`}
      onClick={onPress}
      className="inline-flex h-7 items-center gap-1.5 rounded px-2 text-[11px] font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white/70"
    >
      {children}
      <span className="hidden @min-[480px]:inline">{label}</span>
    </button>
  );
}

/** Every cell on the line between two cells (Bresenham), both ends included. */
function trace(from: number, to: number, width: number, visit: (cell: number) => void) {
  let x0 = from % width;
  let y0 = Math.floor(from / width);
  const x1 = to % width;
  const y1 = Math.floor(to / width);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    visit(y0 * width + x0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/**
 * Any CSS colour to RGB, by letting the canvas parse it: it normalises what it
 * accepts to `#rrggbb` or `rgba(...)` and ignores what it does not.
 */
function toRgb(ctx: CanvasRenderingContext2D, color: string, fallback: Rgb): Rgb {
  ctx.fillStyle = `rgb(${fallback[0]},${fallback[1]},${fallback[2]})`;
  ctx.fillStyle = color;
  const s = String(ctx.fillStyle);
  if (s.startsWith("#") && s.length === 7) {
    return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  }
  const m = /rgba?\(([^)]+)\)/.exec(s);
  if (m) {
    const [r, g, b] = m[1].split(",").map((v) => Number.parseFloat(v));
    if ([r, g, b].every(Number.isFinite)) return [r, g, b];
  }
  return fallback;
}

function mix(a: Rgb, b: Rgb, k: number): Rgb {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function rgba(c: Rgb, alpha: number) {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`;
}

function luminance(c: Rgb) {
  return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
}
