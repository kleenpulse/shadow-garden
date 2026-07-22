"use client";

import { useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";

interface AuroraProps {
  baseColor?: string;
  auroraColor?: string;
  auroraColor2?: string;
  speed?: number;
  intensity?: number;
  bands?: number;
  warp?: number;
  coverage?: number;
  grain?: number;
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

// Wrap accumulated sim time so iTime stays small — keeps the fbm/streak
// noise coordinates bounded and float32 precision intact across a long session.
const TIME_WRAP = 300.0;

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
uniform float uIntensity;
uniform float uBands;
uniform float uWarp;
uniform float uCoverage;
uniform float uGrain;
uniform vec3 uBaseColor;
uniform vec3 uAuroraColor;
uniform vec3 uAuroraColor2;
out vec4 fragColor;

// hash / value-noise helpers shared with Grainient's envelope
vec2 hash(vec2 p){p=vec2(dot(p,vec2(2127.1,81.17)),dot(p,vec2(1269.5,283.37)));return fract(sin(p)*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);float n=mix(mix(dot(-1.0+2.0*hash(i+vec2(0.0,0.0)),f-vec2(0.0,0.0)),dot(-1.0+2.0*hash(i+vec2(1.0,0.0)),f-vec2(1.0,0.0)),u.x),mix(dot(-1.0+2.0*hash(i+vec2(0.0,1.0)),f-vec2(0.0,1.0)),dot(-1.0+2.0*hash(i+vec2(1.0,1.0)),f-vec2(1.0,1.0)),u.x),u.y);return 0.5+0.5*n;}
float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.0+vec2(37.1,17.7);a*=0.5;}return v;}

