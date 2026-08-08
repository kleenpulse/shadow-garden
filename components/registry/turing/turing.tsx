"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle, RenderTarget } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// Gray-Scott reaction-diffusion. Two reagents on a grid, four terms, and the
// entire zoo comes out of the arithmetic rather than out of any drawing code.
//
// Three decisions carry this component.
//
// **The simulation grid is decoupled from the canvas.** A resize touches the
// display pass and nothing else; the two ping-pong targets are allocated at
// gridSize and never reallocated by the observer. The alternative is defensible
// arithmetic and a terrible component: drag the window and thirty seconds of
// growth is wiped, which every user reads as a crash rather than as a
// reallocation. smoke-field already draws this line in the same place.
//
// **The state is a half-float target, and there is no eight-bit fallback.**
// Gray-Scott integrates its own output; at eight bits the quantisation error is
// larger than the per-step delta, so the field either freezes on a lattice or
// blows up. If EXT_color_buffer_float is missing the honest answer is a still
// image, not a broken simulation, so the extension probe throws and the CSS
// stand-in takes over.
//
// **The display crops rather than stretches.** The grid is square and the
// container is not. Stretching turns every cell into an ellipse, which reads as
// a rendering bug in a system whose whole subject is the shape of the cells.
export type TuringSeed = "spots" | "ring" | "stripe" | "noise";
export type TuringGrid = "256" | "384" | "512" | "768";

interface TuringProps {
  /** Rate fresh reagent arrives everywhere. */
  feed?: number;
  /** Rate the reacted product is removed. */
  kill?: number;
  /** Ratio between how fast the two reagents spread. */
  diffusion?: number;
  /** Solver iterations per displayed frame. */
  steps?: number;
  /** Resolution of the simulation grid. */
  gridSize?: TuringGrid;
  /** How the plate is inoculated on mount. */
  seed?: TuringSeed;
  /** Radius the pointer inoculates, in px against the grid. */
  brush?: number;
  /** Where the palette ramp cuts the continuous field. */
  sharpness?: number;
  /** The plate. */
  colorLow?: string;
  /** The colony. */
  colorHigh?: string;
  /** Halt the loop. The pattern stays exactly where it was. */
  paused?: boolean;
  /** The plate stops growing. What has already grown stays on screen. */
  reducedMotion?: boolean;
  className?: string;
}

const SEED_ID: Record<string, number> = { spots: 0, ring: 1, stripe: 2, noise: 3 };

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

const HASH = `
float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.56);
  return fract(p.x * p.y);
}`;

const seedFragment = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform float uSeed;
uniform float uJitter;
${HASH}

