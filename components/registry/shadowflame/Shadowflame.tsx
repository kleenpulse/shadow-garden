"use client";

import { useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

interface ShadowflameProps {
  coreColor?: string;
  flameColor?: string;
  backgroundColor?: string;
  speed?: number;
  warp?: number;
  /** fbm octaves, 1-6 (integer). Higher = more filigree in the flame. */
  detail?: number;
  shimmer?: number;
  /** How far up the frame the flame rises before tapering out, 0.2-1. */
  height?: number;
  grain?: number;
  /** Horizontal spread of the flame, 0.3-2. */
  flameWidth?: number;
  /** Number of rising fire sparks (0 = off). */
  sparkCount?: number;
  /** Spark core radius in px (tiny). */
  sparkSize?: number;
  /** Spark rise speed multiplier. */
  sparkSpeed?: number;
  paused?: boolean;
  reducedMotion?: boolean;
  className?: string;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [1, 1, 1];
  return [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255,
  ];
};

const setRgb = (arr: Float32Array, hex: string) => {
  const c = hexToRgb(hex);
  arr[0] = c[0];
  arr[1] = c[1];
  arr[2] = c[2];
};

// Wrap accumulated sim time so iTime stays small — keeps the fbm/domain-warp
// noise coordinates bounded and float32 precision intact across a long session.
const TIME_WRAP = 300.0;

type Spark = {
  x: number;
  y: number;
  vy: number;
  sway: number;
  size: number;
  life: number;
  maxLife: number;
  seed: number;
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
uniform float uSpeed;
uniform float uWarp;
uniform float uDetail;
uniform float uShimmer;
uniform float uHeight;
uniform float uWidth;
uniform float uGrain;
uniform vec3 uCoreColor;
uniform vec3 uFlameColor;
uniform vec3 uBgColor;
out vec4 fragColor;

vec2 hash(vec2 p){
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  float n = mix(
    mix(dot(-1.0 + 2.0 * hash(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
        dot(-1.0 + 2.0 * hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(-1.0 + 2.0 * hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
        dot(-1.0 + 2.0 * hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y);
  return 0.5 + 0.5 * n;
}
// CONSTANT bound + break keeps the octave loop a compile-time constant while
// still honouring the live "detail" control (1..6 octaves).
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++){
    if (float(i) >= uDetail) break;
    v += a * noise(p);
    p = p * 2.0 + vec2(37.1, 17.7);
    a *= 0.5;
  }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  float t = iTime;
  float vy = uv.y;                      // 0 bottom, 1 top

  // Heat shimmer: horizontally offset the sample point, stronger higher up.
  float shim = sin(vy * 22.0 - t * uSpeed * 1.5) * uShimmer * 0.03 * vy;
  vec2 p = vec2((uv.x - 0.5) * aspect + shim, vy);

  // Flame field scrolls upward over time.
  vec2 fp = vec2(p.x * 3.0, p.y * 3.2 - t * uSpeed * 1.2);

  // Domain warp — the signature swirling licks of flame.
  vec2 warped = fp + uWarp * vec2(
    fbm(fp + vec2(0.0, t * uSpeed * 0.6)),
    fbm(fp + vec2(7.0, t * uSpeed * 0.6 + 7.0))
  );
  float density = fbm(warped);

  // Vertical taper: dense at the base, fading out by uHeight.
  float taper = 1.0 - smoothstep(0.0, uHeight, vy);
  // Base intake so the flame roots solidly at the very bottom.
  taper = max(taper, (1.0 - smoothstep(0.0, 0.12, vy)) * 0.9);

  // Horizontal envelope — a broad base narrowing into a licking tip.
  float wide = mix(0.62, 0.06, smoothstep(0.0, uHeight, vy)) * uWidth;
  float horiz = 1.0 - smoothstep(wide * 0.55, wide, abs(p.x));

  float flame = clamp(density * taper * horiz, 0.0, 1.0);
  flame = pow(flame, 1.25);

  // Colour ramp: background -> dark flame body -> amethyst core near the base.
  vec3 col = uBgColor;
  col = mix(col, uFlameColor, smoothstep(0.12, 0.55, flame));
  // Amethyst self-illumination so the dark flame reads as light against the void,
  // not black-on-black — the whole lick glows, the core just burns brightest.
  col += uCoreColor * pow(flame, 1.6) * 0.32;

  // Amethyst core: only the hottest density, weighted toward the base.
  float baseWeight = 1.0 - smoothstep(uHeight * 0.35, uHeight * 0.95, vy);
  float coreMask = smoothstep(0.45, 0.9, flame) * baseWeight;
  col = mix(col, uCoreColor, coreMask);
  // Soft additive bloom so the core reads as emitted light, not a flat fill.
  col += uCoreColor * pow(coreMask, 2.0) * 0.35;

  // Film grain — animated hash keyed off the pixel and fractional time.
  float g = fract(sin(dot(gl_FragCoord.xy + fract(iTime), vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * uGrain;

  col = clamp(col, 0.0, 1.0);
  fragColor = vec4(col, 1.0);
}
`;

const Shadowflame = ({
  coreColor = "#a855f7",
  flameColor = "#630475",
  backgroundColor = "#05010a",
  speed = 0.6,
  warp = 1,
  detail = 4,
  shimmer = 0.5,
  height = 0.7,
  grain = 0.05,
  flameWidth = 1,
  sparkCount = 60,
  sparkSize = 1.2,
  sparkSpeed = 1,
  paused = false,
  reducedMotion = false,
  className = "",
}: ShadowflameProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sparkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fallback, setFallback] = useState(false);

  // Mirror every tunable prop into a ref each render so the render loop reads
  // live values per-frame — the GL context is NEVER rebuilt while a control drags.
  const live = useRef({
    coreColor,
    flameColor,
    backgroundColor,
    speed,
    warp,
    detail,
    shimmer,
    height,
    grain,
    flameWidth,
    sparkCount,
    sparkSize,
    sparkSpeed,
    paused,
    reducedMotion,
  });
  live.current = {
    coreColor,
    flameColor,
    backgroundColor,
    speed,
    warp,
    detail,
    shimmer,
    height,
    grain,
    flameWidth,
    sparkCount,
    sparkSize,
    sparkSpeed,
    paused,
    reducedMotion,
  };

  const renderStillRef = useRef<(() => void) | null>(null);
  const drawRef = useRef<((dt: number) => void | false) | null>(null);
  const measureRef = useRef<((m: Metrics) => void) | null>(null);
  const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(
    null,
  );

  // `halted` stays false — motion eases to a stop and the frame body decides
  // when it has settled, and it also halts when off-screen or backgrounded.
  const loop = useAnimationLoop({
    target: containerRef,
    halted: false,
    dpr: "auto",
    onResize: (metrics) => measureRef.current?.(metrics),
    onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
    gl: () => glRef.current,
  });

  // Effect 1: build the WebGL2 context once, drive the self-halting loop.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // CSS-gradient fallback when WebGL2 is unavailable — never a blank canvas.
    const probe = document.createElement("canvas").getContext("webgl2");
    if (!probe) {
      setFallback(true);
      return;
    }

    let renderer: Renderer;
    try {
      renderer = new Renderer({
        webgl: 2,
        alpha: false,
        antialias: false,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      });
    } catch {
      setFallback(true);
      return;
    }
    const gl = renderer.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    // Out of flow — an in-flow canvas with an explicit pixel width holds the
    // container open, so it never shrinks and the observer never fires.
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
        uSpeed: { value: speed },
        uWarp: { value: warp },
        uDetail: { value: detail },
        uShimmer: { value: shimmer },
        uHeight: { value: height },
        uWidth: { value: flameWidth },
        uGrain: { value: grain },
        uCoreColor: { value: new Float32Array(hexToRgb(coreColor)) },
        uFlameColor: { value: new Float32Array(hexToRgb(flameColor)) },
        uBgColor: { value: new Float32Array(hexToRgb(backgroundColor)) },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });
    const u = program.uniforms as Record<string, { value: unknown }>;

    // --- Fire-spark overlay: tiny discrete embers rising over the flame, drawn
    // on a 2D canvas above the WebGL canvas and driven by this same frame loop
    // (so pause / reduced-motion settle flame and sparks together). Keep them
    // SMALL and additive — big glows wash out to white. ---
    const sparkCanvas = sparkCanvasRef.current;
    const sctx = sparkCanvas ? sparkCanvas.getContext("2d") : null;
    const sparkDpr = Math.min(window.devicePixelRatio || 1, 2);
    let sparkW = 0;
    let sparkH = 0;
    let sparks: Spark[] = [];

    const makeSpark = (fresh: boolean): Spark => {
      const L = live.current;
      const halfW = sparkW * 0.3 * (L.flameWidth as number);
      const rx = Math.random() + Math.random() - 1; // triangular, centre-biased
      return {
        x: sparkW / 2 + rx * halfW,
        y: fresh ? sparkH + Math.random() * 12 : Math.random() * sparkH,
        vy: 0.6 + Math.random() * 1.4,
        sway: Math.random() * Math.PI * 2,
        size: (L.sparkSize as number) * (0.6 + Math.random() * 0.9),
        life: fresh ? 0 : Math.random(),
        maxLife: 90 + Math.random() * 90,
        seed: Math.random() * Math.PI * 2,
      };
    };

    const syncSparkCount = () => {
      const target = Math.max(0, Math.round(live.current.sparkCount as number));
      if (sparks.length > target) sparks.length = target;
      else while (sparks.length < target) sparks.push(makeSpark(false));
    };

    const stepAndDrawSparks = (dt: number, m: number) => {
      if (!sctx) return;
      sctx.clearRect(0, 0, sparkW, sparkH);
      syncSparkCount();
      if (sparks.length === 0) return;
      const L = live.current;
      const rise = (L.sparkSpeed as number) * m;
      const cc = hexToRgb(L.coreColor as string);
      const cr = (cc[0] * 255) | 0;
      const cg = (cc[1] * 255) | 0;
      const cb = (cc[2] * 255) | 0;
      const fscale = Math.min(3, dt * 60); // normalise toward per-frame at 60fps
      sctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < sparks.length; i++) {
        const s = sparks[i];
        s.y -= s.vy * rise * 1.4 * fscale;
        s.x += Math.sin(s.sway + s.y * 0.03) * 0.6 * rise * fscale;
        s.life += (1 / s.maxLife) * (0.4 + m) * fscale;
        if (s.y < -4 || s.life >= 1) {
          sparks[i] = makeSpark(true);
          continue;
        }
        const heightFrac = 1 - s.y / (sparkH || 1);
        const fade =
          Math.min(1, s.life * 6) * Math.min(1, (1 - heightFrac) * 2 + 0.05);
        const flick = 0.6 + 0.4 * Math.sin(s.seed + s.y * 0.15);
        const a = fade * flick * (0.5 + 0.5 * m);
        if (a <= 0.01) continue;
        const rad = s.size * (1 - heightFrac * 0.5);
        sctx.globalAlpha = Math.min(1, a);
        sctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        sctx.beginPath();
        sctx.arc(s.x, s.y, rad + 0.8, 0, Math.PI * 2);
        sctx.fill();
        sctx.globalAlpha = Math.min(1, a * 0.9);
        sctx.fillStyle = "rgb(255,255,255)";
        sctx.beginPath();
        sctx.arc(s.x, s.y, Math.max(0.4, rad * 0.5), 0, Math.PI * 2);
        sctx.fill();
      }
      sctx.globalAlpha = 1;
    };

    let simTime = 0;
    // eased motion scalar: 1 = running, 0 = fully still. Pausing eases it to a stop.
    let motion = live.current.paused || live.current.reducedMotion ? 0 : 1;
    let isVisible = true;
    let isPageVisible = !document.hidden;

    const syncUniforms = () => {
      const L = live.current;
      u.iTime.value = simTime;
      u.uSpeed.value = L.speed;
      u.uWarp.value = L.warp;
      u.uDetail.value = L.detail;
      u.uShimmer.value = L.shimmer;
      u.uHeight.value = L.height;
      u.uWidth.value = L.flameWidth;
      u.uGrain.value = L.grain;
      setRgb(u.uCoreColor.value as Float32Array, L.coreColor);
      setRgb(u.uFlameColor.value as Float32Array, L.flameColor);
      setRgb(u.uBgColor.value as Float32Array, L.backgroundColor);
    };

    const renderStill = () => {
      syncUniforms();
      renderer.render({ scene: mesh });
      stepAndDrawSparks(0, motion);
    };
    renderStillRef.current = renderStill;

    glRef.current = gl;
    measureRef.current = ({ width, height, dpr }) => {
      const w = Math.max(1, Math.floor(width));
      const h = Math.max(1, Math.floor(height));
      if (w === 0 || h === 0) return;
      renderer.dpr = dpr;
      renderer.setSize(w, h);
      const res = (u.iResolution as { value: Float32Array }).value;
      res[0] = gl.drawingBufferWidth;
      res[1] = gl.drawingBufferHeight;
      if (sparkCanvas && sctx) {
        sparkCanvas.width = Math.floor(w * sparkDpr);
        sparkCanvas.height = Math.floor(h * sparkDpr);
        sparkW = w;
        sparkH = h;
        sctx.setTransform(sparkDpr, 0, 0, sparkDpr, 0, 0);
      }
      // Bake one corrected still so a halted canvas is never stale; the host
      // paints a frame of its own straight after.
      renderStill();
    };

    const frame = (dt: number) => {
      const L = live.current;
      const wantMotion =
        !isVisible || !isPageVisible || L.paused || L.reducedMotion ? 0 : 1;
      motion += (wantMotion - motion) * Math.min(1, dt * 4);
      if (wantMotion === 0 && motion < 0.001) motion = 0;

      simTime += dt * motion;
      if (simTime > TIME_WRAP) simTime -= TIME_WRAP;

      syncUniforms();
      renderer.render({ scene: mesh });
      stepAndDrawSparks(dt, motion);

      // Self-halt: once eased to a full stop, stop scheduling frames.
      if (wantMotion === 0 && motion === 0) return false;
    };
    drawRef.current = frame;

    const io = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        if (isVisible) loop.start();
      },
      { threshold: 0 },
    );
    io.observe(container);

    const onVisibility = () => {
      isPageVisible = !document.hidden;
      if (isPageVisible) loop.start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    loop.resize();
    loop.start();

    return () => {
      drawRef.current = null;
      measureRef.current = null;
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      renderStillRef.current = null;
      try {
        container.removeChild(canvas);
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // renderer created once

  // Effect 2: props changed. If the loop is halted (paused/reduced), repaint one
  // still frame so tuning stays visible; the running loop already picks up `live`.
  useEffect(() => {
    renderStillRef.current?.();
  }, [
    coreColor,
    flameColor,
    backgroundColor,
    speed,
    warp,
    detail,
    shimmer,
    height,
    grain,
    flameWidth,
    sparkCount,
    sparkSize,
    sparkSpeed,
  ]);

  // Effect 3: re-arm on unpause / reduced-motion change. start() is idempotent;
  // re-armed under a still state it bakes one frame and self-halts.
  useEffect(() => {
    loop.start();
  }, [paused, reducedMotion, loop]);

  if (fallback) {
    const style: React.CSSProperties = {
      background:
        `radial-gradient(60% 55% at 50% 108%, ${coreColor}dd, transparent 60%),` +
        `radial-gradient(85% 70% at 50% 118%, ${flameColor}cc, transparent 62%),` +
        `${backgroundColor}`,
    };
    return (
      <div
        className={`relative h-full w-full overflow-hidden ${className}`.trim()}
        style={style}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden ${className}`.trim()}
    >
      <canvas
        ref={sparkCanvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 2,
          pointerEvents: "none",
        }}
      />
    </div>
  );
};

export default Shadowflame;
