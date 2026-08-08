"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// One bit, and the artefact is the point.
//
// Three decisions carry this component.
//
// **The cell is CSS pixels, not device pixels.** Every quantity here that has a
// size — the dither cell, the halftone dot — is divided by dpr before it is used.
// Held in device pixels the grid would halve on a retina display, which is
// exactly the class of screen this gets judged on, and the effect would quietly
// disappear for the people most likely to be looking closely.
//
// **The field is sampled once per cell, at the cell's centre.** Sampling
// per-pixel and then quantising per-cell means neighbouring pixels inside one
// cell disagree about what they are quantising, and the cell edges shimmer. One
// sample per cell is also the honest thing: the output has exactly as much
// spatial information as the grid can carry.
//
// **Nothing unbounded reaches the shader.** The three field clocks are phases
// wrapped at 2*PI, so a tab left open overnight is bit-for-bit the same as one
// opened a second ago. An unbounded seconds counter loses mantissa until the
// motion visibly steps — the failure takes hours to appear and is impossible to
// reproduce on demand, which is the worst combination there is.
export type DitherPattern = "bayer2" | "bayer4" | "bayer8" | "halftone" | "noise";
export type DitherField = "plasma" | "ridges" | "tunnel" | "drift";

interface DitherProps {
  /** Which threshold matrix decides each cell. */
  pattern?: DitherPattern;
  /** Tones per channel after quantisation. Two is the one-bit case. */
  levels?: number;
  /** Size of one dither cell, in CSS pixels. */
  pixelSize?: number;
  /** What is being quantised. */
  field?: DitherField;
  /** Rate the field evolves. */
  fieldSpeed?: number;
  /** Size of the field's features. */
  fieldScale?: number;
  /** Frames the field is held before it advances. */
  frameHold?: number;
  /** Contrast applied before quantisation. */
  contrast?: number;
  /** The colour a lit cell takes. */
  inkColor?: string;
  /** The colour an unlit cell takes. */
  paperColor?: string;
  /** Halt the loop. One still frame stays painted. */
  paused?: boolean;
  /** The field parks. The grid stays on screen — only its motion is withheld. */
  reducedMotion?: boolean;
  className?: string;
}

const PATTERN_ID: Record<string, number> = {
  bayer2: 0,
  bayer4: 1,
  bayer8: 2,
  halftone: 3,
  noise: 4,
};
const FIELD_ID: Record<string, number> = {
  plasma: 0,
  ridges: 1,
  tunnel: 2,
  drift: 3,
};

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
uniform vec3  uPhase;
uniform float uPattern;
uniform float uLevels;
uniform float uPixelSize;
uniform float uField;
uniform float uFieldScale;
uniform float uContrast;
uniform vec3  uInk;
uniform vec3  uPaper;

// Bayer by recursion. The 2x2 case is a closed form, and each larger matrix is
// the next coarser one scaled into the gaps of this one - which is the actual
// definition of an ordered dither matrix, not an approximation of it.
float bayer2(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(a * 0.5) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(a * 0.5) * 0.25 + bayer2(a); }

// Interleaved gradient noise. Not true blue noise - that needs a baked texture -
// but it is the standard cheap stand-in and it carries the property that matters
// here: no lattice, so no fixed pattern for the eye to lock onto.
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

// Clustered dot on a grid rotated 45 degrees, which is where a press puts the
// black screen: at 45 the rosette stops competing with the horizontal and
// vertical edges that dominate most images.
float halftone(vec2 p) {
  vec2 r = vec2(p.x - p.y, p.x + p.y) * 0.70710678;
  vec2 cell = fract(r) - 0.5;
  return clamp(length(cell) * 1.41421356, 0.0, 1.0);
}

float thresholdAt(vec2 cell) {
  if (uPattern < 0.5) return bayer2(cell);
  if (uPattern < 1.5) return bayer4(cell);
  if (uPattern < 2.5) return bayer8(cell);
  if (uPattern < 3.5) return halftone(cell * 0.25);
  return ign(cell);
}

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.56);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.02; a *= 0.5; }
  return s;
}

float fieldAt(vec2 p) {
  vec3 ph = uPhase;
  if (uField < 0.5) {
    float v = sin(p.x * 1.7 + ph.x) * cos(p.y * 1.3 + ph.y);
    v += sin(length(p) * 2.2 - ph.z) * 0.8;
    return v * 0.35 + 0.5;
  }
  if (uField < 1.5) {
    vec2 q = p + vec2(cos(ph.x), sin(ph.y)) * 0.8;
    float r = 1.0 - abs(fbm(q) * 2.0 - 1.0);
    return r * r;
  }
  if (uField < 2.5) {
    float r = max(length(p), 0.08);
    float a = atan(p.y, p.x);
    // The phase multiplier is an integer so the 2*PI wrap stays invisible: sin
    // steps by a whole number of turns and lands exactly where it left.
    return 0.5 + 0.5 * sin(2.4 / r - ph.x * 3.0 + a * 2.0);
  }
  vec2 w = vec2(fbm(p + ph.xy), fbm(p + ph.yz + 5.2));
  return fbm(p + w * 0.9);
}

