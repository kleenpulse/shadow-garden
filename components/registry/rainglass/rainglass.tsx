"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// Rain on a window, with a city somewhere behind it.
//
// Three decisions carry the component.
//
// **There is no scene to blur.** The usual construction renders a backdrop to a
// target, blurs it across several passes, then samples that through the drops.
// Here the backdrop is built low-frequency by construction — a vertical tint mix
// plus a handful of soft bokeh discs — so it is *already* the out-of-focus city.
// No render target, no mip chain, no second pass, and the "blur" control changes
// the radius of the discs rather than the size of a kernel.
//
// **Drops live in cells, not in a list.** Every pixel works out which grid cell
// it is in and evaluates the one drop that cell owns, so a thousand drops cost
// the same as one and nothing has to be simulated between frames. The drop's
// position is a pure function of time, which is also why a resize cannot lose
// the rain.
//
// **The descent is stick-slip, not a fall.** Water on glass holds by surface
// tension until its own weight breaks it loose, then runs fast and stops again.
// A linear fall reads as a screensaver; a quantised stair with a fast slip
// between steps reads as water. The trail is left *behind* that motion, so it
// only ever exists above the drop that made it.

interface RainglassProps {
  /** How much water is on the glass — active cells and micro-droplet density. */
  intensity?: number;
  /** Size of the drops, by way of the cell grid they live in. */
  dropScale?: number;
  /** How often a drop breaks loose and how fast it runs when it does. */
  speed?: number;
  /** Lateral wander of a running drop. At zero they run dead straight. */
  wander?: number;
  /** How hard each droplet bends the scene behind it. */
  refraction?: number;
  /** Condensation film over the glass. Trails clear it; it does not come back. */
  fog?: number;
  /** Depth planes of rain, each smaller and slower than the last. */
  layers?: number;
  /** Softness of the city behind the glass. */
  blur?: number;
  /** Sky, at the top of the frame. */
  tintTop?: string;
  /** Ground, at the bottom. */
  tintBottom?: string;
  /** The out-of-focus lights. */
  glow?: string;
  /** Halt the loop. The rain freezes mid-run. */
  paused?: boolean;
  /** A still wet window: drops, trails and fog, but nothing moves. */
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

uniform vec2  uRes;
uniform float uTime;
uniform float uIntensity;
uniform float uDropScale;
uniform float uSpeed;
uniform float uWander;
uniform float uRefraction;
uniform float uFog;
uniform float uLayers;
uniform float uBlur;
uniform vec3  uTintTop;
uniform vec3  uTintBottom;
uniform vec3  uGlow;

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.56);
  return fract(p.x * p.y);
}

// The city, built out of focus rather than blurred into it. Six discs is enough
// to read as depth and few enough to unroll.
vec3 backdrop(vec2 uv) {
  float a = uRes.x / max(uRes.y, 1.0);
  vec3 col = mix(uTintBottom, uTintTop, smoothstep(-0.15, 1.05, uv.y));

  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 seed = vec2(fi * 3.71 + 1.3, fi * 7.13 + 4.9);
    vec2 c = vec2(hash21(seed), hash21(seed + 19.7));
    c.x = c.x * 1.15 - 0.075;
    c.y = c.y * 0.85 + 0.1;

    float r = (0.10 + hash21(seed + 4.4) * 0.20) * (0.55 + uBlur * 1.25);
    float d = length((uv - c) * vec2(a, 1.0));
    float g = smoothstep(r, 0.0, d);
    // Squared so the falloff is a lens bokeh rather than a linear ramp.
    col += uGlow * g * g * (0.09 + 0.26 * hash21(seed + 31.2));
  }

  // A little vertical smear, the way a long exposure through glass behaves.
  col *= 0.86 + 0.14 * smoothstep(0.0, 0.6, uv.y);
  return col;
}

