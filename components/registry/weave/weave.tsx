"use client";

import { memo, useEffect, useRef } from "react";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A sheet of cloth you can pull on, loaded until it tears.
//
// This is a *position-based* solver, which is a different animal from the
// impulse-based rigid-body one elsewhere in this catalogue. There are no forces
// resolved at contacts and no rotations: there are particles, and there are
// distance constraints between them, and the solver simply moves particles back
// toward satisfying their constraints, over and over, until the sheet is close
// enough to inextensible. Everything that reads as fabric — the drape, the
// diagonal load paths, the way a tear runs — falls out of that loop.
//
// Three decisions carry the component.
//
// **Velocity is not stored.** In Verlet integration a particle's velocity is
// implied by the gap between where it is and where it was, so the only state is
// two positions. That is what makes the constraint pass legal: you can move a
// particle anywhere you like and the simulation stays stable, because the move
// itself is the new velocity. It is also the trap — see `hold`.
//
// **Strain is the readout, not decoration.** Every quad is shaded by how far its
// own edges are stretched against their rest length, scaled so that full colour
// is exactly the tear threshold. A quad going hot is therefore a prediction: it
// is the solver telling you where this sheet is about to fail, and it is
// information a wireframe cannot show.
//
// **Tearing is judged after the solve, never inside it.** Mid-relaxation, a
// constraint's extension is an artefact of where it sits in the sweep order —
// the ones visited last look worst. Cutting on that produces failures that
// follow the constraint list rather than the load, which looks arbitrary because
// it is.
export type WeavePin = "top-row" | "corners" | "top-and-bottom" | "free";
export type WeaveShading = "strain" | "wireframe" | "solid";

interface WeaveProps {
  /** Particles across the sheet. */
  cols?: number;
  /** Particles down the sheet. */
  rows?: number;
  /** Relaxation passes over the constraint list per fixed step. */
  iterations?: number;
  /** Uniform downward acceleration. */
  gravity?: number;
  /** Lateral forcing, applied with a travelling phase so it ripples. */
  wind?: number;
  /** Fraction of each constraint's length error corrected per pass. */
  stiffness?: number;
  /** Velocity bled off per step. */
  damping?: number;
  /** Extension at which a constraint fails, as a multiple of rest length. */
  tearThreshold?: number;
  /** Which particles are held. */
  pinMode?: WeavePin;
  /** How each quad is filled. */
  shading?: WeaveShading;
  /** The cloth at rest — zero strain. */
  tint?: string;
  /** The far end of the strain ramp, reached at the tear threshold. */
  strainColor?: string;
  /** Halt the solver. The sheet holds its shape. */
  paused?: boolean;
  /** The sheet is presented already settled and does not move. */
  reducedMotion?: boolean;
  className?: string;
}

/** Solver rate. Fixed, and far above the display rate: a stiff constraint
 *  network integrated on a variable dt gains energy the first time a frame runs
 *  long, and a sheet that explodes once never comes back. */
const DT = 1 / 120;

/** Ceiling on catch-up steps. Without it, a tab restored after a minute in the
 *  background tries to simulate that minute in one frame and locks the page. */
const MAX_STEPS = 8;

/** Steps run before the first paint, so the sheet is already hanging when it
 *  arrives. This is also what makes the reduced-motion and paused-on-mount
 *  states honest: a flat grid pinned in mid-air is not what this component is. */
const SETTLE_STEPS = 260;

/** Metres per pixel, so gravity in m/s² lands at a plausible speed on screen. */
const PX_PER_M = 46;

/** How fast a grabbed particle is allowed to be moving when it is let go. A
 *  flick across the pane in one frame otherwise implies thousands of pixels per
 *  second and the sheet detonates on release. */
const MAX_GRAB_V = 14;

interface Particle {
  x: number;
  y: number;
  px: number;
  py: number;
  pinned: boolean;
}

interface Link {
  a: number;
  b: number;
  rest: number;
  dead: boolean;
  strain: number;
}

