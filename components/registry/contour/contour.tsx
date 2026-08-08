"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// Iso-lines of a drifting height field — a topographic map of terrain that will
// not hold still.
//
// The whole component is the anti-aliasing. Contour lines are `fract(h * levels)`
// and that expression aliases worse than almost anything else you can put on a
// screen: raise `levels` and the spacing walks toward one line per pixel, where
// the sampling grid and the line frequency beat against each other and the frame
// fills with detail that is not in the field. It reads as *more* terrain, which
// is why it survives review — a contour background that aliases is not a lesser
// version of this component, it is a different and worse one wearing its name.
//
// So the line is band-limited against its own screen-space derivative. `fwidth`
// is taken on the *continuous* contour phase, never on `fract` of it — `fract`
// is discontinuous at every terrace edge, which is exactly the pixel row the
// line occupies, and the derivative of a discontinuity is noise. A region that
// outruns Nyquist then fades back to its elevation tint rather than tearing.
// What you see is the terrain, not the sampling. `moire` solves the same problem
// for a rotated lattice and the reasoning there is worth reading first.
//
// Two consequences worth knowing before tuning it:
//
//   - Every derivative is taken ONCE, before any branch. `fwidth` inside
//     divergent control flow is undefined in GLSL ES 3.0, and the major-line
//     test is exactly the kind of branch that would put it there.
//   - The field never translates. It is sampled at an offset that orbits, so the
//     noise coordinates stay bounded for the life of the page. An offset that
//     accumulated would lose float32 mantissa bits over a long session and the
//     terrain would visibly coarsen — the same lesson `moire` records for its
//     phases and `aurora` for its clock.
//
// Deliberately no `touch-action: none`. The pointer raises the ground under it,
// but that is a hover enhancement rather than the mechanism, and a full-bleed
// background that eats page scrolling is a bug.
interface ContourProps {
  /** Feature size of the terrain. Lower is a wider landscape, higher zooms in. */
  scale?: number;
  /** Contour steps across the height range — the vertical resolution of the map. */
  levels?: number;
  /** How hard the field is domain-warped before the lines are cut from it.
   *  Zero is smooth blobs; high folds the terrain back over itself. */
  warp?: number;
  /** Speed of the drift. */
  drift?: number;
  /** Line weight in px. Held in pixels rather than field units, so the map keeps
   *  the same hand at any scale. */
  lineWidth?: number;
  /** Emphasise every Nth line, as a real contour map does. 0 draws them all
   *  alike, which reads as stripes rather than as elevation. */
  majorEvery?: number;
  /** Tint of the band between two lines, by elevation. */
  bandOpacity?: number;
  /** How much the cursor lifts the ground under it. */
  pointerLift?: number;
  inkColor?: string;
  /** The emphasised line. */
  accentColor?: string;
  backgroundColor?: string;
  /** Halt the loop. One still map stays painted. */
  paused?: boolean;
  /** The terrain stops drifting and the pointer stops lifting it. The map is
   *  never hidden — only its motion is withheld. */
  reducedMotion?: boolean;
  className?: string;
}

const hexToRgb01 = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const supportsWebGL2 = () => {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
};

const vertex = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

const fragment = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uResolution;
uniform float uDpr;
uniform vec2  uPhase;
uniform float uScale;
uniform float uLevels;
uniform float uWarp;
uniform float uLineWidth;
uniform float uMajorEvery;
uniform float uBandOpacity;
uniform float uPointerLift;
uniform vec2  uPointer;
uniform vec3  uInk;
uniform vec3  uAccent;
uniform vec3  uBg;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Two octave counts, not one. The warp fields only need enough detail to bend
// the terrain plausibly; the height needs enough to be worth contouring. Running
// both at the height's depth triples the noise cost for something no line ever
// resolves.
float fbm2(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 2; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return v;
}

float fbm4(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return v;
}

float height(vec2 p, vec2 flow, float lift) {
  vec2 q = vec2(fbm2(p + flow), fbm2(p + flow + vec2(5.2, 1.3)));
  float h = fbm4(p + uWarp * 4.0 * q);
  return h + lift;
}