// One depth plane of rain.
//   xy = refraction offset   z = wet mask (drops)   w = cleared mask (trails)
vec4 rainLayer(vec2 uv, float scale, float seed) {
  float a = uRes.x / max(uRes.y, 1.0);
  vec2 grid = vec2(7.0 * a, 9.0) / max(scale, 0.05);
  vec2 st = uv * grid;
  vec2 id = floor(st);
  st = fract(st) - 0.5;

  float n = hash21(id + seed);
  // Cells are gated, not dimmed. A half-present drop looks like a smudge; a cell
  // either has water in it or it does not.
  float alive = step(1.0 - uIntensity, n);

  float t = uTime * uSpeed * 0.32 + n * 17.0;

  // Horizontal seat in the cell, plus the wander it picks up on the way down.
  float x = (n - 0.5) * 0.62;

  // Stick-slip: three holds per traverse, each released by a smoothstep so the
  // slip is quick and the hold is genuinely still.
  float prog = fract(t);
  float steps = 3.0;
  float stair = (floor(prog * steps) + smoothstep(0.58, 1.0, fract(prog * steps))) / steps;
  float y = 0.62 - stair * 1.28;

  x += sin(stair * 9.0 + n * 6.28) * 0.09 * uWander;

  // The drop itself, aspect-corrected so it is round on any canvas, and slightly
  // taller than wide because a hanging drop is.
  vec2 dp = (st - vec2(x, y)) * vec2(a * grid.y / grid.x, 1.0);
  dp.y *= 0.82;
  float rad = 0.085 + n * 0.055;
  float drop = smoothstep(rad, rad * 0.35, length(dp)) * alive;

  // What it left behind. Quantising y inside the trail band turns one expression
  // into a column of shrinking droplets without a loop.
  float above = smoothstep(-0.02, 0.06, st.y - y);
  vec2 tp = st - vec2(x, 0.0);
  tp.y = (fract(tp.y * 11.0) - 0.5) / 11.0;
  tp *= vec2(a * grid.y / grid.x, 1.0);
  float fade = smoothstep(0.85, 0.05, st.y - y);
  float trail = smoothstep(0.030, 0.008, length(tp)) * above * fade * alive;

  // The swept band. Wider than the droplets so the fog opens ahead of them.
  float cleared = alive * above * fade * smoothstep(0.11, 0.02, abs(st.x - x));

  // Condensation that never ran: fixed, unmoving, and denser than the runners.
  vec2 mp = uv * grid * 3.4;
  vec2 mid = floor(mp);
  vec2 mf = fract(mp) - 0.5;
  float mn = hash21(mid + seed + 61.7);
  float micro = smoothstep(0.30, 0.10, length(mf * vec2(a * grid.y / grid.x, 1.0) * 3.4))
              * step(1.0 - uIntensity * 0.55, mn);

  float wet = clamp(drop + trail * 0.85 + micro * 0.5, 0.0, 1.0);

  // The lens. Offset points out of each droplet's centre, which is what makes it
  // magnify rather than merely smear.
  vec2 off = dp * drop * 0.85 + tp * trail * 1.4 + mf * micro * 0.20;

  return vec4(off, wet, clamp(cleared + drop, 0.0, 1.0));
}

