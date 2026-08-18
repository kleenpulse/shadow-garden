"use client";

import { memo, useEffect, useRef } from "react";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// Hoarfrost taking a word. Molten's opposite number: the same idea of type as a
// coverage field, run cold.
//
// Three decisions carry the component.
//
// **The text is never redrawn.** Unlike a melt, freezing is additive — the
// letters stay exactly as the browser set them, in a real span, at their real
// colour, and the canvas on top of them holds nothing but ice. That makes the
// accessibility story trivial and the thaw free: fading the overlay uncovers
// type that was there the whole time.
//
// **Growth is a front, not a field.** Diffusion-limited aggregation is usually
// written as a random walker looking for something to stick to, which spends
// almost all of its time walking through empty space. Here the live tips *are*
// the state: each one advances, occasionally forks, and dies when it runs out of
// glyph or hits ice already there. Cost is proportional to the crystal edge
// rather than to the area, so the first frost is as cheap as the last.
//
// **The glyph raster is a mask, not a picture.** It is sampled once per layout
// at half resolution and read only to answer "is there letter here" — which is
// all the growth needs to know, and it is why a resize costs one raster instead
// of a repaint per frame.
export type RimeMode = "loop" | "hover" | "hold";

interface RimeProps {
  /** The word. Not a tuned control — the bench passes a demo string. */
  text?: string;
  /** What drives the freeze. */
  mode?: RimeMode;
  /** How fast the crystal front advances. */
  growth?: number;
  /** How readily a tip splits in two. This is the difference between needles
   *  and ferns. */
  branching?: number;
  /** How much ice the letters will hold before the front runs out of room. */
  density?: number;
  /** How many places the frost starts from. */
  seeds?: number;
  /** How fast it melts back off. */
  thaw?: number;
  /** Seconds held at full freeze before the thaw. */
  hold?: number;
  /** Glints on the facets. */
  sparkle?: number;
  /** The ice. */
  frostColor?: string;
  /** The type underneath, which never moves. */
  baseColor?: string;
  /** Halt the loop. The frost stops exactly where it is. */
  paused?: boolean;
  /** One still frame at full freeze. Nothing grows and nothing thaws. */
  reducedMotion?: boolean;
  className?: string;
}

/** CSS pixels per coverage cell. Two is the point where a crystal segment is
 *  still a line rather than a staircase, and the mask is a quarter of the
 *  memory of a full-resolution one. */
const CELL = 2;

/** Crystal segment length, in cells. Shorter turns the ferns into fur; longer
 *  and the branches visibly chord across their own curves — and, at display
 *  sizes, step clean across a glyph stem that is only a few cells wide. */
const STEP = 1.15;

/** Front advances per second at growth 1. Tuned so a word of display size
 *  reaches full freeze in about four seconds. */
const RATE = 4000;

/** Consecutive steps a tip may spend off the glyph before it dies. This is a
 *  budget, not a distance: testing "is there ink nearby" instead lets a tip run
 *  the whole length of a stem two cells outside it, which grows long stray
 *  whiskers into open space rather than a fringe on the letter. */
const OVERHANG = 3;

/** How many times ice may cross a single cell. At one, a tip dies the instant it
 *  meets its own fork and the crystal stays a sparse scratch; at four the
 *  letters fill edge to edge and the result reads as wire wool rather than as
 *  frost. Two leaves the type legible under its own ice, which is the point. */
const CROSSINGS = 2;

/** Radians of noise per step. This is the single control over crystal habit:
 *  a large value is a random walk and comes out as tangle, while a small one
 *  lets a tip hold its heading long enough to read as a needle and leaves the
 *  sixty-degree forks doing the branching they are there for. */
const JITTER = 0.18;

/** How hard a tip turns back toward the ink when it strays off the glyph.
 *  High enough and it U-turns on itself, which curls every strand into a knot. */
const STEER = 0.42;

