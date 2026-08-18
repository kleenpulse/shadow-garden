"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A neon sign, with everything that is wrong with a neon sign.
//
// Three decisions carry the component.
//
// **The glow is baked once, per letter.** A tube is a fixed shape whose only
// changing property is how brightly it is lit, so the expensive part — several
// blurred stroke passes and a hot core — is rendered into one small offscreen
// sprite per character at raster time. A frame is then N `drawImage` calls with
// an alpha each. Layered `text-shadow` would repaint the whole halo every frame
// and would need a span per letter, which is the thing this component is
// specifically avoiding.
//
// **The letters are strokes, not fills.** `strokeText` traces the outline of the
// glyph, which is what a bent glass tube actually is. Filling gives glowing
// text; stroking gives a sign.
//
// **The real word stays in the DOM.** The canvas is a transparent overlay with
// pointer events off and the actual string sits underneath it at
// `color: transparent`, so the sign is selectable, searchable and read aloud
// correctly — and it is the span, not the canvas, that decides the layout.
export type NeonMode = "loop" | "hover" | "steady";

interface NeonProps {
  /** The word. Not a tuned control — the bench passes a demo string. */
  text?: string;
  /** What drives the ignition. */
  mode?: NeonMode;
  /** The gas. */
  tubeColor?: string;
  /** Halo spread in pixels. Also reserves the layout room the halo needs. */
  glow?: number;
  /** How white-hot the centre of the tube runs against the saturated halo. */
  core?: number;
  /** Seconds from cold to steady. Each letter settles at its own point inside
   *  this window, which is what makes the start-up read as a real sign. */
  ignition?: number;
  /** Seconds lit before the sign cuts out and starts again. */
  cycle?: number;
  /** Depth of the mains hum on the steady state. */
  hum?: number;
  /** How often a tube gives up for a moment. */
  flicker?: number;
  /** Show the dark glass when a tube is unlit. */
  offGlass?: boolean;
  /** Halt the loop. The sign holds whatever it was doing. */
  paused?: boolean;
  /** Lit, level, and completely still. */
  reducedMotion?: boolean;
  className?: string;
}

/** Supersample for the sprite bake. The tube is a thin stroke under a wide blur;
 *  at 1x the core aliases into a dotted line at exactly the sizes a sign is
 *  read at. */
const SS = 2;

/** Halo room around the word, as a multiple of `glow`, reserved as real padding
 *  on the root. A halo that leaves its box gets painted over by whatever the
 *  page put next to it. */
const PAD = 2;

/** Tube wall thickness as a share of the font size. */
const TUBE = 0.055;

/** Seconds per sputter window. One roll per window decides whether a tube dies
 *  in it and which one — deterministic, so nothing has to be remembered between
 *  frames and a resize cannot resurrect a letter mid-failure. */
const SPUTTER_WINDOW = 1.7;

/** Seconds of dark between cycles. Long enough to register as off, short enough
 *  that nobody leaves. */
const DARK = 1.2;

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

interface Tube {
  /** Sprite holding the lit tube, glow and all. */
  on: HTMLCanvasElement | null;
  /** Sprite holding the dark glass. */
  off: HTMLCanvasElement | null;
  /** Where the sprite lands, in CSS pixels relative to the root. */
  x: number;
  y: number;
  w: number;
  h: number;
}