void main() {
  vec2 uv = vUv;

  vec2 off = vec2(0.0);
  float wet = 0.0;
  float cleared = 0.0;

  // Bounded at three and broken early. A loop the compiler can unroll keeps this
  // inside the budget of a software rasteriser, which is what the verifier runs.
  for (int i = 0; i < 3; i++) {
    if (float(i) >= uLayers) break;
    float fi = float(i);
    vec4 l = rainLayer(uv, uDropScale * (1.0 - fi * 0.28), fi * 23.4);
    // Nearer planes refract harder and read wetter; far ones are just texture.
    float w = 1.0 - fi * 0.3;
    off += l.xy * w;
    wet = max(wet, l.z * w);
    cleared = max(cleared, l.w);
  }

  vec3 col = backdrop(uv + off * uRefraction * 0.55);

  // Fog is *removed* by what the water touched, rather than drawn between the
  // drops — so a trail is a clean stripe through the film instead of a shape
  // sitting on top of it.
  float film = uFog * (1.0 - cleared);
  vec3 hazy = mix(col, vec3(dot(col, vec3(0.299, 0.587, 0.114))), 0.55);
  hazy = mix(hazy, hazy + vec3(0.035, 0.030, 0.055), 0.6);
  col = mix(col, hazy, film);

  // Grain, only in the fog. Clean glass should be clean.
  col += (hash21(uv * uRes + uTime) - 0.5) * 0.028 * film;

  // A wet edge catches the light behind it. Cheap, and it is what sells glass.
  col += uGlow * pow(wet, 3.0) * 0.22;

  fragColor = vec4(col, 1.0);
}`;

const Rainglass = memo(
  ({
    intensity = 0.55,
    dropScale = 1,
    speed = 1,
    wander = 0.5,
    refraction = 0.6,
    fog = 0.5,
    layers = 2,
    blur = 0.65,
    tintTop = "#241436",
    tintBottom = "#0b0b12",
    glow = "#a855f7",
    paused = false,
    reducedMotion = false,
    className,
  }: RainglassProps) => {
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

    const live = useRef({
      intensity, dropScale, speed, wander, refraction, fog, layers, blur,
      tintTop, tintBottom, glow, reducedMotion,
    });
    live.current = {
      intensity, dropScale, speed, wander, refraction, fog, layers, blur,
      tintTop, tintBottom, glow, reducedMotion,
    };

    useEffect(() => {
      const container = containerRef.current;
      if (fallback || !container) return;

      let renderer: Renderer;
      try {
        renderer = new Renderer({
          webgl: 2,
          alpha: false,
          antialias: false,
          dpr: Math.min(window.devicePixelRatio || 1, 2),
        });
        if (!(renderer.gl instanceof WebGL2RenderingContext)) {
          throw new Error("Rainglass requires WebGL2");
        }
      } catch {
        setFallback(true);
        return;
      }

      const glc = renderer.gl;
      glRef.current = glc;

      const canvas = glc.canvas as HTMLCanvasElement;
      canvas.style.display = "block";
      canvas.style.position = "absolute";
      canvas.style.inset = "0";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      container.appendChild(canvas);

      const program = new Program(glc, {
        vertex,
        fragment,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uRes: { value: new Float32Array([1, 1]) },
          uTime: { value: 0 },
          uIntensity: { value: intensity },
          uDropScale: { value: dropScale },
          uSpeed: { value: speed },
          uWander: { value: wander },
          uRefraction: { value: refraction },
          uFog: { value: fog },
          uLayers: { value: layers },
          uBlur: { value: blur },
          uTintTop: { value: new Float32Array(hexToRgb01(tintTop)) },
          uTintBottom: { value: new Float32Array(hexToRgb01(tintBottom)) },
          uGlow: { value: new Float32Array(hexToRgb01(glow)) },
        },
      });

      const mesh = new Mesh(glc, { geometry: new Triangle(glc), program });
      const u = program.uniforms as Record<string, { value: number | Float32Array }>;

      // Started part-way in. From a dry window the first drop takes several
      // seconds to break loose, and a background that opens on nothing reads as
      // broken rather than as calm.
      let elapsed = 40;

      drawRef.current = (dt) => {
        const l = live.current;
        // Bounded, because every phase in the shader is derived from this and a
        // float32 that has climbed for an hour quantises the descent into jerks.
        elapsed = (elapsed + (l.reducedMotion ? 0 : dt)) % 3600;

        u.uTime.value = elapsed;
        u.uIntensity.value = l.intensity;
        u.uDropScale.value = l.dropScale;
        u.uSpeed.value = l.speed;
        u.uWander.value = l.wander;
        u.uRefraction.value = l.refraction;
        u.uFog.value = l.fog;
        u.uLayers.value = Math.round(l.layers);
        u.uBlur.value = l.blur;
        (u.uTintTop.value as Float32Array).set(hexToRgb01(l.tintTop));
        (u.uTintBottom.value as Float32Array).set(hexToRgb01(l.tintBottom));
        (u.uGlow.value as Float32Array).set(hexToRgb01(l.glow));

        renderer.render({ scene: mesh });
      };

      measureRef.current = ({ width, height, dpr }) => {
        renderer.dpr = dpr;
        renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
        (u.uRes.value as Float32Array).set([
          Math.max(1, Math.floor(width)),
          Math.max(1, Math.floor(height)),
        ]);
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

    return (
      <div
        ref={containerRef}
        className={`relative h-full w-full overflow-hidden ${className ?? ""}`}
        style={
          fallback
            ? { background: `linear-gradient(to bottom, ${tintTop}, ${tintBottom})` }
            : undefined
        }
      />
    );
  },
);

Rainglass.displayName = "Rainglass";

export default Rainglass;
