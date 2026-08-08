"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// Two lattices stacked a fraction of a degree apart. Neither one is interesting;
// the pattern is entirely in what survives where they interleave.
//
// The whole component lives or dies on anti-aliasing. A rotated lattice has no
// single sample rate that works across the frame — the effective cell frequency
// varies with position, so the corners always outrun a fixed supersample count.
// Instead each layer is band-limited analytically in the shader: `fwidth` gives
// cells-per-pixel, the smoothstep widens with it, and as a layer approaches one
// cell per pixel it converges to flat grey rather than tearing into false
// pattern. The beat between the layers is a low-frequency signal nowhere near
// Nyquist, so it survives the filtering intact. What you see is interference,
// not sampling.
//
// Time reaches the shader as three phases already wrapped to 2π rather than as a
// seconds counter. An unbounded float32 `uTime` loses mantissa bits over a long
// session and the trigonometry visibly coarsens.
//
// Deliberately no `touch-action: none`. The pointer twists the lattice, but that
// is a hover enhancement, not the mechanism — a full-bleed background that eats
// page scrolling is a bug, not a feature.
interface MoireProps {
  lattice?: "lines" | "grid" | "dots" | "rings";
  pitch?: number;
  angle?: number;
  drift?: number;
  separation?: number;
  thickness?: number;
  contrast?: number;
  pointerInfluence?: number;
  inkColor?: string;
  backgroundColor?: string;
  /** Halt the render loop (leaves one still interference pattern painted). */
  paused?: boolean;
  reducedMotion?: boolean;
  className?: string;
}

const LATTICE_ID: Record<string, number> = { lines: 0, grid: 1, dots: 2, rings: 3 };

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
uniform float uPitch;
uniform float uAngle;
uniform float uDrift;
uniform float uSeparation;
uniform float uThickness;
uniform float uContrast;
uniform vec2  uPointer;
uniform float uPointerInfluence;
uniform float uLattice;
uniform vec3  uInk;
uniform vec3  uBg;

mat2 rot(float a) { float s = sin(a); float c = cos(a); return mat2(c, -s, s, c); }

// Band-limited coverage of one 1D lattice. w is cells per pixel: as it grows the
// smoothstep spans the whole cell and the layer greys out instead of aliasing.
float bandCov(float p, float duty, float w) {
  float d = abs(fract(p) - 0.5);
  float h = 0.5 * duty;
  return 1.0 - smoothstep(h - w, h + w, d);
}

// 1 where the two lattices sit in phase, 0 where they are exactly interleaved.
// This is the beat itself, read off the phase difference rather than inferred
// from the pixels — it varies slowly across the frame, which is why it can carry
// colour without carrying the lattice's own frequency along with it.
float phaseAlign(float d) {
  return 1.0 - 2.0 * abs(fract(d + 0.5) - 0.5);
}

// Derivatives are taken once, before any branch — fwidth inside divergent control
// flow is undefined in GLSL ES 3.0.
float layerCoverage(vec2 p, float duty) {
  vec2 wv = max(fwidth(p), vec2(1e-5));
  if (uLattice < 0.5) {
    return bandCov(p.y, duty, wv.y);
  }
  if (uLattice < 1.5) {
    return max(bandCov(p.x, duty, wv.x), bandCov(p.y, duty, wv.y));
  }
  if (uLattice < 2.5) {
    float d = length(fract(p) - 0.5);
    float w = max(wv.x, wv.y) * 0.75;
    float r = 0.5 * duty;
    return 1.0 - smoothstep(r - w, r + w, d);
  }
  return bandCov(length(p), duty, length(wv) * 0.7);
}