void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  float px = (uv.x - 0.5) * aspect;   // aspect-corrected horizontal
  float vy = uv.y;                    // 0 bottom, 1 top
  float t = iTime;

  vec3 col = vec3(0.0);
  float lower = 1.0 - uCoverage;      // curtains reach down to here

  // CONSTANT bound + break so the loop stays a compile-time constant.
  for (int i = 0; i < 6; i++){
    if (float(i) >= uBands) break;
    float bf = float(i);

    // spread the band centers across the aspect-corrected field
    float slot = (bf + 0.5) / max(uBands, 1.0);
    float centerBase = (slot - 0.5) * 2.0 * aspect * 0.85;

    float freq = 1.3 + bf * 0.6;
    // wavy horizontal displacement varying with height + time -> curtains sway
    float disp = (fbm(vec2(vy * freq + t * uSpeed * 0.25, bf * 5.3)) - 0.5)
                 * uWarp * (aspect * 0.7);
    float cx = px - centerBase - disp;

    // soft vertical gaussian sheet
    float width = 0.10 + 0.06 * fbm(vec2(bf * 2.1, t * uSpeed * 0.10));
    float sheet = exp(-(cx * cx) / (2.0 * width * width));

    // top-weighted vertical falloff controlled by coverage
    float vfall = smoothstep(lower, lower + 0.35, vy)
                  * (1.0 - smoothstep(0.88, 1.02, vy));

    // intra-curtain vertical streaks (rays) scrolling in time
    float streak = fbm(vec2(cx * 9.0 + bf * 3.0, vy * 3.5 - t * uSpeed * 0.6));
    float rays = 0.55 + 0.65 * streak;

    // per-band colour blend between the two aurora hues
    float cmix = fbm(vec2(uv.x * 2.0 + bf, vy * 1.6 + t * uSpeed * 0.12));
    vec3 bandCol = mix(uAuroraColor, uAuroraColor2, clamp(cmix, 0.0, 1.0));

    float bright = sheet * vfall * rays * uIntensity;
    col += bandCol * bright;
  }

  // faint high-altitude glow toward the crown
  col += mix(uAuroraColor, uAuroraColor2, 0.5)
         * smoothstep(lower, 1.0, vy) * 0.04 * uIntensity;

  vec3 outc = uBaseColor + col;   // additive composite over the night base

  // hash-based grain
  float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  outc += (g - 0.5) * uGrain;

  outc = clamp(outc, 0.0, 1.0);
  fragColor = vec4(outc, 1.0);
}
`;

const Aurora = ({
  baseColor = "#05010a",
  auroraColor = "#a855f7",
  auroraColor2 = "#22d3ee",
  speed = 0.6,
  intensity = 1,
  bands = 3,
  warp = 1,
  coverage = 0.6,
  grain = 0.08,
  paused = false,
  reducedMotion = false,
  className = "",
}: AuroraProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [fallback, setFallback] = useState(false);

  // Mirror every tunable prop into a ref each render so the render loop reads
  // live values per-frame — the GL context is NEVER rebuilt while a control drags.
  const live = useRef({
    baseColor,
    auroraColor,
    auroraColor2,
    speed,
    intensity,
    bands,
    warp,
    coverage,
    grain,
    paused,
    reducedMotion,
  });
  live.current = {
    baseColor,
    auroraColor,
    auroraColor2,
    speed,
    intensity,
    bands,
    warp,
    coverage,
    grain,
    paused,
    reducedMotion,
  };

  const startLoopRef = useRef<(() => void) | null>(null);
  const renderStillRef = useRef<(() => void) | null>(null);

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

    const renderer = new Renderer({
      webgl: 2,
      alpha: true,
      antialias: false,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
    });
    const gl = renderer.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    container.appendChild(canvas);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new Float32Array([1, 1]) },
        uSpeed: { value: speed },
        uIntensity: { value: intensity },
        uBands: { value: bands },
        uWarp: { value: warp },
        uCoverage: { value: coverage },
        uGrain: { value: grain },
        uBaseColor: { value: new Float32Array(hexToRgb(baseColor)) },
        uAuroraColor: { value: new Float32Array(hexToRgb(auroraColor)) },
        uAuroraColor2: { value: new Float32Array(hexToRgb(auroraColor2)) },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });
    const u = program.uniforms as Record<string, { value: unknown }>;

    let simTime = 0;
    // eased motion scalar: 1 = running, 0 = fully still. Pausing eases it to a stop.
    let motion = live.current.paused || live.current.reducedMotion ? 0 : 1;
    let raf = 0;
    let running = false;
    let last = performance.now();
    let isVisible = true;
    let isPageVisible = !document.hidden;

    const syncUniforms = () => {
      const L = live.current;
      u.iTime.value = simTime;
      u.uSpeed.value = L.speed;
      u.uIntensity.value = L.intensity;
      u.uBands.value = L.bands;
      u.uWarp.value = L.warp;
      u.uCoverage.value = L.coverage;
      u.uGrain.value = L.grain;
      setRgb(u.uBaseColor.value as Float32Array, L.baseColor);
      setRgb(u.uAuroraColor.value as Float32Array, L.auroraColor);
      setRgb(u.uAuroraColor2.value as Float32Array, L.auroraColor2);
    };

    const renderStill = () => {
      syncUniforms();
      renderer.render({ scene: mesh });
    };
    renderStillRef.current = renderStill;

    const setSize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      renderer.setSize(w, h);
      const res = (u.iResolution as { value: Float32Array }).value;
      res[0] = gl.drawingBufferWidth;
      res[1] = gl.drawingBufferHeight;
      // repaint one corrected frame, then re-arm so a halted canvas isn't stale
      renderStill();
      startLoop();
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const L = live.current;
      const wantMotion =
        !isVisible || !isPageVisible || L.paused || L.reducedMotion ? 0 : 1;
      motion += (wantMotion - motion) * Math.min(1, dt * 4);
      if (wantMotion === 0 && motion < 0.001) motion = 0;

      simTime += dt * motion;
      if (simTime > TIME_WRAP) simTime -= TIME_WRAP;

      syncUniforms();
      renderer.render({ scene: mesh });

      // Self-halt: once eased to a full stop, stop scheduling frames.
      if (wantMotion === 0 && motion === 0) {
        running = false;
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    const startLoop = () => {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    startLoopRef.current = startLoop;

    const ro = new ResizeObserver(setSize);
    ro.observe(container);

    const io = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        if (isVisible) startLoop();
      },
      { threshold: 0 },
    );
    io.observe(container);

    const onVisibility = () => {
      isPageVisible = !document.hidden;
      if (isPageVisible) startLoop();
    };
    document.addEventListener("visibilitychange", onVisibility);

    setSize(); // sizes, bakes a still frame, and arms the loop

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      startLoopRef.current = null;
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
    baseColor,
    auroraColor,
    auroraColor2,
    speed,
    intensity,
    bands,
    warp,
    coverage,
    grain,
  ]);

  // Effect 3: re-arm on unpause / reduced-motion change. startLoop is idempotent
  // (no-op while running); when re-armed under a still state it bakes one frame
  // and self-halts.
  useEffect(() => {
    startLoopRef.current?.();
  }, [paused, reducedMotion]);

  if (fallback) {
    const style: React.CSSProperties = {
      background:
        `radial-gradient(130% 80% at 32% -5%, ${auroraColor}cc, transparent 58%),` +
        `radial-gradient(120% 75% at 68% 4%, ${auroraColor2}99, transparent 55%),` +
        `${baseColor}`,
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
    />
  );
};

export default Aurora;
