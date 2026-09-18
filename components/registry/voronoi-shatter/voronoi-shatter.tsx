"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A field of cells with lit seams between them, which fracture apart under the
// pointer and knit back together when it leaves.
//
// The seam is drawn from the difference between the two nearest seeds, not from
// the distance to the nearest one. F1 alone gives you a distance field whose
// contours are rounded blobs around each seed; F2 - F1 is zero exactly on the
// bisector between two seeds and grows in both directions from it, which is the
// actual boundary. Thresholding it gives a line of even width everywhere,
// including at the vertices where three cells meet — the place a blob-based
// approximation always thickens and gives itself away.
//
// The seeds ORBIT rather than translate. A translating seed field needs an
// ever-growing offset, and an ever-growing float32 uniform loses its low bits
// until the motion quantises into steps. An orbit is driven by a phase, the
// phase wraps at 2π every frame, and the animation is therefore both endless and
// exactly periodic — no precision to lose. It also keeps every seed inside its
// own cell, which is what stops the lattice from tearing at high drift.
//
// The shatter is a displacement of the sample point, not of the seeds. Pushing
// seeds around would rebuild the topology every frame — cells would swap
// neighbours and the seams would pop. Pushing the space they live in stretches
// the existing cells apart and leaves every adjacency intact, so the fracture
// reads as one surface coming apart rather than as a new pattern arriving.

interface VoronoiShatterProps {
  /** Cells across the frame. */
  density?: number;
  /** Orbit radius of each seed, in cell widths. */
  drift?: number;
  /** Thickness of the lit seam. */
  seamWidth?: number;
  /** Bloom carried out from the seam into the cells. */
  seamGlow?: number;
  /** How far the field is pushed apart under the pointer. */
  shatter?: number;
  /** Reach of that push, as a fraction of the frame height. */
  shatterRadius?: number;
  /** How much cell-to-cell brightness varies. */
  cellContrast?: number;
  /** Colour of the seams. */
  seamColor?: string;
  /** Colour a fully-lit cell reaches. */
  cellColor?: string;
  /** The field the cells sit on. */
  backgroundColor?: string;
  /** Halt the render loop, leaving one still frame painted. */
  paused?: boolean;
  reducedMotion?: boolean;
  className?: string;
}

/** Where the pointer starts before the surface is ever touched. Far enough
 *  outside the [-1, 1] frame that the Gaussian falloff rounds to nothing. */
const PARKED = 4;

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
uniform float uDensity;
uniform float uDrift;
uniform float uSeamWidth;
uniform float uSeamGlow;
uniform float uShatter;
uniform float uShatterRadius;
uniform float uCellContrast;
uniform vec2  uPointer;
uniform vec3  uSeam;
uniform vec3  uCell;
uniform vec3  uBg;

#define TAU 6.28318530718

vec2 hash2(vec2 cell) {
  vec3 p = fract(vec3(cell.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.xx + p.yz) * p.zy);
}

// (F1, F2, cell id). The id is the seed's own hash, so it survives the seeds
// moving — a cell keeps its brightness for the whole session instead of
// flickering as the ordering of the 3x3 search changes.
vec3 cells(vec2 p) {
  vec2 base = floor(p);
  vec2 local = fract(p);

  float f1 = 8.0;
  float f2 = 8.0;
  float id = 0.0;

  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 offset = vec2(float(i), float(j));
      vec2 rand = hash2(base + offset);
      // Orbit, not translation. Bounded by construction, so the seed can never
      // leave its own cell however high the drift goes.
      vec2 seed = offset + 0.5
        + (rand - 0.5) * 0.7
        + uDrift * vec2(sin(uPhase.x + rand.x * TAU), cos(uPhase.y + rand.y * TAU));

      float d = length(seed - local);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = rand.x;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return vec3(f1, f2, id);
}