void main() {
  float cellPx = max(uPixelSize, 1.0) * uDpr;
  vec2 cell = floor(gl_FragCoord.xy / cellPx);

  vec2 res = uResolution / uDpr;
  // Centre of this cell, in CSS pixels. Every pixel in the cell resolves to the
  // same sample, so the cell is one tone rather than a smear the grid then cuts.
  vec2 sp = (cell * cellPx + cellPx * 0.5) / uDpr;
  vec2 p = (sp - res * 0.5) / max(res.y, 1.0) * max(uFieldScale, 0.05);

  float v = clamp(fieldAt(p), 0.0, 1.0);
  v = clamp((v - 0.5) * uContrast + 0.5, 0.0, 1.0);

  float n = max(uLevels - 1.0, 1.0);
  // The threshold is offset to zero-mean and spread across exactly one
  // quantisation step. Any wider and the dither reads as noise laid over the
  // image; any narrower and it stops breaking up the bands it exists to break.
  float t = thresholdAt(cell) - 0.5;
  float q = clamp(floor(v * n + t + 0.5) / n, 0.0, 1.0);

  fragColor = vec4(mix(uPaper, uInk, q), 1.0);
}`;

const RATES = [0.31, 0.19, 0.11];
const TAU = Math.PI * 2;

const Dither = memo(
  ({
    pattern = "bayer8",
    levels = 2,
    pixelSize = 3,
    field = "plasma",
    fieldSpeed = 0.3,
    fieldScale = 2.4,
    frameHold = 0,
    contrast = 1,
    inkColor = "#e8e4d8",
    paperColor = "#0b0b0d",
    paused = false,
    reducedMotion = false,
    className,
  }: DitherProps) => {
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
      pattern, levels, pixelSize, field, fieldSpeed, fieldScale,
      frameHold, contrast, inkColor, paperColor,
    });
    live.current = {
      pattern, levels, pixelSize, field, fieldSpeed, fieldScale,
      frameHold, contrast, inkColor, paperColor,
    };

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
          uPhase: { value: new Float32Array([0, 0, 0]) },
          uPattern: { value: PATTERN_ID[pattern] ?? 2 },
          uLevels: { value: levels },
          uPixelSize: { value: pixelSize },
          uField: { value: FIELD_ID[field] ?? 0 },
          uFieldScale: { value: fieldScale },
          uContrast: { value: contrast },
          uInk: { value: new Float32Array(hexToRgb01(inkColor)) },
          uPaper: { value: new Float32Array(hexToRgb01(paperColor)) },
        },
      });
      const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
      const u = program.uniforms as Record<string, { value: number | Float32Array }>;

      const phase = new Float32Array([0, 1.7, 4.1]);

      const sync = () => {
        const l = live.current;
        (u.uPhase.value as Float32Array).set(phase);
        u.uPattern.value = PATTERN_ID[l.pattern] ?? 2;
        u.uLevels.value = l.levels;
        u.uPixelSize.value = l.pixelSize;
        u.uField.value = FIELD_ID[l.field] ?? 0;
        u.uFieldScale.value = l.fieldScale;
        u.uContrast.value = l.contrast;
        (u.uInk.value as Float32Array).set(hexToRgb01(l.inkColor));
        (u.uPaper.value as Float32Array).set(hexToRgb01(l.paperColor));
      };

      // Time keeps accruing while the clock is held, and is spent in one go when
      // the hold expires. Dropping it instead would make frameHold a speed
      // control wearing a stutter's clothes.
      let accrued = 0;
      let held = 0;

      drawRef.current = (dt) => {
        const l = live.current;
        accrued += dt;
        if (held <= 0) {
          for (let i = 0; i < 3; i++) {
            phase[i] = (phase[i] + accrued * RATES[i] * l.fieldSpeed) % TAU;
          }
          accrued = 0;
          held = Math.max(0, Math.round(l.frameHold));
        } else {
          held -= 1;
        }
        sync();
        renderer.render({ scene: mesh });
      };

      measureRef.current = ({ width, height, dpr }) => {
        renderer.dpr = dpr;
        renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
        const res = u.uResolution.value as Float32Array;
        res[0] = gl.drawingBufferWidth;
        res[1] = gl.drawingBufferHeight;
        u.uDpr.value = dpr;
        // Bake one corrected frame so a halted field is never stale after a
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

    // Repaint on tuning so a paused or reduced-motion field still shows the change.
    useEffect(() => {
      loop.paint();
    }, [
      pattern, levels, pixelSize, field, fieldSpeed, fieldScale,
      frameHold, contrast, inkColor, paperColor, loop,
    ]);

    if (fallback) {
      // A checker at the cell size. Not the field, but never a blank box — and
      // the one effect in here that CSS can state honestly.
      const s = Math.max(pixelSize, 1) * 2;
      return (
        <div
          className={className ?? "relative h-full w-full overflow-hidden"}
          style={{
            backgroundColor: paperColor,
            backgroundImage: `repeating-conic-gradient(${inkColor} 0% 25%, ${paperColor} 0% 50%)`,
            backgroundSize: `${s}px ${s}px`,
            opacity: 0.9,
          }}
        />
      );
    }

    return (
      <div
        ref={containerRef}
        className={className ?? "relative h-full w-full overflow-hidden"}
      />
    );
  },
);

Dither.displayName = "Dither";

export default Dither;