void main() {
  vec2 p = vUv - 0.5;
  float b = 0.0;
  if (uSeed < 0.5) {
    vec2 cell = floor(vUv * 6.0);
    vec2 g = fract(vUv * 6.0) - 0.5;
    // Each blob is jittered inside its cell. A perfect lattice grows into
    // wallpaper and stays there: the chemistry is isotropic, so it will never
    // break a symmetry the seed handed it. Asymmetry has to be planted.
    vec2 j = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
    b = step(length(g - j * 0.55), 0.13) * step(hash21(cell + uJitter), 0.45);
  } else if (uSeed < 1.5) {
    b = 1.0 - smoothstep(0.055, 0.075, abs(length(p) - 0.22));
  } else if (uSeed < 2.5) {
    b = 1.0 - smoothstep(0.016, 0.026, abs(p.y));
  } else {
    b = step(0.87, hash21(floor(vUv * 220.0) + uJitter));
  }
  // Canonical seeding: A drops to a half and B rises to a quarter inside the
  // blob, rather than A=1/B=1. Slamming both to one makes a*b*b spike to unity
  // in a single step, which burns the substrate out from under the colony
  // before it can spread — the blob then stabilises into a ring and sits there
  // forever, at any feed and kill you care to name. It reads exactly like a
  // frozen simulation and it is the seeding, not the chemistry.
  float mask = clamp(b, 0.0, 1.0);
  fragColor = vec4(mix(1.0, 0.5, mask), mask * 0.25, 0.0, 1.0);
}`;

const simFragment = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uState;
uniform vec2  uTexel;
uniform float uFeed;
uniform float uKill;
uniform float uDa;
uniform float uDb;
uniform vec2  uPointer;
uniform float uBrush;
uniform float uBrushOn;

vec2 st(vec2 o) { return texture(uState, vUv + o * uTexel).rg; }

void main() {
  vec2 c = st(vec2(0.0));

  // Nine-point Laplacian. The five-point one is cheaper and visibly wrong here:
  // it propagates along the axes faster than along the diagonals, so every
  // colony grows square and the lattice of the grid ends up in the pattern.
  vec2 lap =
      (st(vec2(-1.0, 0.0)) + st(vec2(1.0, 0.0)) +
       st(vec2(0.0, -1.0)) + st(vec2(0.0, 1.0))) * 0.2
    + (st(vec2(-1.0, -1.0)) + st(vec2(1.0, -1.0)) +
       st(vec2(-1.0, 1.0)) + st(vec2(1.0, 1.0))) * 0.05
    - c;

  float a = c.x;
  float b = c.y;
  float reacted = a * b * b;

  float na = a + (uDa * lap.x - reacted + uFeed * (1.0 - a));
  float nb = b + (uDb * lap.y + reacted - (uKill + uFeed) * b);

  if (uBrushOn > 0.5) {
    // The grid is square, so a uv distance is a grid distance and the blob is
    // round without an aspect correction.
    float m = 1.0 - smoothstep(0.0, max(uBrush, 1e-4), length(vUv - uPointer));
    nb = mix(nb, 1.0, m * 0.85);
    na = mix(na, 0.0, m * 0.4);
  }

  fragColor = vec4(clamp(na, 0.0, 1.0), clamp(nb, 0.0, 1.0), 0.0, 1.0);
}`;

const displayFragment = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uState;
uniform vec2  uResolution;
uniform vec2  uTexel;
uniform float uSharpness;
uniform vec3  uLow;
uniform vec3  uHigh;

