"use client";

import { useEffect, useRef } from "react";
import { useAnimationLoop } from "@/hooks/use-animation-loop";

export interface HorizonAuroraProps {
  /** Which edge the horizon lies along. "top" hangs the light from the top edge instead. */
  position?: "bottom" | "top";
  /** Distance of the horizon line from its edge, as a fraction of the height. */
  horizon?: number;
  /** How far the horizon bows down toward the corners. */
  curvature?: number;
  /** How high the smoke climbs off the horizon. */
  reach?: number;
  speed?: number;
  intensity?: number;
  /** How hard the plume leans toward the pointer. 0 turns the pointer off. */
  pull?: number;
  coreColor?: string;
  hazeColor?: string;
  skyColor?: string;
  paused?: boolean;
  reducedMotion?: boolean;
  className?: string;
}

const VERTEX = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

// Units are pane heights: y = 0 on the horizon's edge, x runs 0 to aspect.
const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform float uFlip;
uniform float uTime;
uniform vec3 uPointer; // x, y, pull (0 to 1)
uniform vec3 uCore;
uniform vec3 uHaze;
uniform float uHorizon;
uniform float uCurve;
uniform float uReach;
uniform float uIntensity;

// Sin-free hash: stays stable as the drift carries the noise coordinates far from the origin.
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(17.3, 9.1); a *= 0.5; }
  return v;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  if (uFlip > 0.5) frag.y = uRes.y - frag.y;
  vec2 p = frag / uRes.y;
  float aspect = uRes.x / uRes.y;
  float cx = p.x - aspect * 0.5;
  float t = uTime;

  // The horizon arcs down at the edges, so the light tapers into the corners.
  float d = p.y - uHorizon + cx * cx * (uCurve / aspect);

  // Near the pointer the strands lean toward it and the light climbs to meet it.
  float dx = uPointer.x - p.x;
  float near = uPointer.z * exp(-dx * dx * 1.6) * exp(-max(uPointer.y - uHorizon - 0.3 * uReach, 0.0) * 1.5);
  float lean = 0.3 * sin(t * 0.07 + cx * 1.3) + clamp(dx, -0.7, 0.7) * near * 2.4;

  // Shear the field along the lean: noise stretched that way reads as strands of smoke.
  vec2 q = vec2(cx - d * lean, d / uReach);
  vec2 warp = vec2(fbm(q * vec2(1.4, 2.2) + vec2(t * 0.04, -t * 0.07)),
                   fbm(q * vec2(1.4, 2.2) + vec2(5.2, 1.3) - t * 0.05));
  float body = fbm(vec2(q.x * 1.6 + warp.x * 1.2 + t * 0.03, q.y * 1.4 + warp.y * 0.8 - t * 0.06));
  float strands = fbm(vec2(q.x * 7.0 + warp.x * 2.5, q.y * 1.1 - t * 0.09));

  float reach = (0.06 + 0.24 * body * body + near * 0.3) * uReach;
  float density = exp(-max(d, 0.0) / reach) * (0.35 + 1.3 * strands * body) * (1.0 + 0.9 * near);
  // A bright rim right on the horizon, the way light pools at the edge of a planet.
  density += exp(-max(d, 0.0) / 0.025) * 0.45;
  density *= smoothstep(-0.03, 0.0, d);
  // Gone before the top edge, wherever the horizon sits and whatever the pointer pulls up.
  density *= 1.0 - smoothstep(0.45 * uReach, 0.95 * uReach, d);
  density *= 1.0 - smoothstep(0.82, 1.0, p.y);
  density *= uIntensity;

  // Thin smoke falls off fast, and it blends mostly as light:
  // alpha below coverage, so the sky behind stays lit.
  float a = pow(clamp(density, 0.0, 1.0), 1.5);
  vec3 col = mix(uHaze, uCore, smoothstep(0.35, 0.95, density));
  gl_FragColor = vec4(col * a, a * 0.7);
}
`;

function hexToRgb01(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  if (h.length !== 6) return [1, 1, 1];
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

/**
 * Smoky first light on a curved horizon, drifting on its own and leaning toward
 * the pointer. Fills its parent. Without WebGL it falls back to a still glow.
 */
export default function HorizonAurora({
  position = "bottom",
  horizon = 0,
  curvature = 0.3,
  reach = 1,
  speed = 1,
  intensity = 1,
  pull = 1,
  coreColor = "#e9d5ff",
  hazeColor = "#a855f7",
  skyColor = "#07060b",
  paused = false,
  reducedMotion = false,
  className = "",
}: HorizonAuroraProps) {
  const ref = useRef<HTMLDivElement>(null);
  const draw = useRef<((dt: number) => void) | null>(null);
  const sized = useRef<((w: number, h: number) => void) | null>(null);
  const fallback = useRef<HTMLDivElement>(null);

  const live = useRef({ position, horizon, curvature, reach, speed, intensity, pull, coreColor, hazeColor });
  live.current = { position, horizon, curvature, reach, speed, intensity, pull, coreColor, hazeColor };

  const loop = useAnimationLoop({
    target: ref,
    halted: paused || reducedMotion,
    dpr: 1, // A soft field: device pixels would cost fill-rate for nothing.
    onResize: ({ bufferWidth, bufferHeight }) => sized.current?.(bufferWidth, bufferHeight),
    onFrame: ({ dt }) => (draw.current ? draw.current(reducedMotion ? 0 : dt) : false),
  });

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    // A fresh canvas per setup: Strict Mode's rerun must not inherit a context the cleanup lost.
    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 size-full";
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false });
    const vs = gl && compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = gl && compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl?.createProgram();
    if (gl && vs && fs && program) {
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
    }
    if (!gl || !program || !gl.getProgramParameter(program, gl.LINK_STATUS)) {
      fallback.current?.removeAttribute("hidden");
      return () => fallback.current?.setAttribute("hidden", "");
    }
    host.append(canvas);
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const at = (name: string) => gl.getUniformLocation(program, name);
    const uRes = at("uRes");
    const uFlip = at("uFlip");
    const uTime = at("uTime");
    const uPointer = at("uPointer");
    const uCore = at("uCore");
    const uHaze = at("uHaze");
    const uHorizon = at("uHorizon");
    const uCurve = at("uCurve");
    const uReach = at("uReach");
    const uIntensity = at("uIntensity");

    // Pointer in pane-height units, eased so the smoke drifts after it rather than snapping.
    const target = { x: 0, y: 0, pull: 0 };
    const eased = { x: 0, y: 0, pull: 0 };
    let time = 40; // Start mid-drift, not on the noise's tidy origin.

    const onMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      if (!rect.height) return;
      const inside =
        e.pointerType !== "touch" &&
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      target.pull = inside ? 1 : 0;
      // Outside, the anchor stays where the pointer left: the plume sinks in
      // place instead of chasing the pointer away and thinning out early.
      if (!inside) return;
      target.x = (e.clientX - rect.left) / rect.height;
      target.y = (live.current.position === "top" ? e.clientY - rect.top : rect.bottom - e.clientY) / rect.height;
      if (eased.pull < 0.01) Object.assign(eased, { x: target.x, y: target.y });
    };
    const onLeave = () => {
      target.pull = 0;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);

    sized.current = (w, h) => {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    };
    draw.current = (dt) => {
      const l = live.current;
      // Accumulated rather than elapsed * speed, so retuning the speed never jumps the drift.
      time += dt * l.speed;
      const k = Math.min(1, dt * 2.2);
      eased.x += (target.x - eased.x) * k;
      eased.y += (target.y - eased.y) * k;
      // Settles back slower than it gathers, so letting go reads as the smoke drifting home.
      const rate = target.pull > eased.pull ? 1.5 : 0.9;
      eased.pull += (target.pull - eased.pull) * Math.min(1, dt * rate);
      gl.uniform1f(uTime, time);
      gl.uniform1f(uFlip, l.position === "top" ? 1 : 0);
      gl.uniform3f(uPointer, eased.x, eased.y, eased.pull * l.pull);
      gl.uniform3fv(uCore, hexToRgb01(l.coreColor));
      gl.uniform3fv(uHaze, hexToRgb01(l.hazeColor));
      gl.uniform1f(uHorizon, l.horizon);
      gl.uniform1f(uCurve, l.curvature);
      gl.uniform1f(uReach, Math.max(0.05, l.reach));
      gl.uniform1f(uIntensity, l.intensity);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    loop.resize();
    loop.start();

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      draw.current = null;
      sized.current = null;
      canvas.remove();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [loop]);

  // Tuning while paused still repaints one still frame.
  useEffect(() => {
    loop.paint();
  }, [position, horizon, curvature, reach, intensity, pull, coreColor, hazeColor, loop]);

  return (
    <div
      ref={ref}
      aria-hidden
      className={`pointer-events-none relative h-full w-full overflow-hidden ${className}`.trim()}
      style={{ backgroundColor: skyColor }}
    >
      <div
        ref={fallback}
        hidden
        className="absolute inset-x-0"
        style={{
          [position]: `${horizon * 100}%`,
          height: "70%",
          background: `radial-gradient(60% 100% at 50% ${position === "top" ? "0%" : "100%"}, ${hazeColor}66, ${hazeColor}1a 55%, transparent)`,
        }}
      />
    </div>
  );
}
