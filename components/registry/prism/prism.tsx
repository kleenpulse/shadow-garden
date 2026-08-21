"use client";

import { useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

export interface PrismProps {
  /** IOR spread across the spectral bands — how wide the fan opens. */
  dispersion?: number;
  /** Spectral samples in the exit fan. */
  bands?: number;
  beamIntensity?: number;
  beamColor?: string;
  /** Fan saturation — 0 washes the spectrum toward the beam color. */
  saturation?: number;
  /** Participating haze density. Light in clean air is invisible; the haze is
   *  what makes the shafts readable at all. */
  fog?: number;
  autoRotate?: boolean;
  rotateSpeed?: number;
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

// Wrap sim time so noise coordinates stay small and float32 stays precise.
const TIME_WRAP = 300.0;
const PITCH_LIMIT = 1.3;

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
uniform float uDispersion;
uniform float uBands;
uniform float uBeamIntensity;
uniform float uSaturation;
uniform float uFog;
uniform float uYaw;
uniform float uPitch;
uniform vec3 uBeamColor;
out vec4 fragColor;

// GLSL mat3 fills column-major: these are the standard right-hand R_y / R_x.
// Sign check (geometry rotation, camera fixed at +z): drag down -> pitch grows
// -> the prism's top comes toward the viewer.
mat3 rotY(float a){float c=cos(a),s=sin(a);return mat3(c,0.,-s, 0.,1.,0., s,0.,c);}
mat3 rotX(float a){float c=cos(a),s=sin(a);return mat3(1.,0.,0., 0.,c,s, 0.,-s,c);}

// Equilateral prism: triangular cross-section in xy, length 2h.y along z.
float sdPrism(vec3 p, vec2 h){
  vec3 q = abs(p);
  return max(q.z - h.y, max(q.x * 0.866025 + p.y * 0.5, -p.y) - h.x * 0.5);
}

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Closest distance between the view ray and a light segment — the whole beam
// system is capsule glows, no secondary marching.
float raySeg(vec3 ro, vec3 rd, vec3 a, vec3 b){
  vec3 v = b - a;
  vec3 w = ro - a;
  float A = 1.0;
  float B = dot(rd, v);
  float C = dot(v, v);
  float D = dot(rd, w);
  float E = dot(v, w);
  float den = max(A * C - B * B, 1e-5);
  float s = max((B * E - C * D) / den, 0.0);
  float t = clamp((A * E - B * D) / den, 0.0, 1.0);
  return length((ro + rd * s) - (a + v * t));
}

// Spectral hue ramp, red -> violet across the fan: an HSV hue sweep, squared
// for saturation. (A cosine palette with per-channel frequencies parks every
// channel in its negative trough mid-range — the middle bands render black.)
vec3 spectral(float k){
  vec3 c = clamp(abs(fract(k * 0.78 + vec3(1.0, 0.666667, 0.333333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  return c * c;
}

void main(){
  vec2 uv = (gl_FragCoord.xy * 2.0 - iResolution.xy) / iResolution.y;
  float t = iTime;

  mat3 M = rotY(uYaw) * rotX(uPitch);
  mat3 Minv = transpose(M);

  vec3 ro = vec3(0.0, 0.0, 3.4);
  vec3 rd = normalize(vec3(uv, -1.75));

  vec2 prismSize = vec2(1.15, 0.85);

  // ── march the solid ──────────────────────────────────────────────────────
  float travel = 0.0;
  bool hit = false;
  vec3 pos = ro;
  for (int i = 0; i < 64; i++){
    pos = ro + rd * travel;
    float d = sdPrism(Minv * pos, prismSize);
    if (d < 0.002) { hit = true; break; }
    travel += d;
    if (travel > 9.0) break;
  }

  // ── base: near-black with a breathing haze gradient ──────────────────────
  vec3 col = vec3(0.012, 0.008, 0.022);
  float haze = uFog * (0.5 + 0.5 * sin(uv.x * 1.7 + t * 0.21) * sin(uv.y * 1.3 - t * 0.13));
  col += vec3(0.05, 0.03, 0.09) * haze * 0.4;

  float fogGain = 0.25 + uFog * 0.75;

  // ── entry shaft: world-fixed, terminating at the prism heart ─────────────
  vec3 heart = vec3(0.0, 0.1, 0.0);
  float dIn = raySeg(ro, rd, vec3(-4.2, 0.95, 0.0), heart);
  float gIn = 0.0016 / (dIn * dIn + 0.0016);
  col += uBeamColor * gIn * uBeamIntensity * fogGain * 1.4;

  // ── exit fan: attached to the geometry, sweeps as the prism turns ────────
  vec3 inDir = normalize(heart - vec3(-4.2, 0.95, 0.0));
  for (int i = 0; i < 8; i++){
    if (float(i) >= uBands) break;
    float k = (float(i) + 0.5) / max(uBands, 1.0);
    // deviation: base bend plus wavelength-dependent spread
    float dev = 0.55 + (k - 0.5) * (0.25 + uDispersion * 0.85);
    float c = cos(-dev), s = sin(-dev);
    vec3 outDir = normalize(vec3(
      inDir.x * c - inDir.y * s,
      inDir.x * s + inDir.y * c,
      0.0));
    vec3 a = M * heart;
    vec3 b = a + M * outDir * 5.0;
    float d = raySeg(ro, rd, a, b);
    float g = 0.0011 / (d * d + 0.0011);
    vec3 bandCol = mix(uBeamColor, spectral(k), uSaturation);
    col += bandCol * g * uBeamIntensity * fogGain * (1.05 - k * 0.25);
  }

  // dust motes drifting through whatever glow is present
  float dust = hash12(floor(uv * 90.0) + floor(t * 3.0));
  col += col * step(0.985, dust) * uFog * 1.5;

  // ── glass surface: Fresnel rim + faint interior ──────────────────────────
  if (hit){
    vec3 pl = Minv * pos;
    vec2 e = vec2(0.004, 0.0);
    vec3 n = normalize(vec3(
      sdPrism(pl + e.xyy, prismSize) - sdPrism(pl - e.xyy, prismSize),
      sdPrism(pl + e.yxy, prismSize) - sdPrism(pl - e.yxy, prismSize),
      sdPrism(pl + e.yyx, prismSize) - sdPrism(pl - e.yyx, prismSize)));
    n = M * n;
    float fres = pow(1.0 - clamp(dot(-rd, n), 0.0, 1.0), 3.0);
    // mostly transparent body with a cold tint; the beams behind stay visible
    col = mix(col, col * vec3(0.82, 0.86, 1.0) + vec3(0.015, 0.012, 0.03), 0.35);
    col += vec3(0.75, 0.78, 1.0) * fres * 0.55;
    // one crisp specular from a fixed key light
    vec3 keyDir = normalize(vec3(-0.5, 0.8, 0.6));
    float spec = pow(max(dot(reflect(rd, n), keyDir), 0.0), 60.0);
    col += vec3(1.0) * spec * 0.5;
  }

  // soft vignette keeps the frame edges quiet
  col *= 1.0 - 0.35 * dot(uv * 0.55, uv * 0.55);
  col = 1.0 - exp(-col * 1.6);
  fragColor = vec4(col, 1.0);
}
`;

const Prism = ({
  dispersion = 0.5,
  bands = 6,
  beamIntensity = 1,
  beamColor = "#ffffff",
  saturation = 0.9,
  fog = 0.3,
  autoRotate = true,
  rotateSpeed = 0.3,
  paused = false,
  reducedMotion = false,
  className = "",
}: PrismProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [fallback, setFallback] = useState(false);

  const live = useRef({
    dispersion,
    bands,
    beamIntensity,
    beamColor,
    saturation,
    fog,
    autoRotate,
    rotateSpeed,
    paused,
    reducedMotion,
  });
  live.current = {
    dispersion,
    bands,
    beamIntensity,
    beamColor,
    saturation,
    fog,
    autoRotate,
    rotateSpeed,
    paused,
    reducedMotion,
  };

  // Orbit state lives in refs written by handlers and integrated in the loop —
  // React never renders a frame of this, and the pause assertion stays honest.
  const orbit = useRef({
    yaw: 0.5,
    pitch: 0.12,
    velYaw: 0,
    velPitch: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
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
    // Out of flow so ogl's explicit pixel size never feeds container layout.
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
        uDispersion: { value: dispersion },
        uBands: { value: bands },
        uBeamIntensity: { value: beamIntensity },
        uSaturation: { value: saturation },
        uFog: { value: fog },
        uYaw: { value: orbit.current.yaw },
        uPitch: { value: orbit.current.pitch },
        uBeamColor: { value: new Float32Array(hexToRgb(beamColor)) },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });
    const u = program.uniforms as Record<string, { value: unknown }>;

    let simTime = 0;
    let motion = live.current.paused || live.current.reducedMotion ? 0 : 1;
    let last = performance.now();

    const syncUniforms = () => {
      const L = live.current;
      const o = orbit.current;
      u.iTime.value = simTime;
      u.uDispersion.value = L.dispersion;
      u.uBands.value = L.bands;
      u.uBeamIntensity.value = L.beamIntensity;
      u.uSaturation.value = L.saturation;
      u.uFog.value = L.fog;
      u.uYaw.value = o.yaw;
      u.uPitch.value = o.pitch;
      setRgb(u.uBeamColor.value as Float32Array, L.beamColor);
    };

    const renderStill = () => {
      syncUniforms();
      renderer.render({ scene: mesh });
    };
    renderStillRef.current = renderStill;

    measureRef.current = ({ width, height, dpr }) => {
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
      const o = orbit.current;
      const wantMotion = L.paused || L.reducedMotion ? 0 : 1;
      motion += (wantMotion - motion) * Math.min(1, dt * 4);
      if (wantMotion === 0 && motion < 0.001) motion = 0;

      simTime += dt * motion;
      if (simTime > TIME_WRAP) simTime -= TIME_WRAP;

      const idle = !o.dragging;
      if (idle) {
        // momentum glide, then auto-rotate takes back over as it dies out
        o.yaw += o.velYaw * dt;
        o.pitch += o.velPitch * dt;
        const decay = Math.exp(-3.2 * dt);
        o.velYaw *= decay;
        o.velPitch *= decay;
        if (L.autoRotate) o.yaw += L.rotateSpeed * 0.5 * dt * motion;
      }
      o.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, o.pitch));

      syncUniforms();
      renderer.render({ scene: mesh });

      const settled =
        Math.abs(o.velYaw) < 0.001 &&
        Math.abs(o.velPitch) < 0.001 &&
        !o.dragging;
      if (wantMotion === 0 && motion === 0 && settled) return false;
    };
    drawRef.current = frame;

    // ── orbit gestures: geometry rotation, so the raw delta keeps its sign ──
    const onPointerDown = (e: PointerEvent) => {
      const o = orbit.current;
      o.dragging = true;
      o.velYaw = 0;
      o.velPitch = 0;
      o.lastX = e.clientX;
      o.lastY = e.clientY;
      container.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      const o = orbit.current;
      if (!o.dragging) return;
      const dx = e.clientX - o.lastX;
      const dy = e.clientY - o.lastY;
      o.lastX = e.clientX;
      o.lastY = e.clientY;
      o.yaw += dx * 0.006;
      o.pitch += dy * 0.006;
      o.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, o.pitch));
      o.velYaw = dx * 0.006 * 60;
      o.velPitch = dy * 0.006 * 60;
      // dragging while paused still repaints — start() draws one frame and
      // the body self-halts again if still paused.
      loop.start();
    };
    const endDrag = (e: PointerEvent) => {
      const o = orbit.current;
      if (!o.dragging) return;
      o.dragging = false;
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

  // Tuning while halted repaints one corrected still.
  useEffect(() => {
    renderStillRef.current?.();
  }, [dispersion, bands, beamIntensity, beamColor, saturation, fog]);

  // Re-arm on unpause; idempotent under a still state.
  useEffect(() => {
    loop.start();
  }, [paused, reducedMotion, autoRotate, rotateSpeed, loop]);

  if (fallback) {
    return (
      <div
        className={`relative h-full w-full overflow-hidden ${className}`.trim()}
        style={{
          background:
            "conic-gradient(from 210deg at 55% 45%, #ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, transparent 65%), #05010a",
        }}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      // touch-none on the canvas: a finger drag orbits instead of scrolling.
      className={`relative h-full w-full cursor-grab overflow-hidden active:cursor-grabbing [&_canvas]:touch-none ${className}`.trim()}
    />
  );
};

export default Prism;
