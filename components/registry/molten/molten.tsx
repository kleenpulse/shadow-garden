"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle, Texture } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// Type that melts — letters sag, string, and fuse into each other where they
// touch, then draw themselves back up.
//
// The merge is the whole thing, and it is why this is a field rather than a
// transform. Sliding two glyphs together with CSS gives you two glyphs
// overlapping: the outlines cross and you can see the join. Here the glyphs are
// a coverage field, and ink is `smoothstep(threshold ± softness)` over it — so
// two stems approaching each other raise the coverage between them past the cut
// before either has arrived, and one surface closes over both. Nothing is
// composited; there was only ever one shape.
//
// Three decisions carry the component.
//
// **The real text stays in the DOM.** The canvas is a transparent overlay with
// pointer-events off, and underneath it is an ordinary span holding the actual
// string at `color: transparent`. The word is selectable, searchable, and read
// aloud correctly while it melts, and the span is also what *drives* the layout
// — the raster reads its computed font, so the canvas mirrors whatever
// typography the page already set rather than imposing its own.
//
// **No distance transform.** A jump-flood SDF is two ping-pong targets and
// log2(n) passes to produce an exact distance that gets thresholded and
// smoothstepped anyway. The alpha channel of the rasterised glyph is already a
// bounded, antialiased coverage field, which is all the cut needs.
//
// **Sample backwards.** Nothing is pushed anywhere. For each output pixel the
// shader asks where that material came from and reads the glyph there, so the
// deformation costs one texture fetch and can never tear or leave a gap the way
// a forward scatter does.
export type MoltenMode = "loop" | "hover" | "hold";

interface MoltenProps {
  /** The word. Not a tuned control — the bench passes a demo string. */
  text?: string;
  /** What drives the melt. */
  mode?: MoltenMode;
  /** How far the glyphs sag at the bottom of the cycle. */
  melt?: number;
  /** How much the material resists — high means the top has barely moved while
   *  the bottom is already stringing. */
  viscosity?: number;
  /** Seconds for one full sag and reform. */
  cycle?: number;
  /** Where the coverage field is cut into ink. */
  threshold?: number;
  /** Width of the cut. This is what fuses two approaching stems. */
  softness?: number;
  /** Vertical elongation of a falling stroke. */
  drip?: number;
  /** Lateral noise on the displacement. */
  wobble?: number;
  /** How far each column lags the one to its left. */
  phase?: number;
  /** The type at rest. */
  baseColor?: string;
  /** Mixed in by local displacement, so what moved most is hottest. */
  meltColor?: string;
  /** Halt the loop. The word stays exactly as it is. */
  paused?: boolean;
  /** The word never melts. It is set solid and stays legible. */
  reducedMotion?: boolean;
  className?: string;
}

/** Extra canvas below the text box, as a share of the text height, for the melt
 *  to fall into. The glyph is rasterised into the same taller box, so a drip
 *  that leaves the line box is still inside the texture being sampled. */
const HEADROOM = 0.85;

/** Share of the canvas the text band occupies — the other part is HEADROOM. */
const BAND = 1 / (1 + HEADROOM);

/** Supersample factor for the glyph raster. The cut is a smoothstep over
 *  coverage, so the source has to carry more gradient than the screen does or
 *  the edge of the melt goes stair-stepped exactly where it is most looked at. */
const SS = 2;

/** Share of the cycle spent melting. Deliberately more than half: a symmetric
 *  cycle reads as a loop, and a slow fall with a quicker recovery reads as a
 *  material. */
const RISE = 0.64;

const hexToRgb01 = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const vertex = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const fragment = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uGlyph;
uniform float uTime;
uniform float uProgress;
uniform float uMelt;
uniform float uViscosity;
uniform float uThreshold;
uniform float uSoftness;
uniform float uDrip;
uniform float uWobble;
uniform float uPhase;
uniform float uBand;
uniform vec3  uInk;
uniform vec3  uHot;

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.56);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
    f.y);
}