const Weave = memo(
  ({
    cols = 26,
    rows = 18,
    iterations = 6,
    gravity = 9.8,
    wind = 4.2,
    stiffness = 0.9,
    damping = 0.02,
    tearThreshold = 1.9,
    pinMode = "corners",
    shading = "strain",
    tint = "#a855f7",
    strainColor = "#f87171",
    paused = false,
    reducedMotion = false,
    className,
  }: WeaveProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawRef = useRef<((dt: number) => void | false) | null>(null);
    const measureRef = useRef<((m: Metrics) => void) | null>(null);

    const live = useRef({
      cols, rows, iterations, gravity, wind, stiffness, damping,
      tearThreshold, pinMode, shading, tint, strainColor, reducedMotion,
    });
    live.current = {
      cols, rows, iterations, gravity, wind, stiffness, damping,
      tearThreshold, pinMode, shading, tint, strainColor, reducedMotion,
    };

    const loop = useAnimationLoop({
      target: containerRef,
      halted: paused || reducedMotion,
      dpr: "auto",
      onResize: (metrics) => measureRef.current?.(metrics),
      onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
    });

    useEffect(() => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      let particles: Particle[] = [];
      let links: Link[] = [];
      let gridCols = 0;
      let gridRows = 0;
      let width = 0;
      let height = 0;
      let clock = 0;

      const grab = { index: -1, x: 0, y: 0, lx: 0, ly: 0, active: false };

      const isPinned = (i: number, j: number, mode: string): boolean => {
        const last = gridCols - 1;
        if (mode === "top-row") return j === 0;
        if (mode === "corners") return j === 0 && (i === 0 || i === last);
        if (mode === "top-and-bottom") return j === 0 || j === gridRows - 1;
        return false;
      };

      const build = () => {
        const l = live.current;
        gridCols = Math.max(4, Math.round(l.cols));
        gridRows = Math.max(3, Math.round(l.rows));

        const spanX = width * 0.68;
        const spanY = height * 0.6;
        const step = Math.min(
          spanX / (gridCols - 1),
          spanY / (gridRows - 1),
        );
        const originX = (width - step * (gridCols - 1)) / 2;
        const originY = height * 0.14;

        particles = [];
        for (let j = 0; j < gridRows; j++) {
          for (let i = 0; i < gridCols; i++) {
            const x = originX + i * step;
            const y = originY + j * step;
            particles.push({
              x,
              y,
              px: x,
              py: y,
              pinned: isPinned(i, j, l.pinMode),
            });
          }
        }

        links = [];
        const push = (a: number, b: number) => {
          const dx = particles[b].x - particles[a].x;
          const dy = particles[b].y - particles[a].y;
          links.push({ a, b, rest: Math.hypot(dx, dy), dead: false, strain: 0 });
        };
        for (let j = 0; j < gridRows; j++) {
          for (let i = 0; i < gridCols; i++) {
            const at = j * gridCols + i;
            if (i < gridCols - 1) push(at, at + 1);
            if (j < gridRows - 1) push(at, at + gridCols);
          }
        }

        grab.index = -1;
        grab.active = false;
      };

      const step = () => {
        const l = live.current;
        clock += DT;

        const g = l.gravity * PX_PER_M * DT * DT;
        // Wind travels rather than pushing uniformly. A uniform lateral force
        // just translates the sheet; a phase that moves through it is what makes
        // the surface ripple, which is the only way the eye reads it as air.
        const windScale = l.wind * PX_PER_M * DT * DT;
        const retain = 1 - Math.min(0.9, Math.max(0, l.damping));

        for (let k = 0; k < particles.length; k++) {
          const p = particles[k];
          if (p.pinned) {
            // Position AND previous position. Writing only the position leaves
            // the gap between them as an implied velocity of exactly the
            // correction just applied, and the anchor becomes a motor.
            p.px = p.x;
            p.py = p.y;
            continue;
          }

          const j = Math.floor(k / gridCols);
          const gust =
            windScale *
            (Math.sin(clock * 1.7 + j * 0.35) * 0.6 +
              Math.sin(clock * 0.63 + p.x * 0.012) * 0.4);

          const vx = (p.x - p.px) * retain;
          const vy = (p.y - p.py) * retain;
          p.px = p.x;
          p.py = p.y;
          p.x += vx + gust;
          p.y += vy + g;
        }

        if (grab.active && grab.index >= 0) {
          const p = particles[grab.index];
          // Carry the hand's momentum, clamped. Snapping the position without
          // touching `px` would declare a velocity of the whole travel per step.
          const dx = Math.max(-MAX_GRAB_V, Math.min(MAX_GRAB_V, grab.x - grab.lx));
          const dy = Math.max(-MAX_GRAB_V, Math.min(MAX_GRAB_V, grab.y - grab.ly));
          p.x = grab.x;
          p.y = grab.y;
          p.px = grab.x - dx;
          p.py = grab.y - dy;
        }

        const k = Math.max(0.05, Math.min(1, l.stiffness));
        const passes = Math.max(1, Math.round(l.iterations));
        for (let pass = 0; pass < passes; pass++) {
          for (let c = 0; c < links.length; c++) {
            const link = links[c];
            if (link.dead) continue;
            const a = particles[link.a];
            const b = particles[link.b];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy) || 1e-6;
            const diff = ((dist - link.rest) / dist) * 0.5 * k;
            const ox = dx * diff;
            const oy = dy * diff;
            if (!a.pinned) {
              a.x += ox;
              a.y += oy;
            }
            if (!b.pinned) {
              b.x -= ox;
              b.y -= oy;
            }
          }
        }

        // Strain and tearing, once, after the sweep has converged as far as it
        // is going to. Marked rather than spliced: removing an element from the
        // array being iterated skips its neighbour and corrupts the pass.
        const limit = Math.max(1.02, l.tearThreshold);
        for (let c = 0; c < links.length; c++) {
          const link = links[c];
          if (link.dead) continue;
          const a = particles[link.a];
          const b = particles[link.b];
          const dist = Math.hypot(b.x - a.x, b.y - a.y);
          const ratio = dist / link.rest;
          link.strain = Math.max(0, Math.min(1, (ratio - 1) / (limit - 1)));
          if (ratio > limit) link.dead = true;
        }
      };

      // Cell (i,j) is intact only when all four of its edges survive; anything
      // less is a hole, and filling it would paste fabric over a tear. Finding
      // an edge means knowing where it landed in the flat link list, so the
      // mapping is tabulated once per rebuild rather than searched per quad per
      // frame — the same order the build loop pushes them in.
      let hIndex: Int32Array = new Int32Array(0);
      let vIndex: Int32Array = new Int32Array(0);
      const indexLinks = () => {
        hIndex = new Int32Array(gridCols * gridRows).fill(-1);
        vIndex = new Int32Array(gridCols * gridRows).fill(-1);
        let n = 0;
        for (let j = 0; j < gridRows; j++) {
          for (let i = 0; i < gridCols; i++) {
            if (i < gridCols - 1) hIndex[j * gridCols + i] = n++;
            if (j < gridRows - 1) vIndex[j * gridCols + i] = n++;
          }
        }
      };

      const alive = (idx: number): boolean => idx >= 0 && !links[idx].dead;

      const draw = () => {
        const l = live.current;
        ctx.clearRect(0, 0, width, height);
        if (!particles.length) return;

        const [tr, tg, tb] = hexToRgb(l.tint);
        const [sr, sg, sb] = hexToRgb(l.strainColor);

        if (l.shading === "wireframe") {
          ctx.lineWidth = 1;
          for (let c = 0; c < links.length; c++) {
            const link = links[c];
            if (link.dead) continue;
            const a = particles[link.a];
            const b = particles[link.b];
            const t = link.strain;
            ctx.strokeStyle = `rgba(${Math.round(tr + (sr - tr) * t)}, ${Math.round(tg + (sg - tg) * t)}, ${Math.round(tb + (sb - tb) * t)}, ${0.35 + t * 0.6})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        } else {
          for (let j = 0; j < gridRows - 1; j++) {
            for (let i = 0; i < gridCols - 1; i++) {
              const top = hIndex[j * gridCols + i];
              const bottom = hIndex[(j + 1) * gridCols + i];
              const left = vIndex[j * gridCols + i];
              const right = vIndex[j * gridCols + i + 1];
              if (!alive(top) || !alive(bottom) || !alive(left) || !alive(right)) {
                continue;
              }

              const p0 = particles[j * gridCols + i];
              const p1 = particles[j * gridCols + i + 1];
              const p2 = particles[(j + 1) * gridCols + i + 1];
              const p3 = particles[(j + 1) * gridCols + i];

              let t = 0;
              if (l.shading === "strain") {
                t =
                  (links[top].strain +
                    links[bottom].strain +
                    links[left].strain +
                    links[right].strain) *
                  0.25;
              }

              ctx.fillStyle = `rgba(${Math.round(tr + (sr - tr) * t)}, ${Math.round(tg + (sg - tg) * t)}, ${Math.round(tb + (sb - tb) * t)}, ${0.2 + t * 0.68})`;
              ctx.beginPath();
              ctx.moveTo(p0.x, p0.y);
              ctx.lineTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.lineTo(p3.x, p3.y);
              ctx.closePath();
              ctx.fill();
            }
          }

          // The threads, over the fill. Flat quads alone read as a sheet of
          // coloured plastic — it is seeing the grid deform that makes the
          // surface legible as cloth, and it is also the only way a fold is
          // visible at all, since nothing here is lit.
          ctx.lineWidth = 1;
          for (let c = 0; c < links.length; c++) {
            const link = links[c];
            if (link.dead) continue;
            const a = particles[link.a];
            const b = particles[link.b];
            const t = link.strain;
            ctx.strokeStyle = `rgba(${Math.round(tr + (sr - tr) * t)}, ${Math.round(tg + (sg - tg) * t)}, ${Math.round(tb + (sb - tb) * t)}, ${0.22 + t * 0.7})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }

        // Anchors, so it is obvious what is holding the sheet up and what the
        // load is being carried to.
        ctx.fillStyle = `rgba(${tr}, ${tg}, ${tb}, 0.9)`;
        for (let k = 0; k < particles.length; k++) {
          if (!particles[k].pinned) continue;
          ctx.beginPath();
          ctx.arc(particles[k].x, particles[k].y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        if (grab.active && grab.index >= 0) {
          const p = particles[grab.index];
          ctx.strokeStyle = `rgba(${tr}, ${tg}, ${tb}, 0.85)`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
          ctx.stroke();
        }
      };

      let accumulator = 0;
      drawRef.current = (dt) => {
        accumulator += Math.min(dt, 0.25);
        let steps = 0;
        while (accumulator >= DT && steps < MAX_STEPS) {
          step();
          accumulator -= DT;
          steps++;
        }
        if (steps === MAX_STEPS) accumulator = 0;
        draw();
      };

      measureRef.current = ({ width: w, height: h, dpr, bufferWidth, bufferHeight }) => {
        width = w;
        height = h;
        canvas.width = bufferWidth;
        canvas.height = bufferHeight;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        build();
        indexLinks();
        for (let s = 0; s < SETTLE_STEPS; s++) step();
        draw();
      };

      const at = (event: PointerEvent): { x: number; y: number } => {
        const box = canvas.getBoundingClientRect();
        return { x: event.clientX - box.left, y: event.clientY - box.top };
      };

      const onDown = (event: PointerEvent) => {
        if (live.current.reducedMotion) return;
        const { x, y } = at(event);
        let best = -1;
        let bestD = 30 * 30;
        for (let k = 0; k < particles.length; k++) {
          const p = particles[k];
          const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
          if (d < bestD) {
            bestD = d;
            best = k;
          }
        }
        if (best < 0) return;
        grab.index = best;
        grab.x = x;
        grab.y = y;
        grab.lx = x;
        grab.ly = y;
        grab.active = true;
        canvas.setPointerCapture(event.pointerId);
        loop.start();
      };

      const onMove = (event: PointerEvent) => {
        if (!grab.active) return;
        const { x, y } = at(event);
        grab.lx = grab.x;
        grab.ly = grab.y;
        grab.x = x;
        grab.y = y;
      };

      const onUp = (event: PointerEvent) => {
        grab.active = false;
        grab.index = -1;
        if (canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
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
      };
      // The tunables are read from `live` every step; only the ones that change
      // the mesh itself rebuild the runtime.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cols, rows, pinMode]);

    // A rebuild is the only honest response to a new grid or a new set of
    // anchors, and while paused the host still needs to be told to show it.
    useEffect(() => {
      loop.resize();
    }, [cols, rows, pinMode, loop]);

    return (
      <div ref={containerRef} className={className ?? "relative h-full w-full"}>
        {/* Out of flow. The measurement writes an explicit pixel width onto the
            canvas, and in flow that becomes the container's min-content width —
            so the container can never shrink again, the observer never fires,
            and the sheet stays frozen at whatever size it first got.

            Also: the drag drives the effect, so the finger must not scroll the
            page with it. Both inline, because the copied source has to carry
            them. */}
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 block touch-none select-none"
        />
      </div>
    );
  },
);

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

Weave.displayName = "Weave";

export default Weave;
