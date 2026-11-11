"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle, Geometry, Texture } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A still illustration, made to look alive. Nothing here is 3D and nothing is
// video: one image is drawn through a shader that applies five cheap tricks, and
// a second pass scatters glowing motes over it.
//
//   sway     — the picture is sampled through a small moving offset, but only
//              where the data map says it may bend (hands, chains, hair tips)
//   glow     — the emissive parts of the map brighten and dim on a slow pulse
//   glint    — a soft band of light crosses the frame and catches only the
//              saturated, metallic pixels
//   breath   — the exposure and the corner shade drift, like a lamp that is
//              never quite steady
//   parallax — the pointer slides near pixels further than far ones
//
// ── The data map ────────────────────────────────────────────────────────────
// One extra image, three unrelated masks, one per channel:
//   R  sway weight   white bends, black is rigid
//   G  emissive      white glows
//   B  depth         white is near, black is far
// It is authored once per illustration and can be far smaller than the art,
// because all three channels are smooth. Without it the picture still breathes,
// glints and carries motes; it just cannot bend or glow.
//
// The depth channel wants a real estimate: run a depth model once on the art.
// Then grow it a little past every silhouette and soften it. Grown, so an
// outline moves with its own figure and the stretch lands on the backdrop,
// where it hides. Softened, because a hard depth edge tears the picture.
//
// ── Why time is a turn, not a clock ─────────────────────────────────────────
// Every moving term is driven by one number that runs 0 → 1 over LOOP seconds
// and wraps. Each term multiplies it by an INTEGER, so every term lands exactly
// where it started when the turn wraps and the wrap is invisible. A growing
// seconds counter would lose float32 precision over a long session instead.

interface AnimaProps {
  /** The illustration. */
  src: string;
  /** Data map: R = sway weight, G = emissive, B = depth (white is near). */
  mapSrc?: string;
  /** How far the masked parts bend. */
  sway?: number;
  /** Rate of every motion at once. */
  speed?: number;
  /** How many glowing motes drift over the picture. */
  motes?: number;
  /** Diameter of the largest motes, in CSS pixels. */
  moteSize?: number;
  /** Strength of the light band that crosses the metallic parts. */
  glint?: number;
  /** Strength of the pulse on the emissive parts. */
  glow?: number;
  /** How much the overall light drifts. */
  breath?: number;
  /** How far the pointer slides near parts against far ones. */
  parallax?: number;
  /** The depth that holds still under the pointer. Nearer parts slide one way, farther parts the other. */
  focus?: number;
  /** Colour of the motes. */
  moteColor?: string;
  /** Colour of the glint and of the emissive pulse. */
  lightColor?: string;
  /** Halt the render loop, leaving one still frame painted. */
  paused?: boolean;
  reducedMotion?: boolean;
  className?: string;
}

/** Seconds for one full turn at speed 1. */
const LOOP = 60;
const MAX_MOTES = 160;
const TAU = Math.PI * 2;
/** No sway, no glow, middle depth — the map used until a real one loads. */
const NEUTRAL_MAP = new Uint8Array([0, 0, 128, 255]);

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

// The overscan has to cover the furthest any pixel can be pulled, or the edge
// of the picture smears into view. Kept next to the two amplitudes it mirrors.
const SWAY_AMP = 0.006;
const PARALLAX_AMP = 0.02;
/** How far the idle drift leans the view, as a share of a full pointer throw. */
const DRIFT = 0.06;
const zoomFor = (sway: number, parallax: number, focus: number) =>
  1.004 +
  SWAY_AMP * 3 * Math.max(0, sway) +
  // Both sides, for whichever of nearest and farthest sits further from the focus.
  PARALLAX_AMP * 2 * (1 + DRIFT) * Math.max(focus, 1 - focus) * Math.max(0, parallax);

const plateVertex = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

const plateFragment = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D uArt;
uniform sampler2D uMap;
uniform vec2  uResolution;
uniform float uImageAspect;
uniform float uZoom;
uniform float uTurn;
uniform vec2  uPointer;
uniform float uSway;
uniform float uGlint;
uniform float uGlow;
uniform float uBreath;
uniform float uParallax;
uniform float uFocus;
uniform vec3  uLight;
uniform float uFade;