void main() {
  float ar = uResolution.x / max(uResolution.y, 1.0);
  // Cover, not stretch. The square grid fills the container and the overflow is
  // cropped, so a colony stays circular at any aspect ratio.
  vec2 k = ar > 1.0 ? vec2(1.0, 1.0 / ar) : vec2(ar, 1.0);
  vec2 uv = (vUv - 0.5) * k + 0.5;

  float b = texture(uState, uv).g;
  float v = clamp(b * 2.8, 0.0, 1.0);

  float w = mix(0.32, 0.006, clamp(uSharpness, 0.0, 1.0));
  float m = smoothstep(0.5 - w, 0.5 + w, v);

  // Membrane. The gradient is largest exactly at the cut, so this lifts the
  // boundary the sharpness control just created rather than a second edge of
  // its own.
  float gx = texture(uState, uv + vec2(uTexel.x, 0.0)).g
           - texture(uState, uv - vec2(uTexel.x, 0.0)).g;
  float gy = texture(uState, uv + vec2(0.0, uTexel.y)).g
           - texture(uState, uv - vec2(0.0, uTexel.y)).g;
  float rim = clamp(length(vec2(gx, gy)) * 14.0, 0.0, 1.0);

  vec3 col = mix(uLow, uHigh, m);
  col += uHigh * rim * 0.25;

  fragColor = vec4(col, 1.0);
}`;

const Turing = memo(
  ({
    feed = 0.05,
    kill = 0.062,
    diffusion = 1,
    steps = 16,
    gridSize = "512",
    seed = "spots",
    brush = 26,
    sharpness = 0.5,
    colorLow = "#0a0a12",
    colorHigh = "#a855f7",
    paused = false,
    reducedMotion = false,
    className,
  }: TuringProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const drawRef = useRef<((dt: number) => void | false) | null>(null);
    const measureRef = useRef<((m: Metrics) => void) | null>(null);
    const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(null);
    const reseedRef = useRef(true);
    const pointer = useRef({ x: 0.5, y: 0.5, on: false });

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
      feed, kill, diffusion, steps, seed, brush, sharpness, colorLow, colorHigh,
    });
    live.current = {
      feed, kill, diffusion, steps, seed, brush, sharpness, colorLow, colorHigh,
    };

    useEffect(() => {
      const container = containerRef.current;
      if (fallback || !container) return;

      const size = Math.max(64, parseInt(gridSize, 10) || 512);

      let renderer: Renderer;
      try {
        renderer = new Renderer({
          webgl: 2,
          alpha: false,
          antialias: false,
          powerPreference: "high-performance",
          dpr: Math.min(window.devicePixelRatio || 1, 2),
        });
        const probe = renderer.gl as unknown as WebGL2RenderingContext;
        if (!probe.getExtension("EXT_color_buffer_float")) {
          throw new Error("Turing requires EXT_color_buffer_float");
        }
      } catch {
        setFallback(true);
        return;
      }

      // Two views of one context: ogl's own type for its constructors, and the
      // plain WebGL2 view for the enum constants a half-float target needs.
      const glc = renderer.gl;
      const gl2 = glc as unknown as WebGL2RenderingContext;
      glRef.current = gl2;

      const canvas = glc.canvas as HTMLCanvasElement;
      canvas.style.display = "block";
      // Out of flow — ogl's setSize writes an explicit pixel width, and in flow that
      // raises the container's min-content width so it never shrinks again.
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      container.appendChild(canvas);

      // Full float, not half. Gray-Scott integrates its own output, and the
      // per-step delta in a settled region is around a thousandth against a
      // value near one — which is two units in the last place at half
      // precision. The field does not blow up; it quietly stops moving, which
      // is far harder to recognise as a precision problem than a crash would
      // be. Linear filtering on a float texture is itself an extension, so the
      // display falls back to nearest rather than to nothing.
      const smooth = !!gl2.getExtension("OES_texture_float_linear");
      const filter = smooth ? gl2.LINEAR : gl2.NEAREST;
      const makeRT = () =>
        new RenderTarget(glc, {
          width: size,
          height: size,
          depth: false,
          type: gl2.FLOAT,
          format: gl2.RGBA,
          internalFormat: gl2.RGBA32F,
          minFilter: filter,
          magFilter: filter,
          wrapS: gl2.CLAMP_TO_EDGE,
          wrapT: gl2.CLAMP_TO_EDGE,
        });

      let read = makeRT();
      let write = makeRT();
      const texel = new Float32Array([1 / size, 1 / size]);

      const geometry = new Triangle(glc);

      const seedProgram = new Program(glc, {
        vertex,
        fragment: seedFragment,
        uniforms: {
          uSeed: { value: SEED_ID[seed] ?? 0 },
          uJitter: { value: 0 },
        },
      });
      const simProgram = new Program(glc, {
        vertex,
        fragment: simFragment,
        uniforms: {
          uState: { value: read.texture },
          uTexel: { value: texel },
          uFeed: { value: feed },
          uKill: { value: kill },
          uDa: { value: diffusion },
          uDb: { value: 0.5 },
          uPointer: { value: new Float32Array([0.5, 0.5]) },
          uBrush: { value: brush / size },
          uBrushOn: { value: 0 },
        },
      });
      const displayProgram = new Program(glc, {
        vertex,
        fragment: displayFragment,
        uniforms: {
          uState: { value: read.texture },
          uResolution: { value: new Float32Array([1, 1]) },
          uTexel: { value: texel },
          uSharpness: { value: sharpness },
          uLow: { value: new Float32Array(hexToRgb01(colorLow)) },
          uHigh: { value: new Float32Array(hexToRgb01(colorHigh)) },
        },
      });

      const seedMesh = new Mesh(glc, { geometry, program: seedProgram });
      const simMesh = new Mesh(glc, { geometry, program: simProgram });
      const displayMesh = new Mesh(glc, { geometry, program: displayProgram });

      const su = seedProgram.uniforms as Record<string, { value: number }>;
      const mu = simProgram.uniforms as Record<string, { value: number | Float32Array | unknown }>;
      const du = displayProgram.uniforms as Record<string, { value: number | Float32Array | unknown }>;

      let jitter = 0;

      const reseed = () => {
        const l = live.current;
        su.uSeed.value = SEED_ID[l.seed] ?? 0;
        su.uJitter.value = jitter;
        jitter = (jitter + 17.13) % 991;
        // Both halves of the pair, so a swap can never surface an uninitialised
        // target as one frame of noise.
        renderer.render({ scene: seedMesh, target: read });
        renderer.render({ scene: seedMesh, target: write });
      };

      const drawDisplay = () => {
        const l = live.current;
        du.uState.value = read.texture;
        du.uSharpness.value = l.sharpness;
        (du.uLow.value as Float32Array).set(hexToRgb01(l.colorLow));
        (du.uHigh.value as Float32Array).set(hexToRgb01(l.colorHigh));
        renderer.render({ scene: displayMesh });
      };

      drawRef.current = () => {
        const l = live.current;

        if (reseedRef.current) {
          reseed();
          reseedRef.current = false;
        }

        mu.uFeed.value = l.feed;
        mu.uKill.value = l.kill;
        mu.uDa.value = l.diffusion;
        mu.uBrush.value = Math.max(l.brush, 1) / size;
        mu.uBrushOn.value = pointer.current.on ? 1 : 0;
        const p = mu.uPointer.value as Float32Array;
        p[0] = pointer.current.x;
        p[1] = pointer.current.y;

        const iterations = Math.max(1, Math.round(l.steps));
        for (let i = 0; i < iterations; i++) {
          mu.uState.value = read.texture;
          renderer.render({ scene: simMesh, target: write });
          const t = read;
          read = write;
          write = t;
          // The brush is one impulse per frame, not per iteration — otherwise
          // the dose scales with `steps` and the two controls stop being
          // independent.
          mu.uBrushOn.value = 0;
        }

        drawDisplay();
      };

      measureRef.current = ({ width, height, dpr }) => {
        renderer.dpr = dpr;
        renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
        const res = du.uResolution.value as Float32Array;
        res[0] = glc.drawingBufferWidth;
        res[1] = glc.drawingBufferHeight;
        // Display only. The plate is untouched — that is the whole point of
        // holding the grid apart from the canvas.
        drawDisplay();
      };

      loop.resize();
      loop.start();

      return () => {
        drawRef.current = null;
        measureRef.current = null;
        if (container.contains(canvas)) container.removeChild(canvas);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fallback, gridSize]);

    // Re-inoculate when the seed changes. The paint() is what makes it visible
    // while paused — the frame body does the work, the host just runs one.
    useEffect(() => {
      reseedRef.current = true;
      loop.paint();
    }, [seed, loop]);

    useEffect(() => {
      loop.paint();
    }, [feed, kill, diffusion, steps, brush, sharpness, colorLow, colorHigh, loop]);

    const track = (e: React.PointerEvent<HTMLDivElement>) => {
      if (reducedMotion) return;
      const r = e.currentTarget.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const nx = (e.clientX - r.left) / r.width;
      // GL uv runs from the bottom; the pointer runs from the top.
      const ny = 1 - (e.clientY - r.top) / r.height;
      const ar = r.width / r.height;
      const kx = ar > 1 ? 1 : ar;
      const ky = ar > 1 ? 1 / ar : 1;
      pointer.current.x = (nx - 0.5) * kx + 0.5;
      pointer.current.y = (ny - 0.5) * ky + 0.5;
      pointer.current.on = true;
      loop.start();
    };
    const release = () => {
      pointer.current.on = false;
    };

    if (fallback) {
      return (
        <div
          className={className ?? "relative h-full w-full overflow-hidden"}
          style={{
            backgroundColor: colorLow,
            backgroundImage: `radial-gradient(circle at 30% 35%, ${colorHigh}55 0 12%, transparent 13%), radial-gradient(circle at 68% 62%, ${colorHigh}44 0 9%, transparent 10%), radial-gradient(circle at 48% 80%, ${colorHigh}33 0 7%, transparent 8%)`,
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

Turing.displayName = "Turing";

export default Turing;