void main() {
  vec2 res = uResolution / uDpr;
  vec2 uv = (gl_FragCoord.xy / uDpr) / res;
  float aspect = res.x / max(res.y, 1.0);

  vec2 centred = (uv - 0.5) * vec2(aspect, 1.0);
  // gl_FragCoord counts up from the bottom and the pointer is reported from the
  // top, so the y has to be flipped or the fracture appears mirrored about the
  // horizon from wherever the cursor actually is.
  vec2 cursor = vec2(uPointer.x, -uPointer.y) * 0.5 * vec2(aspect, 1.0);

  vec2 away = centred - cursor;
  float reach = max(uShatterRadius, 1e-4);
  // Gaussian rather than a linear falloff: a linear one has a hard outer edge
  // that reads as a circular seam of its own, which is a second shape nobody
  // asked for.
  float force = exp(-dot(away, away) / (reach * reach));
  // Displaced along the raw offset, NOT along its normalised direction. A
  // normalised push has constant magnitude however close to the cursor you get,
  // so every seam in the neighbourhood converges on one point and the fracture
  // collapses into a starburst with a singularity at its centre. Scaling by the
  // raw offset sends the displacement to zero at the cursor, which is what a
  // lens does and what the cells being pushed apart actually looks like.
  centred += away * force * uShatter * 2.0;

  vec3 v = cells(centred * uDensity);
  float border = v.y - v.x;

  // Derivatives outside any branch — fwidth inside divergent control flow is
  // undefined in GLSL ES 3.0, and the 3x3 search above is nothing but branches.
  float w = fwidth(border) + 1e-4;
  float seam = 1.0 - smoothstep(uSeamWidth - w, uSeamWidth + w, border);
  float bloom = exp(-border * 14.0) * uSeamGlow;

  vec3 color = mix(uBg, uCell, v.z * uCellContrast);
  color += uSeam * bloom;
  color = mix(color, uSeam, seam);

  fragColor = vec4(color, 1.0);
}`;

const VoronoiShatter = memo(
  ({
    density = 9,
    drift = 0.28,
    seamWidth = 0.06,
    seamGlow = 0.6,
    shatter = 0.45,
    shatterRadius = 0.35,
    cellContrast = 0.35,
    seamColor = "#e9d5ff",
    cellColor = "#a855f7",
    backgroundColor = "#08050e",
    paused = false,
    reducedMotion = false,
    className,
  }: VoronoiShatterProps) => {
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
      density, drift, seamWidth, seamGlow, shatter,
      shatterRadius, cellContrast, seamColor, cellColor, backgroundColor,
    });
    live.current = {
      density, drift, seamWidth, seamGlow, shatter,
      shatterRadius, cellContrast, seamColor, cellColor, backgroundColor,
    };

    // Target is written by pointer events; the smoothed value is what the shader
    // sees, so a jumped pointer tears the field open rather than teleporting it.
    //
    // s/ts is a smoothed strength that scales the shatter force. On leave the
    // POSITION stays where the cursor left and only the strength decays — the
    // exponential chase moves at a speed proportional to distance, so sending
    // the position to a far park crossed the whole visible frame in about two
    // frames and read as a snap, not a heal.
    //
    // Parked well outside the frame before first touch, not at the origin. The
    // centre of the field is a real position, so starting there would open a
    // fracture in the middle of the surface on load and hold it there until the
    // pointer arrived to move it — a component that looks broken until you
    // touch it.
    const pointer = useRef({ x: PARKED, y: PARKED, tx: PARKED, ty: PARKED, s: 0, ts: 0 });

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
          uPhase: { value: new Float32Array([0, 0]) },
          uDensity: { value: density },
          uDrift: { value: drift },
          uSeamWidth: { value: seamWidth },
          uSeamGlow: { value: seamGlow },
          uShatter: { value: shatter },
          uShatterRadius: { value: shatterRadius },
          uCellContrast: { value: cellContrast },
          uPointer: { value: new Float32Array([PARKED, PARKED]) },
          uSeam: { value: new Float32Array(hexToRgb01(seamColor)) },
          uCell: { value: new Float32Array(hexToRgb01(cellColor)) },
          uBg: { value: new Float32Array(hexToRgb01(backgroundColor)) },
        },
      });
      const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
      const u = program.uniforms as Record<string, { value: number | Float32Array }>;

      // Two phases at incommensurable rates, each wrapped to 2π every frame. No
      // seconds counter ever reaches the shader, and the two rates never line up
      // into a visible cycle.
      const phase = new Float32Array([0, 0]);
      const RATES = [0.41, 0.27];
      const TAU = Math.PI * 2;

      const sync = () => {
        const l = live.current;
        (u.uPhase.value as Float32Array).set(phase);
        u.uDensity.value = l.density;
        u.uDrift.value = l.drift;
        u.uSeamWidth.value = l.seamWidth;
        u.uSeamGlow.value = l.seamGlow;
        u.uShatter.value = l.shatter * pointer.current.s;
        u.uShatterRadius.value = l.shatterRadius;
        u.uCellContrast.value = l.cellContrast;
        (u.uPointer.value as Float32Array)[0] = pointer.current.x;
        (u.uPointer.value as Float32Array)[1] = pointer.current.y;
        (u.uSeam.value as Float32Array).set(hexToRgb01(l.seamColor));
        (u.uCell.value as Float32Array).set(hexToRgb01(l.cellColor));
        (u.uBg.value as Float32Array).set(hexToRgb01(l.backgroundColor));
      };

      drawRef.current = (dt) => {
        for (let i = 0; i < 2; i++) {
          phase[i] = (phase[i] + dt * RATES[i]) % TAU;
        }
        const p = pointer.current;
        const k = Math.min(1, dt * 6);
        p.x += (p.tx - p.x) * k;
        p.y += (p.ty - p.y) * k;
        // Attack faster than release: the fracture should answer the hand
        // immediately, but knit back together at its own unhurried pace.
        const ks = Math.min(1, dt * (p.ts > p.s ? 7 : 2.2));
        p.s += (p.ts - p.s) * ks;
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
      density, drift, seamWidth, seamGlow, shatter, shatterRadius,
      cellContrast, seamColor, cellColor, backgroundColor, loop,
    ]);

    const track = (e: React.PointerEvent<HTMLDivElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const p = pointer.current;
      p.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      p.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
      // While the force is fully faded the position is invisible, so arrive in
      // place instead of streaking in from wherever the cursor last left.
      if (p.s < 0.02) {
        p.x = p.tx;
        p.y = p.ty;
      }
      p.ts = 1;
      loop.start();
    };

    // Fade the force where it stands rather than flinging the position away —
    // the cells knit back together around the cursor's last touch instead of
    // the fracture streaking off toward a corner.
    const release = () => {
      pointer.current.ts = 0;
      loop.start();
    };

    if (fallback) {
      // A static cell grid in CSS. Not a voronoi, but never a blank box.
      const cell = 100 / Math.max(3, Math.round(density));
      const line = `${seamColor} 0 1px, transparent 1px ${cell}%`;
      return (
        <div
          className={className ?? "relative h-full w-full overflow-hidden"}
          style={{
            backgroundColor,
            backgroundImage: [
              `repeating-linear-gradient(64deg, ${line})`,
              `repeating-linear-gradient(-38deg, ${line})`,
              `radial-gradient(80% 80% at 50% 50%, ${cellColor} 0%, transparent 70%)`,
            ].join(", "),
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

VoronoiShatter.displayName = "VoronoiShatter";

export default VoronoiShatter;
