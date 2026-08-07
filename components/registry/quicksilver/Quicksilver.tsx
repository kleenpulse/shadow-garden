"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// Molten chrome. Every other shader background in this catalogue emits light;
// metal does not. It reflects an environment, and the whole problem is that
// there isn't one.
//
// Three decisions carry this component.
//
// **The environment is synthesised from the reflection vector.** No cube map, no
// matcap image, no asset of any kind — a studio is written directly in the
// fragment shader: gradient sky, dark floor, and two hard softbox strips. The
// strips are the component. A smooth gradient reflected in a wobbling surface
// reads as coloured plastic; chrome is recognised by the sharp light-to-dark
// transitions sliding across it, so the sharpness of those two edges is what
// `roughness` actually controls.
//
// **The stir is analytic, and it is a trail rather than a point.** Eight recent
// pointer impulses live in uniform arrays and each contributes a decaying,
// directional shove to the domain. That buys a real wake — the metal keeps
// moving where the cursor has been — without a velocity field, a render target,
// an extension probe or a fallback path. The same closed-form trick `cathode`
// uses for phosphor persistence, extended from one impulse to eight.
//
// **Two noise budgets, not one.** The surface normal needs three height samples,
// and the height needs a domain warp. Warping with the same octave count as the
// height triples the cost for detail that is then differenced away, so the warp
// runs at two octaves and only the height runs at four.
interface QuicksilverProps {
  /** Rate the surface churns. */
  flowSpeed?: number;
  /** How far the noise drags its own coordinates before being sampled again. */
  warp?: number;
  /** How hard the pointer drags the metal. */
  stir?: number;
  /** How long a stir survives after the pointer has left. */
  viscosity?: number;
  /** Schlick exponent on the rim light. */
  fresnel?: number;
  /** Thin-film interference over the reflection. */
  iridescence?: number;
  /** How soft the reflected studio edges are. */
  roughness?: number;
  /** The base metal. */
  tint?: string;
  /** The colour the grazing-angle sheen carries. */
  sheenColor?: string;
  /** The floor of the reflected environment. */
  backgroundColor?: string;
  /** Halt the loop. One still frame of set metal stays painted. */
  paused?: boolean;
  /** The surface sets and the pointer stops stirring it. */
  reducedMotion?: boolean;
  className?: string;
}

/** Recent pointer impulses kept alive in the shader. Eight is enough for a wake
 *  that reads as continuous and short enough to stay a uniform array. */
const STIRS = 8;

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
uniform float uWarp;
uniform float uStir;
uniform float uViscosity;
uniform float uFresnel;
uniform float uIridescence;
uniform float uRoughness;
uniform vec3  uTint;
uniform vec3  uSheen;
uniform vec3  uBg;
uniform vec2  uStirPos[8];
uniform vec4  uStirVec[8];

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

// Two octaves for the warp, four for the height. Warping at four costs three
// extra noise samples per height evaluation - and there are three evaluations
// per pixel - for detail the normal's difference throws away again.
float fbm2(vec2 p) {
  return vnoise(p) * 0.62 + vnoise(p * 2.03) * 0.31;
}
float fbm4(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}

const float DOMAIN = 2.2;

// Sum of the live impulses, as a DISPLACEMENT OF THE HEIGHT rather than of the
// sampling coordinate. Translating the domain instead is the obvious move and it
// is invisible: the noise is statistically homogeneous, so sliding it sideways
// yields a field that looks the same, and taking the normal's differences after
// the shift means the normal never sees the shift at all. Deforming the height
// puts the stir inside the finite differences, so the metal genuinely bulges.
//
// The term is dot(direction, offset): signed along the stroke, so metal piles up
// ahead of the drag and hollows out behind it. That is what a finger pulled
// through something viscous actually leaves, and it is why the wake reads as
// displacement rather than as a brightness smear.
float stirHeight(vec2 p) {
  vec2 q = p / DOMAIN;
  float acc = 0.0;
  for (int i = 0; i < 8; i++) {
    if (uStirVec[i].w < 0.5) continue;
    vec2 d = q - uStirPos[i];
    float decay = exp(-uStirVec[i].z / max(uViscosity * 2.2, 0.05));
    float fall = exp(-dot(d, d) * 14.0);
    acc += dot(uStirVec[i].xy, d) * decay * fall;
  }
  return acc * uStir * 30.0;
}