void main() {
  vec2 res = uResolution / uDpr;
  vec2 c = gl_FragCoord.xy / uDpr - res * 0.5;

  // Half the angle onto each layer, so 0° stacks them exactly and the field goes
  // blank — which is the honest reading of "no rotation between the lattices".
  float wobble = sin(uPhase.x) * 0.8 * uDrift;
  float half_ = radians(uAngle + wobble + uPointer.x * 1.2 * uPointerInfluence) * 0.5;

  vec2 slide = vec2(cos(uPhase.y), sin(uPhase.z)) * uDrift * 5.0
             + uPointer * 16.0 * uPointerInfluence;
  vec2 sep = vec2(uSeparation, 0.0) + slide;

  float pitch = max(uPitch, 0.5);
  vec2 pa = (rot(-half_) * c) / pitch;
  vec2 pb = (rot(half_) * (c + sep)) / pitch;

  float a = layerCoverage(pa, uThickness);
  float b = layerCoverage(pb, uThickness);

  // Two ink layers stacked: what stays clear is what neither one covered.
  float ink = 1.0 - (1.0 - a) * (1.0 - b);

  // Expand around the pattern's own mean, not around 0.5 — otherwise raising
  // contrast just floods the frame with ink instead of opening the fringes.
  float pivot = 1.0 - (1.0 - uThickness) * (1.0 - uThickness);
  ink = clamp((ink - pivot) * uContrast + pivot, 0.0, 1.0);

  float align;
  if (uLattice < 0.5)      align = phaseAlign(pa.y - pb.y);
  else if (uLattice < 2.5) align = min(phaseAlign(pa.x - pb.x), phaseAlign(pa.y - pb.y));
  else                     align = phaseAlign(length(pa) - length(pb));

  // Where the lattices agree their ink lands on the same pixels and the band
  // should read as absence, not as more lines. Dimming the ink toward the field
  // in those zones makes the fringe the subject; leave it out and you get an
  // evenly loud grating with a faint beat somewhere inside it.
  vec3 line = mix(uBg, uInk, 0.2 + 0.8 * (1.0 - align));

  fragColor = vec4(mix(uBg, line, ink), 1.0);
}`;

const Moire = memo(
  ({
    lattice = "lines",
    pitch = 9,
    angle = 3.2,
    drift = 0.35,
    separation = 6,
    thickness = 0.16,
    contrast = 1,
    pointerInfluence = 1,
    inkColor = "#a855f7",
    backgroundColor = "#08050e",
    paused = false,
    reducedMotion = false,
    className,
  }: MoireProps) => {
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
      lattice, pitch, angle, drift, separation, thickness,
      contrast, pointerInfluence, inkColor, backgroundColor,
    });
    live.current = {
      lattice, pitch, angle, drift, separation, thickness,
      contrast, pointerInfluence, inkColor, backgroundColor,
    };

    // Target is written by pointer events; the smoothed value is what the shader
    // sees, so a jumped pointer never snaps the fringes across the frame.
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
          uPhase: { value: new Float32Array([0, 0, 0]) },
          uPitch: { value: pitch },
          uAngle: { value: angle },
          uDrift: { value: drift },
          uSeparation: { value: separation },
          uThickness: { value: thickness },
          uContrast: { value: contrast },
          uPointer: { value: new Float32Array([0, 0]) },
          uPointerInfluence: { value: pointerInfluence },
          uLattice: { value: LATTICE_ID[lattice] ?? 0 },
          uInk: { value: new Float32Array(hexToRgb01(inkColor)) },
          uBg: { value: new Float32Array(hexToRgb01(backgroundColor)) },
        },
      });
      const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
      const u = program.uniforms as Record<string, { value: number | Float32Array }>;

      // Three independent phases, each wrapped to 2π every frame. This is the whole
      // float32 precision story — no seconds counter ever reaches the shader.
      const phase = new Float32Array([0, 0, 0]);
      const RATES = [0.5, 0.23, 0.19];
      const TAU = Math.PI * 2;

      const sync = () => {
        const l = live.current;
        (u.uPhase.value as Float32Array).set(phase);
        u.uPitch.value = l.pitch;
        u.uAngle.value = l.angle;
        u.uDrift.value = l.drift;
        u.uSeparation.value = l.separation;
        u.uThickness.value = l.thickness;
        u.uContrast.value = l.contrast;
        u.uPointerInfluence.value = l.pointerInfluence;
        u.uLattice.value = LATTICE_ID[l.lattice] ?? 0;
        (u.uPointer.value as Float32Array)[0] = pointer.current.x;
        (u.uPointer.value as Float32Array)[1] = pointer.current.y;
        (u.uInk.value as Float32Array).set(hexToRgb01(l.inkColor));
        (u.uBg.value as Float32Array).set(hexToRgb01(l.backgroundColor));
      };

      drawRef.current = (dt) => {
        for (let i = 0; i < 3; i++) {
          phase[i] = (phase[i] + dt * RATES[i]) % TAU;
        }
        const p = pointer.current;
        const k = Math.min(1, dt * 6);
        p.x += (p.tx - p.x) * k;
        p.y += (p.ty - p.y) * k;
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

    // Repaint on tuning so a paused or reduced-motion field still shows the change.
    useEffect(() => {
      loop.paint();
    }, [
      lattice, pitch, angle, drift, separation, thickness,
      contrast, pointerInfluence, inkColor, backgroundColor, loop,
    ]);

    const track = (e: React.PointerEvent<HTMLDivElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      pointer.current.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.current.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
      loop.start();
    };

    const release = () => {
      pointer.current.tx = 0;
      pointer.current.ty = 0;
      loop.start();
    };

    if (fallback) {
      // Static two-lattice stack in CSS. Not the same pattern, but never a blank box.
      const stripe = (deg: number) =>
        `repeating-linear-gradient(${deg}deg, ${inkColor} 0 ${pitch * thickness}px, transparent ${pitch * thickness}px ${pitch}px)`;
      return (
        <div
          className={className ?? "relative h-full w-full overflow-hidden"}
          style={{
            backgroundColor,
            backgroundImage: `${stripe(90 - angle)}, ${stripe(90)}`,
            opacity: 0.9,
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

Moire.displayName = "Moire";

export default Moire;