#define TAU 6.28318530718
#define SWAY_AMP ${SWAY_AMP}
#define PARALLAX_AMP ${PARALLAX_AMP}
#define DRIFT ${DRIFT}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float viewAspect = uResolution.x / max(uResolution.y, 1.0);

  // Cover fit about the centre, then the overscan.
  vec2 fit = viewAspect > uImageAspect
    ? vec2(1.0, uImageAspect / viewAspect)
    : vec2(viewAspect / uImageAspect, 1.0);
  vec2 st = (uv - 0.5) * fit / uZoom + 0.5;

  float a = uTurn * TAU;

  // The pointer, plus a slow idle lean so the depth still reads on a phone,
  // where there is no pointer to move.
  vec2 look = uPointer + DRIFT * vec2(sin(a * 2.0), cos(a * 3.0));
  // Pointer right slides near pixels left: the camera moved, not the subject.
  vec2 offset = vec2(look.x, -look.y) * PARALLAX_AMP * uParallax;

  // The depth that belongs on this pixel is the depth of the point that lands
  // here, which is not the depth stored here. A few rounds of following the
  // last guess converge on it. A single lookup smears every silhouette.
  vec2 src = st;
  float depth = texture(uMap, src).b;
  for (int i = 0; i < 4; i++) {
    src = st + offset * (depth - uFocus);
    depth = texture(uMap, src).b;
  }
  src = st + offset * (depth - uFocus);

  // Sway and glow are read where the picture came from, so both masks travel
  // with it. They are not read at the bent position: the mask would chase its
  // own motion.
  vec3 map = texture(uMap, src).rgb;

  // Two sines per axis at unrelated integer rates, phased across the picture so
  // neighbouring parts do not move in step.
  vec2 q = src * vec2(uImageAspect, 1.0);
  vec2 bend = vec2(
    sin(a * 5.0 + q.y * 5.0 + q.x * 2.3) + 0.5 * sin(a * 13.0 + q.x * 7.0),
    0.6 * sin(a * 8.0 + q.x * 4.0 + 1.7) + 0.3 * sin(a * 11.0 + q.y * 6.0)
  ) * SWAY_AMP * uSway * map.r;

  vec3 color = texture(uArt, src + bend).rgb;

  // Breath: exposure drifts on the lit areas, and the corner shade with it.
  float drift = 0.5 * sin(a * 3.0) + 0.5 * sin(a * 7.0 + 1.3);
  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  color *= 1.0 + uBreath * 0.07 * drift * smoothstep(0.2, 0.8, lum);
  float corner = smoothstep(0.38, 1.0, length(uv - 0.5) * 1.25);
  color *= 1.0 - corner * uBreath * (0.16 + 0.1 * drift);

  // Glint: metal is whatever is both saturated and not dark. Two bands on
  // different laps and opposite slants, so the pass never reads as a wiper.
  float hi = max(color.r, max(color.g, color.b));
  float lo = min(color.r, min(color.g, color.b));
  float metal = smoothstep(0.36, 0.7, (hi - lo) / max(hi, 1e-3)) * smoothstep(0.16, 0.5, hi);
  float along = q.x * 0.8 + q.y * 0.6;
  float across = (uImageAspect - q.x) * 0.8 + q.y * 0.6;
  float sweepA = fract(uTurn * 4.0) * 4.2 - 0.6;
  float sweepB = fract(uTurn * 3.0 + 0.4) * 5.0 - 0.8;
  // Squared by hand: pow() with a negative base is undefined in GLSL, and half
  // of every band sits on the negative side of its own centre.
  float dA = (along - sweepA) / 0.2;
  float dB = (across - sweepB) / 0.3;
  float bandA = exp(-dA * dA);
  float bandB = exp(-dB * dB) * 0.6;
  color += uLight * metal * (bandA + bandB) * 0.7 * uGlint;

  // Glow: the emissive parts lift their own colour and shed a little light.
  float pulse = 0.5 + 0.5 * sin(a * 9.0);
  color += (color * 0.55 + uLight * 0.3) * map.g * uGlow * (0.3 + 0.7 * pulse);

  fragColor = vec4(color * uFade, 1.0);
}`;

const moteVertex = `#version 300 es
in vec4 seed;

uniform float uTurn;
uniform vec2  uPointer;
uniform float uParallax;
uniform float uSize;
uniform float uDpr;

out float vAlpha;

#define TAU 6.28318530718