float height(vec2 p, vec2 flow) {
  vec2 q = p + uWarp * vec2(fbm2(p + flow), fbm2(p.yx + flow.yx + 3.7));
  return fbm4(q * 1.25 + flow * 0.4) + stirHeight(p);
}

// The studio. Roughness widens the two softbox edges rather than blurring a
// texture - a rough metal does not reflect a blurrier room, it reflects the same
// room over a wider cone, and the visible consequence is exactly this.
vec3 studio(vec3 r, float rough) {
  float y = clamp(r.y, -1.0, 1.0);
  float soft = mix(0.015, 0.34, clamp(rough, 0.0, 1.0));

  vec3 sky = mix(vec3(0.30, 0.33, 0.40), vec3(0.78, 0.82, 0.92), smoothstep(-0.1, 0.95, y));
  vec3 floorCol = mix(uBg, vec3(0.16, 0.17, 0.21), smoothstep(-1.0, 0.05, y));
  vec3 col = mix(floorCol, sky, smoothstep(-0.06, 0.10, y));

  float box = smoothstep(0.34 - soft, 0.34 + soft, y) * (1.0 - smoothstep(0.70 - soft, 0.70 + soft, y));
  col += vec3(1.0) * box * 0.85;

  float lip = smoothstep(-0.34 - soft, -0.34 + soft, y) * (1.0 - smoothstep(-0.14 - soft, -0.14 + soft, y));
  col += vec3(0.62, 0.66, 0.78) * lip * 0.30;

  // A slow azimuthal ripple so a perfectly flat patch is never perfectly flat.
  col *= 0.92 + 0.08 * cos(atan(r.z, r.x) * 3.0);
  return col;
}

// Thin film. The hue comes from optical thickness over the cosine, so it tracks
// the surface angle instead of being painted on - which is the entire difference
// between iridescence and a rainbow gradient.
vec3 thinFilm(float cosT) {
  float d = 3.4 / max(cosT, 0.09);
  return 0.5 + 0.5 * cos(d * vec3(1.0, 0.86, 0.72) + vec3(0.0, 2.1, 4.2));
}

