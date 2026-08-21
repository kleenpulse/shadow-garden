"use client";

import { useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

export type RefractScene = "blobs" | "stripes" | "checker";

export interface RefractProps {
  /** Refraction strength at the bevel — how hard the edge bends the scene. */
  ior?: number;
  /** R/G/B sample spread — chromatic aberration at the bevel. */
  dispersion?: number;
  /** Blur radius under the glass, in CSS pixels. */
  frost?: number;
  /** Fraction of the slab that is bevel; the flat middle refracts almost
   *  nothing, exactly like a real pane. */
  edgeWidth?: number;
  /** Fresnel rim + travelling specular strength. */
  glare?: number;
  /** Slab width as a percentage of the container width. */
  slabWidth?: number;
  /** The procedural backdrop being refracted. The scene is drawn in the same
   *  shader because no browser lets WebGL read the rendered page. */
  scene?: RefractScene;
  /** Glass body tint. */
  tint?: string;
  paused?: boolean;
  reducedMotion?: boolean;
  className?: string;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return [1, 1, 1];
  return [
    parseInt(m[1], 16) / 255,
    parseInt(m[2], 16) / 255,
    parseInt(m[3], 16) / 255,
  ];
};

const setRgb = (arr: Float32Array, hex: string) => {
  const c = hexToRgb(hex);
  arr[0] = c[0];
  arr[1] = c[1];
  arr[2] = c[2];
};

const TIME_WRAP = 300.0;
const SCENE_INDEX: Record<RefractScene, number> = {
  blobs: 0,
  stripes: 1,
  checker: 2,
};

const vertex = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uIor;
uniform float uDispersion;
uniform float uFrostUv;
uniform float uEdgeWidth;
uniform float uGlare;
uniform float uSlabWidth;
uniform float uScene;
uniform vec2 uCenter;
uniform vec3 uTint;
out vec4 fragColor;

float sdRoundBox(vec2 p, vec2 b, float r){
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec2 hash2(vec2 p){
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

// The backdrop the glass bends. Procedural, so refraction can sample it at
// any offset with no framebuffer round-trip.
vec3 scene(vec2 p, float t){
  if (uScene < 0.5) {
    // drifting gradient blobs
    vec3 col = vec3(0.035, 0.025, 0.06);
    vec2 c1 = vec2(0.55 + 0.30 * sin(t * 0.31), 0.55 + 0.24 * cos(t * 0.23));
    vec2 c2 = vec2(1.05 + 0.34 * cos(t * 0.17), 0.40 + 0.27 * sin(t * 0.27));
    vec2 c3 = vec2(0.80 + 0.30 * sin(t * 0.21 + 2.1), 0.75 + 0.22 * cos(t * 0.19 + 1.2));
    col += vec3(0.55, 0.25, 0.85) * exp(-dot(p - c1, p - c1) * 9.0);
    col += vec3(0.15, 0.45, 0.85) * exp(-dot(p - c2, p - c2) * 11.0);
    col += vec3(0.85, 0.30, 0.45) * exp(-dot(p - c3, p - c3) * 13.0);
    return col;
  }
  if (uScene < 1.5) {
    // slanted travelling stripes
    float s = sin((p.x + p.y) * 18.0 - t * 0.7);
    float band = smoothstep(-0.15, 0.15, s);
    return mix(vec3(0.05, 0.03, 0.09), vec3(0.55, 0.35, 0.9), band * 0.75 + 0.05);
  }
  // checker
  vec2 g = floor(p * 7.0 + vec2(t * 0.15, 0.0));
  float c = mod(g.x + g.y, 2.0);
  return mix(vec3(0.05, 0.04, 0.08), vec3(0.42, 0.32, 0.65), c * 0.8 + 0.05);
}

void main(){
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  // y-normalized coords: x in [0, aspect], y in [0, 1]
  vec2 p = gl_FragCoord.xy / iResolution.y;
  float t = iTime;

  vec2 halfSize = vec2(uSlabWidth * aspect * 0.5, uSlabWidth * aspect * 0.31);
  float corner = 0.30 * min(halfSize.x, halfSize.y);
  vec2 rel = p - uCenter;
  float d = sdRoundBox(rel, halfSize, corner);

  vec3 col;
  if (d > 0.0) {
    col = scene(p, t);
    // soft drop shadow hugging the slab
    float shadow = 1.0 - 0.35 * exp(-d * d * 900.0);
    col *= shadow;
  } else {
    // ── inside the glass ───────────────────────────────────────────────────
    // Height profile: flat middle, smooth falloff over the bevel band.
    float edge = uEdgeWidth * min(halfSize.x, halfSize.y) * 2.0;
    float h = smoothstep(0.0, edge, -d);

    // Normal of the height field — analytic gradient via 4 cheap SDF taps.
    float e = 0.002;
    float hx = smoothstep(0.0, edge, -sdRoundBox(rel + vec2(e, 0.0), halfSize, corner))
             - smoothstep(0.0, edge, -sdRoundBox(rel - vec2(e, 0.0), halfSize, corner));
    float hy = smoothstep(0.0, edge, -sdRoundBox(rel + vec2(0.0, e), halfSize, corner))
             - smoothstep(0.0, edge, -sdRoundBox(rel - vec2(0.0, e), halfSize, corner));
    vec2 grad = vec2(hx, hy) / (2.0 * e);
    float slope = length(grad);

    // The bevel bends; the flat middle passes almost straight through.
    vec2 bend = grad * uIor * 0.22;

    // Three channels sampled at wavelength-spread strengths, 8-tap frost each
    // folded into one loop: accumulate scene at poisson offsets around the
    // three refracted anchors.
    vec2 uvR = p - bend * (1.0 + uDispersion * 0.35);
    vec2 uvG = p - bend;
    vec2 uvB = p - bend * (1.0 - uDispersion * 0.35);

    vec2 taps[8];
    taps[0] = vec2(-0.71, -0.19); taps[1] = vec2(0.28, -0.72);
    taps[2] = vec2(0.82, 0.17);  taps[3] = vec2(-0.24, 0.75);
    taps[4] = vec2(-0.45, -0.61); taps[5] = vec2(0.61, -0.35);
    taps[6] = vec2(0.31, 0.62);  taps[7] = vec2(-0.68, 0.36);

    vec3 acc = vec3(0.0);
    for (int i = 0; i < 8; i++){
      vec2 o = taps[i] * uFrostUv;
      acc.r += scene(uvR + o, t).r;
      acc.g += scene(uvG + o, t).g;
      acc.b += scene(uvB + o, t).b;
    }
    col = acc / 8.0;

    // glass body: faint tint, brighter where the pane is thin (the bevel)
    col = mix(col, col * uTint + uTint * 0.06, 0.28);

    // Fresnel rim: the bevel's slope is the grazing angle
    float fres = clamp(slope * 0.10, 0.0, 1.0);
    col += uTint * fres * fres * uGlare * 0.9;

    // travelling specular streak across the pane
    float sweep = fract(t * 0.11);
    float band = dot(rel, normalize(vec2(0.8, 0.6))) / (halfSize.x * 2.0) + 0.5;
    float streak = exp(-pow((band - sweep) * 7.0, 2.0));
    col += vec3(1.0) * streak * uGlare * (0.10 + fres * 0.5);

    // top-edge highlight so the slab reads lit from above
    col += vec3(1.0) * max(-grad.y, 0.0) * 0.02 * uGlare;

    // frosted grain
    float g = hash2(gl_FragCoord.xy).x;
    col += (g - 0.5) * 0.025;
  }

  col = clamp(col, 0.0, 1.0);
  fragColor = vec4(col, 1.0);
}
`;

const Refract = ({
  ior = 0.18,
  dispersion = 0.35,
  frost = 6,
  edgeWidth = 0.18,
  glare = 0.5,
  slabWidth = 46,
  scene = "blobs",
  tint = "#e9e6ff",
  paused = false,
  reducedMotion = false,
  className = "",
}: RefractProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [fallback, setFallback] = useState(false);

  const live = useRef({
    ior,
    dispersion,
    frost,
    edgeWidth,
    glare,
    slabWidth,
    scene,
    tint,
    paused,
    reducedMotion,
  });
  live.current = {
    ior,
    dispersion,
    frost,
    edgeWidth,
    glare,
    slabWidth,
    scene,
    tint,
    paused,
    reducedMotion,
  };

  // Slab center + velocity in y-normalized shader coords, written by handlers
  // and integrated in the loop — never React state.
  const slab = useRef({
    x: 0.9,
    y: 0.5,
    vx: 0,
    vy: 0,
    dragging: false,
    grabDx: 0,
    grabDy: 0,
    lastX: 0,
    lastY: 0,
    lastT: 0,
  });

  const renderStillRef = useRef<(() => void) | null>(null);
  const drawRef = useRef<((now: number) => void | false) | null>(null);
  const measureRef = useRef<((m: Metrics) => void) | null>(null);
  const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(
    null,
  );

  const loop = useAnimationLoop({
    target: containerRef,
    halted: false,
    dpr: "auto",
    onResize: (metrics) => measureRef.current?.(metrics),
    onFrame: ({ now }) => (drawRef.current ? drawRef.current(now) : false),
    gl: () => glRef.current,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const probe = document.createElement("canvas").getContext("webgl2");
    if (!probe) {
      setFallback(true);
      return;
    }

    const renderer = new Renderer({
      webgl: 2,
      alpha: true,
      antialias: false,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
    });
    const gl = renderer.gl;
    glRef.current = gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    container.appendChild(canvas);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new Float32Array([1, 1]) },
        uIor: { value: ior },
        uDispersion: { value: dispersion },
        uFrostUv: { value: 0 },
        uEdgeWidth: { value: edgeWidth },
        uGlare: { value: glare },
        uSlabWidth: { value: slabWidth / 100 },
        uScene: { value: SCENE_INDEX[scene] },
        uCenter: { value: new Float32Array([0.9, 0.5]) },
        uTint: { value: new Float32Array(hexToRgb(tint)) },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });
    const u = program.uniforms as Record<string, { value: unknown }>;

    let simTime = 0;
    let motion = live.current.paused || live.current.reducedMotion ? 0 : 1;
    let last = performance.now();
    let cssWidth = 1;
    let cssHeight = 1;

    // slab half-extents in shader coords, from the live width prop
    const halfExtents = () => {
      const aspect = cssWidth / Math.max(cssHeight, 1);
      const hx = (live.current.slabWidth / 100) * aspect * 0.5;
      return { hx, hy: hx * 0.62, aspect };
    };

    const syncUniforms = () => {
      const L = live.current;
      const s = slab.current;
      u.iTime.value = simTime;
      u.uIor.value = L.ior;
      u.uDispersion.value = L.dispersion;
      u.uFrostUv.value = L.frost / Math.max(cssHeight, 1);
      u.uEdgeWidth.value = L.edgeWidth;
      u.uGlare.value = L.glare;
      u.uSlabWidth.value = L.slabWidth / 100;
      u.uScene.value = SCENE_INDEX[L.scene] ?? 0;
      const c = (u.uCenter as { value: Float32Array }).value;
      c[0] = s.x;
      c[1] = s.y;
      setRgb(u.uTint.value as Float32Array, L.tint);
    };

    const renderStill = () => {
      syncUniforms();
      renderer.render({ scene: mesh });
    };
    renderStillRef.current = renderStill;

    measureRef.current = ({ width, height, dpr }) => {
      cssWidth = Math.max(1, width);
      cssHeight = Math.max(1, height);
      renderer.dpr = dpr;
      renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
      const res = (u.iResolution as { value: Float32Array }).value;
      res[0] = gl.drawingBufferWidth;
      res[1] = gl.drawingBufferHeight;
      renderStill();
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const L = live.current;
      const s = slab.current;
      const wantMotion = L.paused || L.reducedMotion ? 0 : 1;
      motion += (wantMotion - motion) * Math.min(1, dt * 4);
      if (wantMotion === 0 && motion < 0.001) motion = 0;

      simTime += dt * motion;
      if (simTime > TIME_WRAP) simTime -= TIME_WRAP;

      const { hx, hy, aspect } = halfExtents();
      if (!s.dragging) {
        // momentum glide with friction
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const decay = Math.exp(-4.5 * dt);
        s.vx *= decay;
        s.vy *= decay;
        // spring back inside bounds after an overshoot
        const tx = Math.max(hx, Math.min(aspect - hx, s.x));
        const ty = Math.max(hy, Math.min(1 - hy, s.y));
        s.x += (tx - s.x) * Math.min(1, dt * 10);
        s.y += (ty - s.y) * Math.min(1, dt * 10);
      }

      syncUniforms();
      renderer.render({ scene: mesh });

      const settled =
        !s.dragging && Math.abs(s.vx) < 0.001 && Math.abs(s.vy) < 0.001;
      if (wantMotion === 0 && motion === 0 && settled) return false;
    };
    drawRef.current = frame;

    // pointer position → y-normalized shader coords (y up)
    const toShader = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) / Math.max(rect.height, 1),
        y: (rect.bottom - e.clientY) / Math.max(rect.height, 1),
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      const s = slab.current;
      const p = toShader(e);
      const { hx, hy } = halfExtents();
      // only a press on the slab picks it up
      if (Math.abs(p.x - s.x) > hx || Math.abs(p.y - s.y) > hy) return;
      s.dragging = true;
      s.grabDx = s.x - p.x;
      s.grabDy = s.y - p.y;
      s.lastX = p.x;
      s.lastY = p.y;
      s.lastT = performance.now();
      s.vx = 0;
      s.vy = 0;
      container.setPointerCapture(e.pointerId);
      loop.start();
    };
    const onPointerMove = (e: PointerEvent) => {
      const s = slab.current;
      if (!s.dragging) return;
      const p = toShader(e);
      const now = performance.now();
      const dtms = Math.max(now - s.lastT, 1);
      const { hx, hy, aspect } = halfExtents();
      const rawX = p.x + s.grabDx;
      const rawY = p.y + s.grabDy;
      // rubber-band: past the edge the slab follows at a third of the hand
      const tx = Math.max(hx, Math.min(aspect - hx, rawX));
      const ty = Math.max(hy, Math.min(1 - hy, rawY));
      s.x = tx + (rawX - tx) * 0.35;
      s.y = ty + (rawY - ty) * 0.35;
      s.vx = ((p.x - s.lastX) / dtms) * 1000;
      s.vy = ((p.y - s.lastY) / dtms) * 1000;
      s.lastX = p.x;
      s.lastY = p.y;
      s.lastT = now;
      // dragging while paused still repaints one frame
      loop.start();
    };
    const endDrag = (e: PointerEvent) => {
      const s = slab.current;
      if (!s.dragging) return;
      s.dragging = false;
      try {
        container.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      loop.start();
    };
    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", endDrag);
    container.addEventListener("pointercancel", endDrag);

    loop.resize();
    loop.start();

    return () => {
      drawRef.current = null;
      measureRef.current = null;
      renderStillRef.current = null;
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", endDrag);
      container.removeEventListener("pointercancel", endDrag);
      try {
        container.removeChild(canvas);
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    renderStillRef.current?.();
  }, [ior, dispersion, frost, edgeWidth, glare, slabWidth, scene, tint]);

  useEffect(() => {
    loop.start();
  }, [paused, reducedMotion, loop]);

  if (fallback) {
    return (
      <div
        className={`relative h-full w-full overflow-hidden ${className}`.trim()}
        style={{
          background:
            "radial-gradient(60% 90% at 30% 40%, #8b5cf655, transparent), radial-gradient(50% 80% at 75% 55%, #3b82f633, transparent), #0a0712",
        }}
      >
        <div
          className="absolute left-1/2 top-1/2 h-2/5 w-2/5 -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/20 bg-white/10 backdrop-blur-md"
          style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.45)" }}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      // touch-none on the canvas: a finger drag moves the slab, not the page.
      className={`relative h-full w-full cursor-grab overflow-hidden active:cursor-grabbing [&_canvas]:touch-none ${className}`.trim()}
    />
  );
};

export default Refract;