const Neon = memo(
  ({
    text = "OPEN",
    mode = "loop",
    tubeColor = "#a855f7",
    glow = 18,
    core = 0.85,
    ignition = 1.6,
    cycle = 7,
    hum = 0.18,
    flicker = 0.3,
    offGlass = true,
    paused = false,
    reducedMotion = false,
    className,
  }: NeonProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawRef = useRef<((dt: number) => void | false) | null>(null);
    const measureRef = useRef<((m: Metrics) => void) | null>(null);
    const engaged = useRef(false);

    const [fallback, setFallback] = useState(false);

    const loop = useAnimationLoop({
      target: containerRef,
      halted: paused || reducedMotion,
      dpr: "auto",
      onResize: (metrics) => measureRef.current?.(metrics),
      onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
    });

    const live = useRef({
      mode, tubeColor, glow, core, ignition, cycle, hum, flicker, offGlass,
      reducedMotion,
    });
    live.current = {
      mode, tubeColor, glow, core, ignition, cycle, hum, flicker, offGlass,
      reducedMotion,
    };

    const state = useRef({
      ctx: null as CanvasRenderingContext2D | null,
      tubes: [] as Tube[],
      key: "",
      dpr: 1,
      w: 0,
      h: 0,
      elapsed: 0,
      /** Seconds of power delivered so far. Not a tween — the ignition is a
       *  process, so pulling the pointer away cuts it rather than reversing it. */
      lit: 0,
    });

    useEffect(() => {
      const container = containerRef.current;
      const span = textRef.current;
      const canvas = canvasRef.current;
      if (fallback || !container || !span || !canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setFallback(true);
        return;
      }
      state.current.ctx = ctx;

      const bake = () => {
        const s = state.current;
        const l = live.current;
        const outer = container.getBoundingClientRect();
        const box = span.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) return;

        const style = getComputedStyle(span);
        const size = parseFloat(style.fontSize) || 16;
        const font = `${style.fontStyle} ${style.fontWeight} ${size * SS}px ${style.fontFamily}`;
        const spacing =
          style.letterSpacing === "normal" ? 0 : parseFloat(style.letterSpacing) || 0;

        // Measured on a scratch context in the same units the sprites are baked
        // in, so a sprite can never be a fraction of a pixel off from where the
        // layout says its letter is.
        const probe = document.createElement("canvas").getContext("2d");
        if (!probe) return;
        probe.font = font;
        if ("letterSpacing" in probe) probe.letterSpacing = `${spacing * SS}px`;

        // Prefix widths rather than per-character advances: kerning only exists
        // between a pair, so measuring characters alone drifts the tail of a
        // long word visibly off its own glyphs.
        const prefix: number[] = [0];
        for (let i = 1; i <= text.length; i++) {
          prefix.push(probe.measureText(text.slice(0, i)).width / SS);
        }

        const pad = l.glow * PAD;
        const [r, g, b] = hexToRgb(l.tubeColor);
        const tube = `rgb(${r},${g},${b})`;
        // The core runs toward white without ever fully reaching it — a pure
        // white centre reads as a lightbulb, not as excited gas.
        const cr = Math.round(r + (255 - r) * l.core * 0.92);
        const cg = Math.round(g + (255 - g) * l.core * 0.92);
        const cb = Math.round(b + (255 - b) * l.core * 0.92);
        const hot = `rgb(${cr},${cg},${cb})`;

        const h = box.height;
        const tubes: Tube[] = [];

        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          const w = prefix[i + 1] - prefix[i];
          const t: Tube = {
            on: null,
            off: null,
            x: box.left - outer.left + prefix[i] - pad,
            y: box.top - outer.top - pad,
            w: w + pad * 2,
            h: h + pad * 2,
          };

          if (ch.trim() !== "") {
            const sw = Math.max(2, Math.round(t.w * SS));
            const sh = Math.max(2, Math.round(t.h * SS));

            const paint = (
              passes: Array<[number, number, string]>,
            ): HTMLCanvasElement | null => {
              const off = document.createElement("canvas");
              off.width = sw;
              off.height = sh;
              const c = off.getContext("2d");
              if (!c) return null;
              c.font = font;
              if ("letterSpacing" in c) c.letterSpacing = `${spacing * SS}px`;
              c.textAlign = "center";
              c.textBaseline = "middle";
              c.lineJoin = "round";
              c.lineCap = "round";
              // Additive, so overlapping passes pile into a hot centre instead
              // of the last one painting over the halo that came before it.
              c.globalCompositeOperation = "lighter";
              // Centred on the advance box, not on the glyph's ink, so a comma
              // and a capital both land where the layout put them.
              const cx = sw / 2 - (spacing * SS) / 2;
              const cy = sh / 2;
              for (const [blur, width, color] of passes) {
                c.shadowColor = color;
                c.shadowBlur = blur;
                c.strokeStyle = color;
                c.lineWidth = Math.max(1, size * SS * width);
                c.strokeText(ch, cx, cy);
              }
              return off;
            };

            t.on = paint([
              [l.glow * SS * 2.0, TUBE, tube],
              [l.glow * SS * 1.0, TUBE, tube],
              [l.glow * SS * 0.45, TUBE * 0.75, tube],
              [l.glow * SS * 0.18, TUBE * 0.42, hot],
            ]);
            // Unlit glass: no shadow at all. A dark tube that still glows is the
            // tell that the sign was never really off.
            t.off = paint([[0, TUBE, "rgba(255,255,255,0.13)"]]);
          }

          tubes.push(t);
        }

        s.tubes = tubes;
      };

      const bakeKey = () => {
        const l = live.current;
        const s = state.current;
        return `${text}|${l.tubeColor}|${l.glow}|${l.core}|${s.w}x${s.h}`;
      };

      measureRef.current = ({ width, height, dpr, bufferWidth, bufferHeight }) => {
        const s = state.current;
        canvas.width = bufferWidth;
        canvas.height = bufferHeight;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        s.dpr = dpr;
        s.w = width;
        s.h = height;
        // Positions are measured against the box, so a resize invalidates the
        // bake rather than merely rescaling it.
        s.key = "";
      };

      drawRef.current = (dt) => {
        const s = state.current;
        const l = live.current;
        if (s.w < 1) return;

        const key = bakeKey();
        if (key !== s.key) {
          s.key = key;
          bake();
        }

        s.elapsed = (s.elapsed + dt) % 3600;
        const t = s.elapsed;
        const n = s.tubes.length;

        // How much power the sign is getting, and for how long.
        let ig: number;
        if (l.reducedMotion || l.mode === "steady") {
          ig = 1;
        } else if (l.mode === "loop") {
          const period = Math.max(l.cycle, 0.5) + DARK;
          const at = t % period;
          ig = at < Math.max(l.cycle, 0.5) ? at / Math.max(l.ignition, 0.05) : 0;
        } else {
          // A sign does not fade out. Cutting the power kills it in a quarter of
          // a second regardless of how long it took to warm up.
          s.lit = engaged.current
            ? s.lit + dt
            : Math.max(0, s.lit - dt * Math.max(l.ignition, 0.05) * 4);
          ig = s.lit / Math.max(l.ignition, 0.05);
        }
        ig = Math.min(ig, 1);

        // One roll per window picks whether a tube fails and which one.
        let victim = -1;
        if (!l.reducedMotion && l.flicker > 0 && n > 0) {
          const win = Math.floor(t / SPUTTER_WINDOW);
          if (hash(win * 7.31) < l.flicker * 0.55) {
            victim = Math.floor(hash(win * 13.17) * n);
          }
        }
        const inBurst = (t % SPUTTER_WINDOW) / SPUTTER_WINDOW < 0.3;

        ctx.clearRect(0, 0, s.w, s.h);
        ctx.globalCompositeOperation = "lighter";

        for (let i = 0; i < n; i++) {
          const tube = s.tubes[i];
          if (!tube.on) continue;

          // Each tube settles at its own moment inside the ignition window. A
          // sign whose letters all steady together reads as a fade.
          const settle = 0.28 + hash(i * 3.7 + 1.1) * 0.68;
          let brightness: number;

          if (ig <= 0) {
            brightness = 0;
          } else if (ig < settle) {
            // Striking. The chance of holding climbs as the tube warms, so the
            // stutter thins out on its own rather than stopping on a timer.
            const odds = Math.pow(ig / settle, 1.7);
            brightness = hash(i * 17.3 + Math.floor(t * 26) * 1.7) < odds ? 1 : 0.06;
          } else {
            const phase = hash(i * 5.3) * 6.283;
            const h1 = Math.sin(t * 12.566 + phase);
            const h2 = Math.sin(t * 3.1 + phase * 2.1);
            brightness = 1 - l.hum * (0.5 + 0.5 * h1) * 0.4 - l.hum * (0.5 + 0.5 * h2) * 0.18;
          }

          if (i === victim && inBurst && ig >= settle) {
            brightness *= hash(i * 2.9 + Math.floor(t * 34) * 3.1) < 0.42 ? 1 : 0.08;
          }

          if (l.offGlass && tube.off && brightness < 0.9) {
            ctx.globalAlpha = 1 - brightness;
            ctx.drawImage(tube.off, tube.x, tube.y, tube.w, tube.h);
          }
          if (brightness > 0.01) {
            ctx.globalAlpha = brightness;
            ctx.drawImage(tube.on, tube.x, tube.y, tube.w, tube.h);
          }
        }

        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      };

      // The bake samples the glyphs once and holds the sprites, so measuring
      // against a fallback face is not a flash that resolves — it is a
      // permanently wrong sign with plausible spacing.
      let alive = true;
      const style = getComputedStyle(span);
      const size = parseFloat(style.fontSize) || 16;
      Promise.resolve()
        .then(() => document.fonts.load(`${style.fontWeight} ${size}px ${style.fontFamily}`))
        .then(() => document.fonts.ready)
        .then(() => {
          if (!alive) return;
          state.current.key = "";
          loop.paint();
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
    }, [fallback, text]);

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

    return (
      <div
        ref={containerRef}
        // Real layout, not overflow. The halo is `glow` pixels of spread in
        // every direction and it has to be inside the box, or the sign paints
        // over whatever the page put beside it.
        style={{ padding: `${glow * PAD}px` }}
        // The default size keeps its viewport term genuinely in play between the
        // clamp's two ends, rather than pinning at the maximum on any desktop —
        // the root is an inline-block sized by its own text, so a sign that
        // never changes font never changes box, and never resizes its canvas.
        className={`relative inline-block ${className ?? "font-display text-[clamp(2.25rem,6vw,5.5rem)] leading-none font-bold tracking-[0.1em]"}`}
        onPointerEnter={hover ? engage : undefined}
        onPointerLeave={hover ? release : undefined}
        onPointerCancel={hover ? release : undefined}
      >
        {/* The word itself. Transparent rather than hidden: it holds the box the
            sprites are positioned against, it is what a screen reader reads, and
            it is what a selection actually selects. */}
        <span
          ref={textRef}
          className="relative block whitespace-pre"
          style={{ color: fallback ? tubeColor : "transparent" }}
        >
          {text}
        </span>
        <canvas
          ref={canvasRef}
          // Decoration. Every pointer and every selection has to reach the real
          // string underneath it.
          className="pointer-events-none absolute inset-0 block"
        />
      </div>
    );
  },
);

Neon.displayName = "Neon";

export default Neon;