void main() {
  vec2 res = uResolution / uDpr;
  vec2 uv = (gl_FragCoord.xy / uDpr - res * 0.5) / max(res.y, 1.0);

  // The sample offset orbits rather than accumulating — bounded forever, and
  // visually indistinguishable from a drift you would never watch long enough
  // to see repeat.
  vec2 flow = vec2(cos(uPhase.x), sin(uPhase.y)) * 1.6;

  vec2 d = uv - uPointer;
  float lift = uPointerLift * 0.35 * exp(-dot(d, d) * 9.0);

  vec2 p = uv * max(uScale, 0.25);
  float h = height(p, flow, lift);

  // Contour phase. Integers are the lines; k rises with elevation.
  float k = h * max(uLevels, 1.0);

  // Every derivative up front, before the major-line branch below could make the
  // control flow divergent.
  float w = max(fwidth(k), 1e-5);
  float aa = w * 0.5;

  float idx = floor(k + 0.5);
  float dist = abs(k - idx);

  float m = max(uMajorEvery, 1.0);
  float isMajor = mix(0.0, 1.0 - step(0.5, mod(idx, m)), step(1.0, uMajorEvery));
  // The index test asks which terrace this pixel is nearest, and on a steep
  // enough slope the answer changes from pixel to pixel — which paints the
  // accent as speckle rather than as a line. It has to give up before the line
  // does: if you cannot resolve the contours, you cannot tell which of them is
  // the fifth one either.
  isMajor *= 1.0 - smoothstep(0.16, 0.42, w);

  float half_ = uLineWidth * mix(1.0, 2.0, isMajor) * aa;
  float cov = 1.0 - smoothstep(max(half_ - aa, 0.0), half_ + aa, dist);

  // The band limit. Widening the smoothstep alone is not enough: past about a
  // third of a terrace per pixel the line stops being a line, and the widened
  // band just floods the steep flanks to solid ink while the nearest-integer
  // test speckles the index colour across them. Fade the coverage out instead,
  // so a slope too steep to contour falls back to its elevation tint — which is
  // what a paper map does when the interval is wrong for the terrain. Measured
  // at levels 34: solid white ridges and dashed amethyst before, smooth shading
  // after.
  cov *= 1.0 - smoothstep(0.26, 0.60, w);

  float band = clamp(idx / max(uLevels, 1.0), 0.0, 1.0);
  vec3 fill = mix(uBg, uInk, uBandOpacity * band);
  vec3 line = mix(uInk, uAccent, isMajor);

  fragColor = vec4(mix(fill, line, cov), 1.0);
}`;

const Contour = memo(
  ({
    scale = 2.6,
    levels = 14,
    warp = 0.55,
    drift = 0.35,
    lineWidth = 1.4,
    majorEvery = 5,
    bandOpacity = 0.18,
    pointerLift = 0.4,
    inkColor = "#e9e7ef",
    accentColor = "#a855f7",
    backgroundColor = "#0a0b0c",
    paused = false,
    reducedMotion = false,
    className,
  }: ContourProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const drawRef = useRef<((dt: number) => void | false) | null>(null);
    const measureRef = useRef<((m: Metrics) => void) | null>(null);
    const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(null);

    const [fallback, setFallback] = useState(false);

    const loop = useAnimationLoop({
      target: containerRef,
      halted: paused || reducedMotion,
      dpr: "auto",
      onResize: (metrics) => measureRef.current?.(metrics),
      onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
      gl: () => glRef.current,
    });

    // Mirrored every render so the frame body reads live values. The GL context is
    // built once and never rebuilt while a control is dragged.
    const live = useRef({
      scale, levels, warp, drift, lineWidth, majorEvery,
      bandOpacity, pointerLift, inkColor, accentColor, backgroundColor,
    });
    live.current = {
      scale, levels, warp, drift, lineWidth, majorEvery,
      bandOpacity, pointerLift, inkColor, accentColor, backgroundColor,
    };

    // Target written by pointer events; the smoothed value is what the shader
    // sees, so a jumped cursor raises the ground rather than teleporting a hill.
    const pointer = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

    useEffect(() => {
      if (!supportsWebGL2()) setFallback(true);
    }, []);

    useEffect(() => {
      const container = containerRef.current;
      if (fallback || !container) return;

      const renderer = new Renderer({
        webgl: 2,
        alpha: false,
        antialias: false,
        powerPreference: "high-performance",
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      });
      const gl = renderer.gl;
      glRef.current = gl;

      const canvas = gl.canvas as HTMLCanvasElement;
      canvas.style.display = "block";
      // Out of flow — ogl's setSize writes an explicit pixel width, and in flow that
      // raises the container's min-content width so it never shrinks again.
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      container.appendChild(canvas);

      const program = new Program(gl, {
        vertex,
        fragment,
        uniforms: {
          uResolution: { value: new Float32Array([1, 1]) },
          uDpr: { value: 1 },
          uPhase: { value: new Float32Array([0, 0]) },
          uScale: { value: scale },
          uLevels: { value: levels },
          uWarp: { value: warp },
          uLineWidth: { value: lineWidth },
          uMajorEvery: { value: majorEvery },
          uBandOpacity: { value: bandOpacity },
          uPointerLift: { value: pointerLift },
          uPointer: { value: new Float32Array([0, 0]) },
          uInk: { value: new Float32Array(hexToRgb01(inkColor)) },
          uAccent: { value: new Float32Array(hexToRgb01(accentColor)) },
          uBg: { value: new Float32Array(hexToRgb01(backgroundColor)) },
        },
      });
      const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
      const u = program.uniforms as Record<string, { value: number | Float32Array }>;

      // Two phases at incommensurate rates, each wrapped to 2π every frame. The
      // shader never receives a seconds counter, so there is nothing to lose
      // precision — this is the entire float32 story for this component.
      const phase = new Float32Array([0, 0]);
      const RATES = [0.21, 0.13];
      const TAU = Math.PI * 2;

      const sync = () => {
        const l = live.current;
        (u.uPhase.value as Float32Array).set(phase);
        u.uScale.value = l.scale;
        u.uLevels.value = l.levels;
        u.uWarp.value = l.warp;
        u.uLineWidth.value = l.lineWidth;
        u.uMajorEvery.value = l.majorEvery;
        u.uBandOpacity.value = l.bandOpacity;
        u.uPointerLift.value = l.pointerLift;
        (u.uPointer.value as Float32Array)[0] = pointer.current.x;
        (u.uPointer.value as Float32Array)[1] = pointer.current.y;
        (u.uInk.value as Float32Array).set(hexToRgb01(l.inkColor));
        (u.uAccent.value as Float32Array).set(hexToRgb01(l.accentColor));
        (u.uBg.value as Float32Array).set(hexToRgb01(l.backgroundColor));
      };

      drawRef.current = (dt) => {
        const speed = live.current.drift;
        for (let i = 0; i < 2; i++) {
          phase[i] = (phase[i] + dt * RATES[i] * speed) % TAU;
        }
        const p = pointer.current;
        const k = Math.min(1, dt * 5);
        p.x += (p.tx - p.x) * k;
        p.y += (p.ty - p.y) * k;
        sync();
        renderer.render({ scene: mesh });
      };

      measureRef.current = ({ width, height: h, dpr }) => {
        renderer.dpr = dpr;
        renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(h)));
        const res = u.uResolution.value as Float32Array;
        res[0] = gl.drawingBufferWidth;
        res[1] = gl.drawingBufferHeight;
        u.uDpr.value = dpr;
        // Bake one corrected frame so a halted canvas is never stale after a
        // resize; the host then paints its own on top (§V2).
        sync();
        renderer.render({ scene: mesh });
      };

      loop.resize();
      loop.start();

      return () => {
        drawRef.current = null;
        measureRef.current = null;
        if (container.contains(canvas)) container.removeChild(canvas);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fallback]);

    // Repaint on tuning so a paused or reduced-motion map still shows the change.
    useEffect(() => {
      loop.paint();
    }, [
      scale, levels, warp, drift, lineWidth, majorEvery, bandOpacity,
      pointerLift, inkColor, accentColor, backgroundColor, loop,
    ]);

    const track = (e: React.PointerEvent<HTMLDivElement>) => {
      if (reducedMotion) return;
      const r = e.currentTarget.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      // Normalised the same way the shader normalises gl_FragCoord: by height, so
      // the lift stays circular on a wide container instead of stretching into an
      // ellipse the moment the aspect ratio changes.
      pointer.current.tx = (e.clientX - r.left - r.width * 0.5) / r.height;
      pointer.current.ty = (r.top + r.height * 0.5 - e.clientY) / r.height;
      loop.start();
    };

    const release = () => {
      pointer.current.tx = 0;
      pointer.current.ty = 0;
      loop.start();
    };

    if (fallback) {
      // Flat banding in CSS. Not the same map, but never a blank box.
      const step = 100 / Math.max(levels, 1);
      return (
        <div
          className={className ?? "relative h-full w-full overflow-hidden"}
          style={{
            backgroundColor,
            backgroundImage: `repeating-linear-gradient(12deg, ${inkColor} 0 ${lineWidth}px, transparent ${lineWidth}px ${step}px)`,
            opacity: 0.85,
          }}
        />
      );
    }

    return (
      <div
        ref={containerRef}
        className={className ?? "relative h-full w-full overflow-hidden"}
        onPointerMove={track}
        onPointerLeave={release}
        onPointerCancel={release}
      />
    );
  },
);

Contour.displayName = "Contour";

export default Contour;