void main() {
  vec2 res = uResolution / uDpr;
  vec2 uv = (gl_FragCoord.xy / uDpr - res * 0.5) / max(res.y, 1.0);

  vec2 flow = vec2(cos(uPhase.x), sin(uPhase.y)) * 1.4;
  vec2 p = uv * DOMAIN;

  // Central difference for the normal. Every derivative is taken before any
  // branch below, so no fragment can reach fwidth in non-uniform control flow.
  float e = 0.006;
  float h  = height(p, flow);
  float hx = height(p + vec2(e, 0.0), flow);
  float hy = height(p + vec2(0.0, e), flow);
  vec3 n = normalize(vec3((h - hx) / e, (h - hy) / e, 1.6));

  vec3 v = vec3(0.0, 0.0, 1.0);
  vec3 r = reflect(-v, n);
  float cosT = clamp(dot(n, v), 0.0, 1.0);

  vec3 env = studio(r, uRoughness);

  // Metals tint what they reflect, and the tint washes out toward white at
  // grazing angles. That is the whole of a conductor's Fresnel response.
  float fres = pow(1.0 - cosT, max(uFresnel, 0.1));
  vec3 col = env * mix(uTint, vec3(1.0), fres);

  col = mix(col, col * (0.55 + 0.85 * thinFilm(cosT)), uIridescence * (0.35 + 0.65 * fres));
  col += uSheen * fres * 0.45;

  // Vignette toward the environment floor rather than to black, so the panel
  // edge reads as the room falling away instead of as a mask.
  float vig = 1.0 - 0.35 * dot(uv, uv);
  col = mix(uBg, col, clamp(vig, 0.0, 1.0));

  fragColor = vec4(col, 1.0);
}`;

const RATES = [0.23, 0.17];
const TAU = Math.PI * 2;
/** Seconds an impulse stays in the array. Past this its decay has nothing left
 *  to contribute and the slot is worth more to a newer one. */
const STIR_LIFE = 2.6;
/** Minimum pointer travel between impulses, in the same units as the surface.
 *  Spacing by distance rather than by frame is what makes the wake a stroke
 *  instead of an eighth of a second of one. */
const STIR_SPACING = 0.04;

const Quicksilver = memo(
  ({
    flowSpeed = 0.35,
    warp = 0.55,
    stir = 1,
    viscosity = 0.6,
    fresnel = 2.2,
    iridescence = 0.45,
    roughness = 0.18,
    tint = "#c8d2e0",
    sheenColor = "#a855f7",
    backgroundColor = "#05060a",
    paused = false,
    reducedMotion = false,
    className,
  }: QuicksilverProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const drawRef = useRef<((dt: number) => void | false) | null>(null);
    const measureRef = useRef<((m: Metrics) => void) | null>(null);
    const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(null);
    // One writer for both uniform arrays. Two counters would be two chances to
    // desync, and a position paired with the wrong direction is a wake that
    // shoves the metal somewhere the cursor has never been.
    const pushStir = useRef<
      ((x: number, y: number, dx: number, dy: number) => void) | null
    >(null);
    const lastStir = useRef<{ x: number; y: number } | null>(null);

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
      flowSpeed, warp, stir, viscosity, fresnel, iridescence,
      roughness, tint, sheenColor, backgroundColor,
    });
    live.current = {
      flowSpeed, warp, stir, viscosity, fresnel, iridescence,
      roughness, tint, sheenColor, backgroundColor,
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

      // Plain arrays, NOT Float32Arrays, and this is load-bearing. ogl parses an
      // active uniform named "uStirVec[0]" into a base name plus the component
      // "0", then walks the components looking for it. A typed array fails both
      // `"0" in uniform` and `Array.isArray(uniform.value)`, so ogl concludes the
      // uniform was never supplied, skips it, and says so only through a console
      // warning. The shader then reads all zeroes and the stir is silently dead
      // while every scalar and vec3 uniform around it works perfectly — those
      // have no array subscript in their name, so the walk never runs.
      const stirPos: number[] = new Array(STIRS * 2).fill(0);
      const stirVec: number[] = new Array(STIRS * 4).fill(0);

      const program = new Program(gl, {
        vertex,
        fragment,
        uniforms: {
          uResolution: { value: new Float32Array([1, 1]) },
          uDpr: { value: 1 },
          uPhase: { value: new Float32Array([0, 1.3]) },
          uWarp: { value: warp },
          uStir: { value: stir },
          uViscosity: { value: viscosity },
          uFresnel: { value: fresnel },
          uIridescence: { value: iridescence },
          uRoughness: { value: roughness },
          uTint: { value: new Float32Array(hexToRgb01(tint)) },
          uSheen: { value: new Float32Array(hexToRgb01(sheenColor)) },
          uBg: { value: new Float32Array(hexToRgb01(backgroundColor)) },
          uStirPos: { value: stirPos },
          uStirVec: { value: stirVec },
        },
      });
      const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
      const u = program.uniforms as Record<string, { value: number | Float32Array }>;

      const phase = new Float32Array([0, 1.3]);
      let slot = 0;

      pushStir.current = (x, y, dx, dy) => {
        // Newest impulse overwrites the oldest slot. A ring rather than a search
        // for a free one: the wake should always show the most recent motion,
        // even when the pointer is moving faster than the impulses expire.
        stirPos[slot * 2 + 0] = x;
        stirPos[slot * 2 + 1] = y;
        const i4 = slot * 4;
        stirVec[i4 + 0] = dx;
        stirVec[i4 + 1] = dy;
        stirVec[i4 + 2] = 0;
        stirVec[i4 + 3] = 1;
        slot = (slot + 1) % STIRS;
      };

      const sync = () => {
        const l = live.current;
        (u.uPhase.value as Float32Array).set(phase);
        u.uWarp.value = l.warp;
        u.uStir.value = l.stir;
        u.uViscosity.value = l.viscosity;
        u.uFresnel.value = l.fresnel;
        u.uIridescence.value = l.iridescence;
        u.uRoughness.value = l.roughness;
        (u.uTint.value as Float32Array).set(hexToRgb01(l.tint));
        (u.uSheen.value as Float32Array).set(hexToRgb01(l.sheenColor));
        (u.uBg.value as Float32Array).set(hexToRgb01(l.backgroundColor));
      };

      drawRef.current = (dt) => {
        const l = live.current;
        for (let i = 0; i < 2; i++) {
          phase[i] = (phase[i] + dt * RATES[i] * l.flowSpeed) % TAU;
        }
        for (let i = 0; i < STIRS; i++) {
          const i4 = i * 4;
          if (stirVec[i4 + 3] < 0.5) continue;
          stirVec[i4 + 2] += dt;
          if (stirVec[i4 + 2] > STIR_LIFE) stirVec[i4 + 3] = 0;
        }
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
        // Bake one corrected frame so halted metal is never stale after a
        // resize; the host then paints its own on top (§V2).
        sync();
        renderer.render({ scene: mesh });
      };

      loop.resize();
      loop.start();

      return () => {
        drawRef.current = null;
        measureRef.current = null;
        pushStir.current = null;
        if (container.contains(canvas)) container.removeChild(canvas);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fallback]);

    // Repaint on tuning so paused or reduced-motion metal still shows the change.
    useEffect(() => {
      loop.paint();
    }, [
      flowSpeed, warp, stir, viscosity, fresnel, iridescence,
      roughness, tint, sheenColor, backgroundColor, loop,
    ]);

    const track = (e: React.PointerEvent<HTMLDivElement>) => {
      if (reducedMotion) return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      // Normalised against height on both axes, so a drag of a given screen
      // distance shoves the metal the same amount whatever the aspect ratio.
      const x = (e.clientX - rect.left - rect.width * 0.5) / rect.height;
      const y = (rect.top + rect.height * 0.5 - e.clientY) / rect.height;

      const prev = lastStir.current;
      if (!prev) {
        lastStir.current = { x, y };
        return;
      }

      const dx = x - prev.x;
      const dy = y - prev.y;
      // Impulses are spaced by DISTANCE, not by frame. Eight consecutive frames
      // of a 60Hz pointer is an eighth of a second of trail — the wake was over
      // before anyone could see it. Spacing them makes the same eight slots
      // cover most of a stroke, and makes each impulse's magnitude a property of
      // the gesture rather than of the frame rate.
      const len = Math.hypot(dx, dy);
      if (len < STIR_SPACING) return;
      lastStir.current = { x, y };

      // Direction is normalised and the magnitude comes from how far past the
      // spacing the pointer got, capped. Feeding the raw delta instead makes the
      // shove a function of the reporting rate — the same gesture lands twice as
      // hard on a 120Hz pointer, and a flick past the canvas edge detonates.
      const speed = Math.min(len / STIR_SPACING, 2.5);
      const mag = (speed * 0.06) / len;
      pushStir.current?.(x, y, dx * mag, dy * mag);
      loop.start();
    };
    const release = () => {
      lastStir.current = null;
    };

    if (fallback) {
      return (
        <div
          className={className ?? "relative h-full w-full overflow-hidden"}
          style={{
            backgroundColor,
            backgroundImage: `linear-gradient(150deg, ${backgroundColor} 0%, ${tint} 38%, #ffffff 46%, ${tint} 54%, ${sheenColor} 72%, ${backgroundColor} 100%)`,
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

Quicksilver.displayName = "Quicksilver";

export default Quicksilver;