/** Blur of the dark relief laid under every crystal, in CSS pixels.
 *
 *  This is what makes the ice legible at all. The frost is a pale colour and it
 *  grows over type that is also pale, so a bright stroke alone disappears the
 *  moment it crosses a letter and only the strands that happen to hang over the
 *  background are ever visible — which reads as a fringe rather than as frost.
 *  Baking a cold shadow under each stroke gives the crystal relief on the letter
 *  and costs nothing on the dark ground behind it. */
const RELIEF = 3;

/** Ceiling on the fast-forward a resize performs. Past this the rebuild is
 *  visible as a hitch, and nobody can tell the difference in coverage. */
const CATCHUP_MAX = 90_000;

interface Tip {
  x: number;
  y: number;
  dir: number;
  /** Consecutive steps spent off the glyph. */
  out: number;
}

const Rime = memo(
  ({
    text = "RIME",
    mode = "loop",
    growth = 1,
    branching = 0.55,
    density = 0.7,
    seeds = 14,
    thaw = 1,
    hold = 1.5,
    sparkle = 0.35,
    frostColor = "#d6ecff",
    baseColor = "#e9e6f2",
    paused = false,
    reducedMotion = false,
    className,
  }: RimeProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawRef = useRef<((dt: number) => void | false) | null>(null);
    const measureRef = useRef<((m: Metrics) => void) | null>(null);
    const engaged = useRef(false);

    const loop = useAnimationLoop({
      target: containerRef,
      halted: paused || reducedMotion,
      dpr: "auto",
      onResize: (metrics) => measureRef.current?.(metrics),
      onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
    });

    const live = useRef({
      mode, growth, branching, density, seeds, thaw, hold, sparkle,
      frostColor, baseColor, reducedMotion,
    });
    live.current = {
      mode, growth, branching, density, seeds, thaw, hold, sparkle,
      frostColor, baseColor, reducedMotion,
    };

    useEffect(() => {
      const container = containerRef.current;
      const span = textRef.current;
      const canvas = canvasRef.current;
      if (!container || !span || !canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // The ice itself, kept between frames. Redrawing thousands of accumulated
      // segments every frame would make the cost grow with the crystal; blitting
      // one bitmap keeps it flat.
      const frost = document.createElement("canvas");
      const fctx = frost.getContext("2d");
      if (!fctx) return;

      const mask = document.createElement("canvas");

      let gw = 0;
      let gh = 0;
      let cover: Uint8Array = new Uint8Array(0);
      let taken: Uint8Array = new Uint8Array(0);
      let edges: Int32Array = new Int32Array(0);
      let edgeCount = 0;
      let tips: Tip[] = [];
      let glints: number[] = [];
      let steps = 0;
      let width = 0;
      let height = 0;
      let dprNow = 1;
      let elapsed = 0;
      /** 0 fully frosted, 1 fully clear. */
      let melt = 0;
      let held = 0;
      let seeded = false;
      let painted = "";

      // A deterministic stream. `Math.random` would make a resize rebuild a
      // different crystal than the one on screen, and the catch-up would be
      // visible as the frost rearranging itself.
      let rngState = 0x2f6e2b1 >>> 0;
      const rnd = () => {
        rngState ^= rngState << 13;
        rngState ^= rngState >>> 17;
        rngState ^= rngState << 5;
        rngState >>>= 0;
        return rngState / 4294967296;
      };

      const rasterMask = () => {
        const outer = container.getBoundingClientRect();
        const box = span.getBoundingClientRect();
        if (box.width < 1 || outer.width < 1) return false;

        gw = Math.max(4, Math.ceil(outer.width / CELL));
        gh = Math.max(4, Math.ceil(outer.height / CELL));
        mask.width = gw;
        mask.height = gh;
        const mctx = mask.getContext("2d", { willReadFrequently: true });
        if (!mctx) return false;

        const style = getComputedStyle(span);
        const size = parseFloat(style.fontSize) || 16;
        const scale = 1 / CELL;

        mctx.clearRect(0, 0, gw, gh);
        mctx.font = `${style.fontStyle} ${style.fontWeight} ${size * scale}px ${style.fontFamily}`;
        if ("letterSpacing" in mctx) {
          const sp = style.letterSpacing === "normal" ? 0 : parseFloat(style.letterSpacing) || 0;
          mctx.letterSpacing = `${sp * scale}px`;
        }
        mctx.textAlign = "left";
        mctx.textBaseline = "alphabetic";
        mctx.fillStyle = "#fff";

        // The baseline is derived the way the browser derives it — half-leading
        // plus the font's own ascent — rather than guessed from the box centre.
        // Centring instead puts the ice a few pixels off the glyphs, which reads
        // as a rendering bug rather than as frost.
        const m = mctx.measureText(text);
        const asc = m.fontBoundingBoxAscent || size * scale * 0.8;
        const desc = m.fontBoundingBoxDescent || size * scale * 0.2;
        const lineH = box.height * scale;
        const baseline = (box.top - outer.top) * scale + (lineH - (asc + desc)) / 2 + asc;

        mctx.fillText(text, (box.left - outer.left) * scale, baseline);

        const data = mctx.getImageData(0, 0, gw, gh).data;
        const n = gw * gh;
        if (cover.length !== n) {
          cover = new Uint8Array(n);
          taken = new Uint8Array(n);
          edges = new Int32Array(n);
        }
        for (let i = 0; i < n; i++) cover[i] = data[i * 4 + 3];

        // Edge cells: inside the ink, but with open ground next door. Frost
        // starts at a boundary, never in the middle of a stem.
        edgeCount = 0;
        for (let y = 1; y < gh - 1; y++) {
          for (let x = 1; x < gw - 1; x++) {
            const i = y * gw + x;
            if (cover[i] < 110) continue;
            if (
              cover[i - 1] < 110 ||
              cover[i + 1] < 110 ||
              cover[i - gw] < 110 ||
              cover[i + gw] < 110
            ) {
              edges[edgeCount++] = i;
            }
          }
        }
        return edgeCount > 0;
      };

      const reset = () => {
        taken.fill(0);
        tips = [];
        glints = [];
        steps = 0;
        rngState = 0x2f6e2b1 >>> 0;
        fctx.setTransform(1, 0, 0, 1, 0, 0);
        fctx.clearRect(0, 0, frost.width, frost.height);
        fctx.setTransform(dprNow, 0, 0, dprNow, 0, 0);

        const want = Math.max(1, Math.round(live.current.seeds));
        for (let s = 0; s < want && edgeCount > 0; s++) {
          const i = edges[Math.floor(rnd() * edgeCount)];
          const x = i % gw;
          const y = Math.floor(i / gw);

          // Aimed inward, along the coverage gradient. A seed sits on an edge by
          // definition, so a uniformly random heading sends half the population
          // straight off the letter to spend its overhang budget and die in the
          // first few steps — which is why the crystal used to stall as a fringe
          // instead of taking the glyph.
          const gx =
            (cover[i + 1] ?? 0) - (cover[i - 1] ?? 0);
          const gy =
            (cover[i + gw] ?? 0) - (cover[i - gw] ?? 0);
          const dir =
            gx === 0 && gy === 0
              ? rnd() * Math.PI * 2
              : Math.atan2(gy, gx) + (rnd() - 0.5) * 1.1;

          tips.push({ x, y, dir, out: 0 });
        }
        seeded = tips.length > 0;
      };

      const advance = (budget: number) => {
        const l = live.current;
        if (!tips.length) return;

        const cap = Math.max(24, Math.round(l.density * 400));
        // Six-fold habit. Quantising the fork angle is the difference between a
        // crystal and a bush — real ice branches at fixed angles because the
        // lattice has them, and free angles read as mould.
        const FORK = Math.PI / 3;

        // Colour and relief are baked into the bitmap rather than tinted on the
        // way out. One batched stroke carries the shadow for every segment in
        // the batch, so the relief is free — and the composite becomes a single
        // blit instead of a filter pass and a source-in fill every frame.
        fctx.strokeStyle = l.frostColor;
        fctx.shadowColor = "rgba(4, 12, 24, 0.95)";
        fctx.shadowBlur = RELIEF;
        fctx.lineWidth = 1;
        fctx.lineCap = "round";
        fctx.beginPath();

        let drawn = 0;
        for (let n = 0; n < budget && tips.length; n++) {
          const ti = steps % tips.length;
          const tip = tips[ti];

          tip.dir += (rnd() - 0.5) * JITTER;
          const nx = tip.x + Math.cos(tip.dir) * STEP;
          const ny = tip.y + Math.sin(tip.dir) * STEP;
          steps++;

          const gx = Math.round(nx);
          const gy = Math.round(ny);
          if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) {
            tips.splice(ti, 1);
            continue;
          }

          const idx = gy * gw + gx;

          // Overhang is allowed but spent. A tip that leaves the letter has a
          // handful of steps to find ink again before it dies, which fringes the
          // glyph edge without letting anything run off into open space.
          if (cover[idx] >= 90) {
            tip.out = 0;
          } else {
            if (++tip.out > OVERHANG) {
              tips.splice(ti, 1);
              continue;
            }
            // Steered back toward the ink rather than merely tolerated. Frost
            // creeps *along* a surface, and a glyph stem is only a few cells
            // wide — a tip that just wanders dies the moment it crosses one, so
            // the crystal never gets past a few whiskers. Turning it back at the
            // boundary is both what ice does and what makes the letters fill.
            const gx = (cover[idx + 1] ?? 0) - (cover[idx - 1] ?? 0);
            const gy = (cover[idx + gw] ?? 0) - (cover[idx - gw] ?? 0);
            if (gx !== 0 || gy !== 0) {
              let turn = Math.atan2(gy, gx) - tip.dir;
              while (turn > Math.PI) turn -= Math.PI * 2;
              while (turn < -Math.PI) turn += Math.PI * 2;
              tip.dir += turn * STEER;
            }
          }

          if (taken[idx] > CROSSINGS) {
            tips.splice(ti, 1);
            continue;
          }
          taken[idx]++;

          fctx.moveTo(tip.x * CELL, tip.y * CELL);
          fctx.lineTo(nx * CELL, ny * CELL);
          drawn++;

          tip.x = nx;
          tip.y = ny;

          if (glints.length < 220 && rnd() < 0.02) {
            glints.push(nx * CELL, ny * CELL);
          }

          if (tips.length < cap && rnd() < l.branching * 0.07) {
            tips.push({
              x: nx,
              y: ny,
              dir: tip.dir + (rnd() < 0.5 ? FORK : -FORK),
              out: tip.out,
            });
          }
        }

        if (drawn) fctx.stroke();
      };

      measureRef.current = ({ width: w, height: h, dpr, bufferWidth, bufferHeight }) => {
        if (w < 1 || h < 1) return;
        width = w;
        height = h;
        dprNow = dpr;

        canvas.width = bufferWidth;
        canvas.height = bufferHeight;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        frost.width = bufferWidth;
        frost.height = bufferHeight;

        if (!rasterMask()) return;

        // The crystal is rebuilt at the new size and fast-forwarded to the
        // coverage it had, rather than left blank. A paused component that goes
        // clear on a window resize reads as broken.
        const had = steps;
        reset();
        if (had > 0) advance(Math.min(had, CATCHUP_MAX));
      };

      drawRef.current = (dt) => {
        const l = live.current;
        if (width < 1 || !cover.length) return;
        if (!seeded && edgeCount > 0) reset();

        // The colour lives in the bitmap, so changing it regrows the crystal.
        // The random stream is re-seeded by `reset`, so what comes back is the
        // same ice in a new colour rather than a different frost every time the
        // swatch is dragged.
        if (painted !== l.frostColor) {
          painted = l.frostColor;
          const had = steps;
          reset();
          if (had > 0) advance(Math.min(had, CATCHUP_MAX));
        }

        elapsed = (elapsed + dt) % 3600;

        const growing = () => advance(Math.round(l.growth * RATE * dt));
        const rate = Math.max(l.thaw, 0.05);
        const complete = tips.length === 0 && steps > 0;

        if (l.reducedMotion) {
          // One still frame at full freeze: run the whole crystal out at once
          // rather than showing an arbitrary moment of a growth nobody asked to
          // watch.
          if (!complete) advance(CATCHUP_MAX);
          melt = 0;
        } else if (l.mode === "loop") {
          if (!complete) {
            growing();
          } else if (held < l.hold) {
            held += dt;
          } else {
            melt += rate * dt;
            if (melt >= 1) {
              melt = 0;
              held = 0;
              reset();
            }
          }
        } else if (l.mode === "hover") {
          if (engaged.current) {
            melt = Math.min(1, melt + rate * dt);
          } else {
            if (melt >= 1) {
              melt = 0;
              reset();
            } else {
              melt = Math.max(0, melt - rate * dt);
            }
            if (!complete) growing();
          }
        } else {
          if (engaged.current) {
            melt = Math.max(0, melt - rate * 2 * dt);
            if (!complete) growing();
          } else {
            melt = Math.min(1, melt + rate * dt);
            if (melt >= 1 && steps > 0) reset();
          }
        }

        ctx.clearRect(0, 0, width, height);

        const opacity = 1 - melt;
        if (opacity <= 0.001) return;

        // The frost is a white bitmap tinted on the way out, so one colour
        // control repaints the whole crystal without touching a single stored
        // segment.
        // One blit. The crystal already carries its own colour and its own
        // relief, so the thaw is nothing but the alpha it is drawn at.
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = opacity;
        ctx.drawImage(frost, 0, 0);
        ctx.restore();

        if (l.sparkle > 0.01 && glints.length) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = "#ffffff";
          for (let i = 0; i < glints.length; i += 2) {
            const phase = i * 1.37;
            const tw = Math.sin(elapsed * 2.6 + phase) * 0.5 + 0.5;
            const a = Math.pow(tw, 6) * l.sparkle * opacity;
            if (a < 0.02) continue;
            ctx.globalAlpha = a;
            ctx.fillRect(glints[i] - 0.75, glints[i + 1] - 0.75, 1.5, 1.5);
          }
          ctx.restore();
        }
      };

      // The mask is sampled once per layout and held, so measuring against a
      // fallback face is not a flash that resolves — it is frost permanently
      // growing on the wrong letter shapes.
      let alive = true;
      const style = getComputedStyle(span);
      const size = parseFloat(style.fontSize) || 16;
      Promise.resolve()
        .then(() => document.fonts.load(`${style.fontWeight} ${size}px ${style.fontFamily}`))
        .then(() => document.fonts.ready)
        .then(() => {
          if (!alive) return;
          // Re-measures against the real face, which rebuilds the mask and
          // regrows the crystal on the glyphs the page actually shipped.
          loop.resize();
        })
        .catch(() => {});

      loop.resize();
      loop.start();

      return () => {
        alive = false;
        drawRef.current = null;
        measureRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [text]);

    const engage = () => {
      if (reducedMotion) return;
      engaged.current = true;
      loop.start();
    };
    const release = () => {
      engaged.current = false;
      loop.start();
    };

    const hover = mode === "hover";
    const held = mode === "hold";

    return (
      <div
        ref={containerRef}
        className={`relative inline-block ${className ?? "font-display text-[clamp(2.5rem,11vw,6.5rem)] leading-none font-extrabold tracking-tight"}`}
        onPointerEnter={hover ? engage : undefined}
        onPointerLeave={hover || held ? release : undefined}
        onPointerDown={held ? engage : undefined}
        onPointerUp={held ? release : undefined}
        onPointerCancel={release}
      >
        {/* The word, untouched. The overlay is ice and nothing else, which is
            why the thaw needs no redraw and the type is never not text. */}
        <span
          ref={textRef}
          className="relative block whitespace-pre"
          style={{ color: baseColor }}
        >
          {text}
        </span>
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 block"
        />
      </div>
    );
  },
);

Rime.displayName = "Rime";

export default Rime;