void main() {
  vec2 uv = vUv;

  // The melt travels left to right. Scaling progress by (1 + uPhase) before the
  // lag is subtracted keeps the rightmost column still reaching 1 — without it,
  // raising the phase would quietly stop the end of the word ever melting.
  float lag = clamp(uProgress * (1.0 + uPhase) - uv.x * uPhase, 0.0, 1.0);

  // How far this column has run. Two octaves, because one is not enough: a
  // single frequency gives every column a similar amount and the line comes down
  // as a slab with a wavy hem. Real dripping is uneven at more than one scale —
  // a broad lean across the word, and within it individual runs that go much
  // further than their neighbours. Noise coordinates stay small and time is
  // reduced by the caller, so the field keeps its precision over a long session.
  float n = valueNoise(vec2(uv.x * 3.0, uTime * 0.17)) * 0.62
          + valueNoise(vec2(uv.x * 11.0 + 7.3, uTime * 0.31)) * 0.38;
  float drop = uMelt * lag * mix(1.0, 0.18 + 1.5 * n, uWobble);

  // The deformation is a per-column vertical stretch anchored at the cap line,
  // and it has to stay MONOTONIC in y. The obvious version — displace the sample
  // by a sag that grows downward — is not: two different output rows then resolve
  // to the same source row, so every horizontal stroke smears into a vertical
  // bar and the word turns into a picket fence. Dividing the depth instead maps
  // each output row to exactly one source row, so strokes elongate rather than
  // duplicate.
  float d = 1.0 - uv.y;
  // Depth normalised against the text band, so it keeps meaning past the
  // baseline where the drip zone is.
  float dn = clamp(d / max(uBand, 1e-3), 0.0, 1.6);

  float local = 1.0 + drop * mix(0.5, 2.2 * dn, uViscosity) + drop * uDrip * 1.4;
  vec2 s = vec2(uv.x, 1.0 - d / local);

  s.x += (valueNoise(vec2(uv.y * 6.0 + 3.1, uTime * 0.19)) - 0.5) * uWobble * 0.012 * lag;

  // Blur, then cut. This is the whole merge: thresholding a blurred coverage
  // field is a metaball test, so two stems whose blurred haloes overlap resolve
  // to one closed outline rather than two shapes crossing. The blur is bought
  // from the mip chain and costs one fetch instead of a kernel.
  //
  // It is weighted by depth as well as by progress, and that is what separates
  // melting from stretching. A uniform blur elongates the whole letter and the
  // word just reads as a condensed face; blurring hardest at the bottom lets the
  // cap line stay crisp and legible while the feet round off, run together and
  // pool — which is the direction real material actually fails.
  float lod = drop * (1.1 + 3.6 * dn);
  float coverage = textureLod(uGlyph, s, lod).a;

  float ink = smoothstep(uThreshold - uSoftness, uThreshold + uSoftness, coverage);
  vec3 col = mix(uInk, uHot, clamp(drop * (0.45 + 1.3 * dn) + lag * 0.1, 0.0, 1.0));

  // Premultiplied. The canvas sits over live page content, and straight alpha
  // would fringe every edge with whatever the clear colour happened to be.
  fragColor = vec4(col * ink, ink);
}`;

const Molten = memo(
  ({
    text = "MOLTEN",
    mode = "loop",
    melt = 0.7,
    viscosity = 0.55,
    cycle = 5.2,
    threshold = 0.5,
    softness = 0.06,
    drip = 0.35,
    wobble = 0.5,
    phase = 0.18,
    baseColor = "#e9e6f2",
    meltColor = "#a855f7",
    paused = false,
    reducedMotion = false,
    className,
  }: MoltenProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);
    const drawRef = useRef<((dt: number) => void | false) | null>(null);
    const measureRef = useRef<((m: Metrics) => void) | null>(null);
    const rasterRef = useRef<(() => void) | null>(null);
    const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(null);
    const active = useRef(false);

    const [fallback, setFallback] = useState(false);

    const loop = useAnimationLoop({
      target: containerRef,
      halted: paused || reducedMotion,
      dpr: "auto",
      onResize: (metrics) => measureRef.current?.(metrics),
      onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
      gl: () => glRef.current,
    });

    const live = useRef({
      mode, melt, viscosity, cycle, threshold, softness, drip, wobble, phase,
      baseColor, meltColor, reducedMotion,
    });
    live.current = {
      mode, melt, viscosity, cycle, threshold, softness, drip, wobble, phase,
      baseColor, meltColor, reducedMotion,
    };

    useEffect(() => {
      const container = containerRef.current;
      const span = textRef.current;
      if (fallback || !container || !span) return;

      let renderer: Renderer;
      try {
        renderer = new Renderer({
          webgl: 2,
          alpha: true,
          premultipliedAlpha: true,
          antialias: false,
          dpr: Math.min(window.devicePixelRatio || 1, 2),
        });
        if (!(renderer.gl instanceof WebGL2RenderingContext)) {
          throw new Error("Molten requires WebGL2");
        }
      } catch {
        setFallback(true);
        return;
      }

      const glc = renderer.gl;
      glRef.current = glc;
      glc.clearColor(0, 0, 0, 0);

      const canvas = glc.canvas as HTMLCanvasElement;
      canvas.style.display = "block";
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      // The overlay is decoration; every pointer and every text selection has to
      // reach the real string underneath it.
      canvas.style.pointerEvents = "none";
      container.appendChild(canvas);

      const off = document.createElement("canvas");

      const glyph = new Texture(glc, {
        // The mip chain is not an optimisation here, it is the merge: the shader
        // reads an explicit level that grows as the material yields, so blurring
        // the coverage field before the cut costs one fetch instead of a kernel.
        // Level 0 is what gets read at rest, so the type stays exactly as sharp
        // as the font until it starts to move.
        generateMipmaps: true,
        minFilter: glc.LINEAR_MIPMAP_LINEAR,
        magFilter: glc.LINEAR,
        wrapS: glc.CLAMP_TO_EDGE,
        wrapT: glc.CLAMP_TO_EDGE,
      });

      const geometry = new Triangle(glc);
      const program = new Program(glc, {
        vertex,
        fragment,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        uniforms: {
          uGlyph: { value: glyph },
          uTime: { value: 0 },
          uProgress: { value: 0 },
          uMelt: { value: melt },
          uViscosity: { value: viscosity },
          uThreshold: { value: threshold },
          uSoftness: { value: softness },
          uDrip: { value: drip },
          uWobble: { value: wobble },
          uPhase: { value: phase },
          uBand: { value: BAND },
          uInk: { value: new Float32Array(hexToRgb01(baseColor)) },
          uHot: { value: new Float32Array(hexToRgb01(meltColor)) },
        },
      });
      program.setBlendFunc(glc.ONE, glc.ONE_MINUS_SRC_ALPHA);

      const mesh = new Mesh(glc, { geometry, program });
      const u = program.uniforms as Record<string, { value: number | Float32Array | unknown }>;

      const raster = () => {
        const box = span.getBoundingClientRect();
        const outer = container.getBoundingClientRect();
        if (box.width < 1 || box.height < 1 || outer.height < 1) return;
        const style = getComputedStyle(span);
        const size = parseFloat(style.fontSize) || 16;

        // The band is measured, never assumed. The drip headroom is padding on
        // the root in `em`, so its share of the box moves with the line height
        // the page happens to set — a hardcoded constant would put the baseline
        // in the wrong place at any leading but the one it was written against.
        u.uBand.value = Math.min(1, box.height / outer.height);

        const w = Math.max(2, Math.round(box.width * SS));
        const band = Math.max(2, Math.round(box.height * SS));
        const h = Math.max(band + 2, Math.round(outer.height * SS));
        off.width = w;
        off.height = h;

        const ctx = off.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, w, h);
        ctx.font = `${style.fontStyle} ${style.fontWeight} ${size * SS}px ${style.fontFamily}`;
        if ("letterSpacing" in ctx) {
          ctx.letterSpacing = style.letterSpacing === "normal" ? "0px" : `${parseFloat(style.letterSpacing) * SS}px`;
        }
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, w / 2, band / 2);

        glyph.image = off;
        glyph.needsUpdate = true;
      };
      rasterRef.current = raster;

      let elapsed = 0;
      let progress = live.current.reducedMotion ? 0 : 0;

      drawRef.current = (dt) => {
        const l = live.current;

        // Reduced by the caller rather than left to climb: an unbounded uniform
        // outgrows float32's fraction and the noise quantises into visible
        // banding after a few minutes, long after anyone would still be looking
        // for a cause.
        elapsed = (elapsed + dt) % 3600;

        if (l.mode === "loop") {
          const t = (elapsed / Math.max(l.cycle, 0.1)) % 1;
          const x = t < RISE ? t / RISE : 1 - (t - RISE) / (1 - RISE);
          progress = x * x * (3 - 2 * x);
        } else {
          // Critically damped toward the target, and framerate-independent, so
          // pulling the pointer away mid-melt reverses from wherever it got to
          // instead of restarting a tween.
          const target = active.current ? 1 : 0;
          progress += (target - progress) * (1 - Math.exp(-dt * 6));
        }

        u.uTime.value = elapsed;
        u.uProgress.value = progress;
        u.uMelt.value = l.melt;
        u.uViscosity.value = l.viscosity;
        u.uThreshold.value = l.threshold;
        u.uSoftness.value = l.softness;
        u.uDrip.value = l.drip;
        u.uWobble.value = l.wobble;
        u.uPhase.value = l.phase;
        (u.uInk.value as Float32Array).set(hexToRgb01(l.baseColor));
        (u.uHot.value as Float32Array).set(hexToRgb01(l.meltColor));

        renderer.render({ scene: mesh });
      };

      // The loop observes the root, and the root already carries the drip
      // headroom as padding — so the canvas is simply the box, and the melt has
      // somewhere to fall that is inside the layout instead of on top of
      // whatever happens to sit underneath.
      measureRef.current = ({ width, height, dpr }) => {
        renderer.dpr = dpr;
        renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
        raster();
      };

      // The raster has to wait for the webfont. This component samples the
      // glyphs once and holds that texture, so measuring against a fallback face
      // is not a flash that resolves — it is a permanently wrong texture with
      // plausible spacing, which reads as "the type looks a bit off" rather than
      // as a bug.
      let live_ = true;
      const size = parseFloat(getComputedStyle(span).fontSize) || 16;
      const family = getComputedStyle(span).fontFamily;
      const weight = getComputedStyle(span).fontWeight;
      Promise.resolve()
        .then(() => document.fonts.load(`${weight} ${size}px ${family}`))
        .then(() => document.fonts.ready)
        .then(() => {
          if (!live_) return;
          raster();
          loop.paint();
        })
        .catch(() => {});

      loop.resize();
      loop.start();

      return () => {
        live_ = false;
        drawRef.current = null;
        measureRef.current = null;
        rasterRef.current = null;
        if (container.contains(canvas)) container.removeChild(canvas);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fallback, text]);

    useEffect(() => {
      rasterRef.current?.();
      loop.paint();
    }, [text, loop]);

    const engage = () => {
      if (reducedMotion) return;
      active.current = true;
      loop.start();
    };
    const release = () => {
      active.current = false;
      loop.start();
    };

    const hover = mode === "hover";
    const hold = mode === "hold";

    return (
      <div
        ref={containerRef}
        // The headroom is real layout, not overflow. Given `leading-none` the
        // line box is about one em tall, so padding in em reserves the drip zone
        // in proportion to the type at any size — and nothing underneath gets
        // painted over by a canvas that outgrew its box.
        style={{ paddingBottom: `${HEADROOM}em` }}
        className={`relative inline-block ${className ?? "font-display text-[clamp(2.5rem,11vw,6.5rem)] leading-none font-extrabold tracking-tight"}`}
        onPointerEnter={hover ? engage : undefined}
        onPointerLeave={hover || hold ? release : undefined}
        onPointerDown={hold ? engage : undefined}
        onPointerUp={hold ? release : undefined}
        onPointerCancel={release}
      >
        {/* The word itself. Transparent rather than hidden: it holds the line
            box the canvas is sized from, it is what a screen reader reads, and
            it is what a selection actually selects. */}
        <span
          ref={textRef}
          className="relative block whitespace-pre"
          style={{ color: fallback ? baseColor : "transparent" }}
        >
          {text}
        </span>
      </div>
    );
  },
);

Molten.displayName = "Molten";

export default Molten;