void main() {
  float a = uTurn * TAU;
  // Depth doubles as size and brightness: near motes are larger and drift
  // further under the pointer, which is most of what sells the space.
  float depth = seed.z;

  // Whole laps per turn, so a mote is back where it began when the turn wraps.
  float rise = 1.0 + floor(seed.w * 3.0);
  float slide = floor(seed.z * 3.0) - 1.0;
  float y = fract(seed.y + uTurn * rise);
  float x = fract(seed.x + uTurn * slide + 0.02 * sin(a * (2.0 + floor(seed.w * 5.0)) + seed.x * TAU));

  // Slightly past the edges, so a mote enters and leaves off screen.
  vec2 p = (vec2(x, y) * 2.0 - 1.0) * 1.1;
  p += vec2(-uPointer.x, uPointer.y) * uParallax * (0.012 + 0.05 * depth);

  float twinkle = 0.5 + 0.5 * sin(a * (6.0 + floor(seed.x * 9.0)) + seed.w * 40.0);
  float edge = smoothstep(0.0, 0.08, y) * (1.0 - smoothstep(0.9, 1.0, y))
             * smoothstep(0.0, 0.05, x) * (1.0 - smoothstep(0.95, 1.0, x));
  vAlpha = (0.45 + 0.55 * twinkle) * edge * mix(0.6, 1.0, depth);

  gl_PointSize = max(1.0, uSize * uDpr * mix(0.3, 1.0, depth));
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const moteFragment = `#version 300 es
precision highp float;
in float vAlpha;
out vec4 fragColor;
uniform vec3 uColor;

void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  // A solid disc inside a wide soft halo — out-of-focus light, not a dot. The
  // disc has to stay flat across its middle: a core that peaks at one pixel
  // vanishes on a bright backdrop, where only full white still reads.
  float core = 1.0 - smoothstep(0.26, 0.56, r);
  float halo = pow(max(0.0, 1.0 - r), 1.5);
  float alpha = (core * 0.9 + halo * 0.55) * vAlpha;
  fragColor = vec4(mix(uColor, vec3(1.0), core * 0.6) * alpha, alpha);
}`;

type Uniforms = Record<string, { value: number | Float32Array | Texture }>;

const Anima = memo(
  ({
    src,
    mapSrc,
    sway = 1,
    speed = 1,
    motes = 36,
    moteSize = 32,
    glint = 1,
    glow = 1,
    breath = 1,
    parallax = 1,
    focus = 0.41,
    moteColor = "#ffe9b8",
    lightColor = "#ffd27a",
    paused = false,
    reducedMotion = false,
    className,
  }: AnimaProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const drawRef = useRef<((dt: number) => void | false) | null>(null);
    const measureRef = useRef<((m: Metrics) => void) | null>(null);
    const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(null);
    const texRef = useRef<{
      art: Texture;
      map: Texture;
      shown(aspect: number): void;
    } | null>(null);

    const [fallback, setFallback] = useState(false);
    const halted = paused || reducedMotion;

    const loop = useAnimationLoop({
      target: containerRef,
      halted,
      dpr: "auto",
      onResize: (metrics) => measureRef.current?.(metrics),
      onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
      gl: () => glRef.current,
    });

    // Mirrored every render so the frame body reads live values. The GL context
    // is built once and never rebuilt while a control is being dragged.
    const live = useRef({
      sway, speed, motes, moteSize, glint, glow, breath, parallax, focus,
      moteColor, lightColor, halted,
    });
    live.current = {
      sway, speed, motes, moteSize, glint, glow, breath, parallax, focus,
      moteColor, lightColor, halted,
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

      // Mipmapped with trilinear filtering: the art is usually larger than the
      // frame, and a minified illustration shimmers under the sway without it.
      const art = new Texture(gl, { minFilter: gl.LINEAR_MIPMAP_LINEAR });
      const map = new Texture(gl, {
        image: NEUTRAL_MAP,
        width: 1,
        height: 1,
        generateMipmaps: false,
        minFilter: gl.LINEAR,
      });

      const plateProgram = new Program(gl, {
        vertex: plateVertex,
        fragment: plateFragment,
        depthTest: false,
        uniforms: {
          uArt: { value: art },
          uMap: { value: map },
          uResolution: { value: new Float32Array([1, 1]) },
          uImageAspect: { value: 16 / 9 },
          uZoom: { value: zoomFor(sway, parallax, focus) },
          uTurn: { value: 0 },
          uPointer: { value: new Float32Array([0, 0]) },
          uSway: { value: sway },
          uGlint: { value: glint },
          uGlow: { value: glow },
          uBreath: { value: breath },
          uParallax: { value: parallax },
          uFocus: { value: focus },
          uLight: { value: new Float32Array(hexToRgb01(lightColor)) },
          uFade: { value: 0 },
        },
      });
      const plate = new Mesh(gl, { geometry: new Triangle(gl), program: plateProgram });
      const pu = plateProgram.uniforms as Uniforms;

      // A fixed seed, so the scatter is the same on every mount instead of
      // reshuffling whenever the component remounts.
      const seeds = new Float32Array(MAX_MOTES * 4);
      let state = 0x9e3779b9;
      for (let i = 0; i < seeds.length; i++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        seeds[i] = state / 4294967296;
      }
      const moteGeometry = new Geometry(gl, { seed: { size: 4, data: seeds } });
      const moteProgram = new Program(gl, {
        vertex: moteVertex,
        fragment: moteFragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uTurn: { value: 0 },
          uPointer: { value: new Float32Array([0, 0]) },
          uParallax: { value: parallax },
          uSize: { value: moteSize },
          uDpr: { value: 1 },
          uColor: { value: new Float32Array(hexToRgb01(moteColor)) },
        },
      });
      // Additive: light adds to what is under it, it never covers it.
      moteProgram.setBlendFunc(gl.ONE, gl.ONE);
      const moteMesh = new Mesh(gl, {
        geometry: moteGeometry,
        program: moteProgram,
        mode: gl.POINTS,
      });
      const mu = moteProgram.uniforms as Uniforms;

      let turn = 0;
      let fade = 0;
      let loaded = false;

      const render = () => {
        const l = live.current;
        const p = pointer.current;
        pu.uTurn.value = turn;
        pu.uZoom.value = zoomFor(l.sway, l.parallax, l.focus);
        pu.uSway.value = l.sway;
        pu.uGlint.value = l.glint;
        pu.uGlow.value = l.glow;
        pu.uBreath.value = l.breath;
        pu.uParallax.value = l.parallax;
        pu.uFocus.value = l.focus;
        pu.uFade.value = fade;
        (pu.uPointer.value as Float32Array)[0] = p.x;
        (pu.uPointer.value as Float32Array)[1] = p.y;
        (pu.uLight.value as Float32Array).set(hexToRgb01(l.lightColor));
        renderer.render({ scene: plate });

        const count = Math.max(0, Math.min(MAX_MOTES, Math.round(l.motes)));
        if (count === 0 || fade === 0) return;
        moteGeometry.setDrawRange(0, count);
        mu.uTurn.value = turn;
        mu.uParallax.value = l.parallax;
        mu.uSize.value = l.moteSize;
        (mu.uPointer.value as Float32Array)[0] = p.x;
        (mu.uPointer.value as Float32Array)[1] = p.y;
        const tint = hexToRgb01(l.moteColor);
        (mu.uColor.value as Float32Array)[0] = tint[0] * fade;
        (mu.uColor.value as Float32Array)[1] = tint[1] * fade;
        (mu.uColor.value as Float32Array)[2] = tint[2] * fade;
        renderer.render({ scene: moteMesh, clear: false });
      };

      drawRef.current = (dt) => {
        const l = live.current;
        turn = (turn + (dt * l.speed) / LOOP) % 1;
        if (turn < 0) turn += 1;

        // A halted loop hands every frame a dt of zero, so a fade driven by dt
        // would leave a paused or reduced-motion picture black forever.
        if (loaded) fade = l.halted ? 1 : Math.min(1, fade + dt * 2.5);

        const p = pointer.current;
        const k = Math.min(1, dt * 4);
        p.x += (p.tx - p.x) * k;
        p.y += (p.ty - p.y) * k;
        render();
      };

      measureRef.current = ({ width, height, dpr }) => {
        renderer.dpr = dpr;
        renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
        const res = pu.uResolution.value as Float32Array;
        res[0] = gl.drawingBufferWidth;
        res[1] = gl.drawingBufferHeight;
        mu.uDpr.value = dpr;
        // Bake one corrected frame so a halted canvas is never stale after a
        // resize; the host then paints its own on top.
        render();
      };

      texRef.current = {
        art,
        map,
        shown: (aspect) => {
          pu.uImageAspect.value = aspect;
          loaded = true;
        },
      };

      loop.resize();
      loop.start();

      return () => {
        drawRef.current = null;
        measureRef.current = null;
        texRef.current = null;
        if (container.contains(canvas)) container.removeChild(canvas);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fallback]);

    // Images load into the textures that already exist, so swapping the art
    // never rebuilds the GL context.
    useEffect(() => {
      const textures = texRef.current;
      if (fallback || !textures) return;
      let cancelled = false;

      const load = (url: string, ready: (image: HTMLImageElement) => void) => {
        const image = new Image();
        // Needed for art served from another origin; the host must send CORS
        // headers or the texture upload is refused.
        image.crossOrigin = "anonymous";
        image.decoding = "async";
        image.onload = () => {
          if (!cancelled) ready(image);
        };
        image.src = url;
      };

      load(src, (image) => {
        textures.art.image = image;
        textures.shown(image.naturalWidth / Math.max(1, image.naturalHeight));
        loop.paint();
      });

      if (mapSrc) {
        load(mapSrc, (image) => {
          textures.map.image = image;
          loop.paint();
        });
      } else {
        textures.map.image = NEUTRAL_MAP;
        textures.map.width = 1;
        textures.map.height = 1;
        textures.map.needsUpdate = true;
        loop.paint();
      }

      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src, mapSrc, fallback]);

    // Repaint on tuning so a paused or reduced-motion picture still shows the change.
    useEffect(() => {
      loop.paint();
    }, [
      sway, speed, motes, moteSize, glint, glow, breath, parallax, focus,
      moteColor, lightColor, loop,
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
      // Without WebGL the picture is still the picture.
      return (
        <div className={className ?? "relative h-full w-full overflow-hidden"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
        </div>
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

Anima.displayName = "Anima";

export default Anima;
