"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// Light through moving water. The bright filaments are not the peaks of a noise
// field — they are its zero crossings, folded. `1 - abs(2n - 1)` turns a smooth
// field into a ridged one whose maxima are thin curves rather than blobs, and
// raising that to a power thins them further without ever blurring them. Reach
// for brightness thresholds instead and you get shapes with soft, uncertain
// edges; caustics do not have those.
//
// The field is sampled through a displaced copy of itself before it is folded.
// That domain warp is what makes the network branch and reconnect the way real
// caustics do, rather than sliding past as a fixed pattern on a conveyor.
//
// ── The drift problem, and why the noise is periodic ────────────────────────
// A flowing field needs an ever-growing offset, and an ever-growing float32
// uniform loses its low bits: the motion visibly coarsens over a long session
// and eventually quantises into steps. Wrapping the offset fixes the precision
// and breaks the image — unless the noise itself repeats on exactly that
// boundary. So the lattice hash is taken modulo PERIOD, which makes the field
// tile every PERIOD cells on both axes independently, which in turn makes a
// component-wise wrap of the drift completely invisible. The offset therefore
// never leaves [0, PERIOD) and the animation never degrades.
//
// The per-layer speeds are integer multiples of that same offset for the same
// reason: k * PERIOD is still a multiple of PERIOD, so every layer wraps
// seamlessly off one bounded pair of numbers.

interface CausticsProps {
  /** Noise cells across the frame. Lower is a wider, calmer pattern. */
  scale?: number;
  /** How fast the field flows. */
  speed?: number;
  /** How many octaves contribute. */
  depth?: number;
  /** Exponent on the folded ridge — higher is thinner, brighter filaments. */
  ripple?: number;
  /** How far the field is displaced through itself before folding. */
  refraction?: number;
  /** Overall gain on the filaments. */
  brightness?: number;
  /** How much the pointer pushes the field around. */
  pointerInfluence?: number;
  /** Colour of the filament body. */
  inkColor?: string;
  /** Colour of the filament core, where the light concentrates. */
  glowColor?: string;
  /** The water itself. */
  backgroundColor?: string;
  /** Halt the render loop, leaving one still frame painted. */
  paused?: boolean;
  reducedMotion?: boolean;
  className?: string;
}

/** Lattice repeat, in cells. Must match PERIOD in the fragment shader. */
const PERIOD = 32;

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
uniform vec2  uDriftA;
uniform vec2  uDriftB;
uniform float uScale;
uniform float uDepth;
uniform float uRipple;
uniform float uRefraction;
uniform float uBrightness;
uniform vec2  uPointer;
uniform float uPointerInfluence;
uniform vec3  uInk;
uniform vec3  uGlow;
uniform vec3  uBg;

#define PERIOD 32.0
#define MAX_DEPTH 5

// Lattice hash, wrapped to PERIOD so the whole field tiles on that boundary.
// The sin-based hash is the universally portable one; its exact values differ a
// little between GPUs, which is invisible here because nothing depends on a
// specific cell being a specific brightness.
float hash(vec2 cell) {
  cell = mod(cell, PERIOD);
  return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  // Smoothstep interpolant — a linear one leaves the lattice visible as a grid
  // of creases, which reads as fabric rather than as water.
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// One sheet of light: warp, then fold. Order matters — folding first and warping
// the result smears the filaments instead of bending them.
float sheet(vec2 p, vec2 drift, float warp) {
  vec2 q = p + drift;
  vec2 w = vec2(noise(q + vec2(1.7, 9.2)), noise(q + vec2(8.3, 2.8)));
  float n = noise(q + (w - 0.5) * warp);
  return 1.0 - abs(2.0 * n - 1.0);
}

void main() {
  vec2 res = uResolution / uDpr;
  vec2 uv = (gl_FragCoord.xy / uDpr) / res;
  // Aspect-corrected about the centre, so the cells stay square and the pattern
  // does not stretch when the container does.
  vec2 p = (uv - 0.5) * vec2(res.x / max(res.y, 1.0), 1.0) * uScale;
  p += uPointer * uPointerInfluence * 0.6;

  int depth = int(uDepth);
  float sum = 0.0;
  float total = 0.0;
  for (int i = 0; i < MAX_DEPTH; i++) {
    if (i >= depth) break;
    float step_ = float(i + 1);
    // Frequency climbs geometrically, contribution falls at the same rate, so
    // adding an octave adds detail without adding overall brightness.
    float freq = pow(1.73, float(i));
    float weight = 1.0 / freq;
    // Alternating between two drift vectors decorrelates the octaves. Both are
    // integer multiples of a wrapped offset, so both still tile.
    vec2 drift = (i - (i / 2) * 2 == 0) ? uDriftA * step_ : uDriftB * step_;
    sum += sheet(p * freq, drift, uRefraction) * weight;
    total += weight;
  }

  float light = pow(clamp(sum / max(total, 1e-4), 0.0, 1.0), uRipple) * uBrightness;

  // Two-stop ramp rather than one: the body of a filament and its core are
  // different colours in the real thing, and a single mix toward one bright
  // colour flattens the network into a wire diagram.
  vec3 color = mix(uBg, uInk, clamp(light, 0.0, 1.0));
  color = mix(color, uGlow, clamp(light - 1.0, 0.0, 1.0));

  fragColor = vec4(color, 1.0);
}`;

const Caustics = memo(
  ({
    scale = 4,
    speed = 0.35,
    depth = 3,
    ripple = 3.2,
    refraction = 0.85,
    brightness = 1.35,
    pointerInfluence = 1,
    inkColor = "#a855f7",
    glowColor = "#e9d5ff",
    backgroundColor = "#08050e",
    paused = false,
    reducedMotion = false,
    className,
  }: CausticsProps) => {
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

    // Mirrored every render so the frame body reads live values. The GL context
    // is built once and never rebuilt while a control is being dragged.
    const live = useRef({
      scale, speed, depth, ripple, refraction,
      brightness, pointerInfluence, inkColor, glowColor, backgroundColor,
    });
    live.current = {
      scale, speed, depth, ripple, refraction,
      brightness, pointerInfluence, inkColor, glowColor, backgroundColor,
    };

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
      // Out of flow — ogl's setSize writes an explicit pixel width, and in flow
      // that raises the container's min-content width so it never shrinks again.
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
          uDriftA: { value: new Float32Array([0, 0]) },
          uDriftB: { value: new Float32Array([0, 0]) },
          uScale: { value: scale },
          uDepth: { value: depth },
          uRipple: { value: ripple },
          uRefraction: { value: refraction },
          uBrightness: { value: brightness },
          uPointer: { value: new Float32Array([0, 0]) },
          uPointerInfluence: { value: pointerInfluence },
          uInk: { value: new Float32Array(hexToRgb01(inkColor)) },
          uGlow: { value: new Float32Array(hexToRgb01(glowColor)) },
          uBg: { value: new Float32Array(hexToRgb01(backgroundColor)) },
        },
      });
      const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
      const u = program.uniforms as Record<string, { value: number | Float32Array }>;

      // Two independent flow directions, both wrapped to the lattice period.
      // These are the only accumulating numbers in the component.
      const driftA = new Float32Array([0, 0]);
      const driftB = new Float32Array([0, 0]);
      const DIR_A = [0.62, 0.21];
      const DIR_B = [-0.29, 0.47];

      const sync = () => {
        const l = live.current;
        (u.uDriftA.value as Float32Array).set(driftA);
        (u.uDriftB.value as Float32Array).set(driftB);
        u.uScale.value = l.scale;
        u.uDepth.value = l.depth;
        u.uRipple.value = l.ripple;
        u.uRefraction.value = l.refraction;
        u.uBrightness.value = l.brightness;
        u.uPointerInfluence.value = l.pointerInfluence;
        (u.uPointer.value as Float32Array)[0] = pointer.current.x;
        (u.uPointer.value as Float32Array)[1] = pointer.current.y;
        (u.uInk.value as Float32Array).set(hexToRgb01(l.inkColor));
        (u.uGlow.value as Float32Array).set(hexToRgb01(l.glowColor));
        (u.uBg.value as Float32Array).set(hexToRgb01(l.backgroundColor));
      };

      drawRef.current = (dt) => {
        const v = live.current.speed * dt;
        // Component-wise wrap. Seamless because the lattice hash is periodic on
        // each axis independently, so a jump of exactly PERIOD lands on an
        // identical field.
        driftA[0] = (driftA[0] + DIR_A[0] * v) % PERIOD;
        driftA[1] = (driftA[1] + DIR_A[1] * v) % PERIOD;
        driftB[0] = (driftB[0] + DIR_B[0] * v) % PERIOD;
        driftB[1] = (driftB[1] + DIR_B[1] * v) % PERIOD;

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
        // resize; the host then paints its own on top.
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
      scale, speed, depth, ripple, refraction, brightness,
      pointerInfluence, inkColor, glowColor, backgroundColor, loop,
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
      // Three overlapping radial washes. Not the network, but never a blank box.
      const wash = (x: number, y: number, color: string, size: number) =>
        `radial-gradient(${size}% ${size}% at ${x}% ${y}%, ${color} 0%, transparent 62%)`;
      return (
        <div
          className={className ?? "relative h-full w-full overflow-hidden"}
          style={{
            backgroundColor,
            backgroundImage: [
              wash(28, 32, glowColor, 60),
              wash(72, 58, inkColor, 80),
              wash(48, 88, inkColor, 70),
            ].join(", "),
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

Caustics.displayName = "Caustics";

export default Caustics;
