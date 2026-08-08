"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle, Texture } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A live material poured into real type.
//
// Three decisions carry this.
//
// **The real text stays in the DOM at `color: transparent`.** It is selectable,
// searchable, indexable and read aloud exactly once. The canvas sits on top and
// is the only thing anyone sees, which means nothing has to *register* against
// the glyphs — the mask is rasterised from the same node with the same computed
// font, so it lines up by construction rather than by measurement.
//
// **The mask is rebuilt on resize and after fonts settle, never per frame.**
// `document.fonts.ready` matters: rasterising before the webfont lands bakes the
// fallback's letterforms into the texture and they never update, so the headline
// silently wears the wrong typeface for the life of the page.
//
// **The renderer is the only alpha:true one in this catalogue.** The material
// has to composite over whatever the page put behind the heading, so the canvas
// cannot own its background.
export type InlayMaterial = "molten" | "aurora" | "chrome" | "embers" | "tide";

interface InlayProps {
  /** The line to fill. Stays a real text node underneath. */
  text?: string;
  /** What is poured into the letterforms. */
  material?: InlayMaterial;
  /** Rate the material flows. */
  flowSpeed?: number;
  /** Size of the material's features relative to the type. */
  scale?: number;
  /** Seconds for the material to pour across the line on mount. */
  sweep?: number;
  /** Bloom bleeding past the glyph edge. */
  glow?: number;
  /** Dither over the fill. */
  grain?: number;
  /** How much the material's coordinates are dragged before sampling. */
  warp?: number;
  /** How much the material accelerates under the pointer. */
  hoverBoost?: number;
  colorA?: string;
  colorB?: string;
  /** Halt the loop. The material sets. */
  paused?: boolean;
  /** The material holds still. The type stays filled. */
  reducedMotion?: boolean;
  className?: string;
}

const MATERIAL_ID: Record<string, number> = {
  molten: 0, aurora: 1, chrome: 2, embers: 3, tide: 4,
};

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
in vec2 uv;
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }`;

const fragment = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uMask;
uniform vec2  uResolution;
uniform float uTime;
uniform float uMaterial;
uniform float uScale;
uniform float uSweep;
uniform float uGlow;
uniform float uGrain;
uniform float uWarp;
uniform float uBoost;
uniform vec2  uPointer;
uniform vec3  uA;
uniform vec3  uB;

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.56);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}

vec3 materialAt(vec2 p, float t) {
  if (uMaterial < 0.5) {
    float v = fbm(p + vec2(t * 0.6, t * 0.2));
    float veins = smoothstep(0.42, 0.72, v);
    return mix(uA * 0.35, uB, veins) + uB * pow(veins, 3.0) * 0.6;
  }
  if (uMaterial < 1.5) {
    float band = fbm(p * vec2(0.7, 2.2) + vec2(t * 0.35, 0.0));
    return mix(uA, uB, smoothstep(0.25, 0.85, band)) * (0.7 + 0.6 * band);
  }
  if (uMaterial < 2.5) {
    // Chrome: hard light-to-dark steps rather than a gradient. The sharpness of
    // the transition is what reads as metal.
    float h = fbm(p * 1.4 + vec2(t * 0.25, 0.0));
    float step1 = smoothstep(0.44, 0.5, h);
    float step2 = smoothstep(0.62, 0.66, h);
    vec3 base = mix(uA * 0.25, vec3(0.85), step1);
    return mix(base, uB, step2 * 0.7);
  }
  if (uMaterial < 3.5) {
    float heat = fbm(p * 1.6 - vec2(0.0, t * 1.1));
    float core = smoothstep(0.35, 0.9, heat);
    return mix(uA * 0.2, uB, core) + vec3(1.0, 0.55, 0.15) * pow(core, 4.0) * 0.9;
  }
  float w = sin(p.x * 2.2 + t) * 0.5 + fbm(p + t * 0.15);
  return mix(uA, uB, smoothstep(-0.2, 1.2, w));
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = vec2(uv.x * aspect, uv.y) * max(uScale, 0.05) * 3.0;

  float t = uTime * (1.0 + uBoost);
  vec2 warp = vec2(fbm(p + t * 0.2), fbm(p.yx + 4.1 - t * 0.15)) - 0.5;
  vec3 col = materialAt(p + warp * uWarp * 1.6, t);

  // The pour runs against the glyph's own horizontal position, so it follows the
  // letterforms instead of a rectangle crossing them.
  float pour = uSweep <= 0.001 ? 1.0 : smoothstep(0.0, 1.0, (uTime / max(uSweep, 0.02)) - uv.x * 0.9);
  col *= pour;

  float mask = texture(uMask, vec2(uv.x, 1.0 - uv.y)).a;

  // Bloom taps the mask around the fragment rather than blurring the material —
  // the glow has to belong to the glyph edge, not to whatever colour happens to
  // sit near it.
  vec2 px = 1.0 / max(uResolution, vec2(1.0));
  float halo = 0.0;
  halo += texture(uMask, vec2(uv.x + px.x * 3.0, 1.0 - uv.y)).a;
  halo += texture(uMask, vec2(uv.x - px.x * 3.0, 1.0 - uv.y)).a;
  halo += texture(uMask, vec2(uv.x, 1.0 - uv.y + px.y * 3.0)).a;
  halo += texture(uMask, vec2(uv.x, 1.0 - uv.y - px.y * 3.0)).a;
  halo *= 0.25;

  float g = hash21(gl_FragCoord.xy) - 0.5;
  col += g * uGrain * 0.35;

  float pointerLift = exp(-dot(uv - uPointer, uv - uPointer) * 18.0) * uBoost * 0.4;
  col *= 1.0 + pointerLift;

  float alpha = clamp(mask + halo * uGlow * 0.55, 0.0, 1.0) * pour;
  fragColor = vec4(col * alpha, alpha);
}`;

const Inlay = memo(
  ({
    text = "SHADOW GARDEN",
    material = "molten",
    flowSpeed = 0.4,
    scale = 1.6,
    sweep = 0.8,
    glow = 0.4,
    grain = 0.15,
    warp = 0.25,
    hoverBoost = 0.6,
    colorA = "#a855f7",
    colorB = "#38bdf8",
    paused = false,
    reducedMotion = false,
    className,
  }: InlayProps) => {
    const containerRef = useRef<HTMLSpanElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);
    const drawRef = useRef<((dt: number) => void | false) | null>(null);
    const measureRef = useRef<((m: Metrics) => void) | null>(null);
    const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(null);
    const pointer = useRef({ x: 0.5, y: 0.5, over: false });

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
      text, material, flowSpeed, scale, sweep, glow, grain, warp,
      hoverBoost, colorA, colorB,
    });
    live.current = {
      text, material, flowSpeed, scale, sweep, glow, grain, warp,
      hoverBoost, colorA, colorB,
    };

    useEffect(() => {
      if (!supportsWebGL2()) setFallback(true);
    }, []);

    useEffect(() => {
      const container = containerRef.current;
      if (fallback || !container) return;

      const renderer = new Renderer({
        webgl: 2,
        // The only alpha:true renderer in the catalogue — the material has to
        // composite over whatever the page put behind the heading.
        alpha: true,
        antialias: false,
        premultipliedAlpha: true,
        powerPreference: "high-performance",
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      });
      const glc = renderer.gl;
      const gl2 = glc as unknown as WebGL2RenderingContext;
      glRef.current = gl2;
      glc.clearColor(0, 0, 0, 0);

      const canvas = glc.canvas as HTMLCanvasElement;
      canvas.style.display = "block";
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      canvas.style.pointerEvents = "none";
      container.appendChild(canvas);

      const maskCanvas = document.createElement("canvas");
      const maskTexture = new Texture(glc, {
        image: maskCanvas,
        generateMipmaps: false,
        minFilter: gl2.LINEAR,
        magFilter: gl2.LINEAR,
        wrapS: gl2.CLAMP_TO_EDGE,
        wrapT: gl2.CLAMP_TO_EDGE,
        premultiplyAlpha: false,
        flipY: false,
      });

      const program = new Program(glc, {
        vertex,
        fragment,
        transparent: true,
        uniforms: {
          uMask: { value: maskTexture },
          uResolution: { value: new Float32Array([1, 1]) },
          uTime: { value: 0 },
          uMaterial: { value: MATERIAL_ID[material] ?? 0 },
          uScale: { value: scale },
          uSweep: { value: sweep },
          uGlow: { value: glow },
          uGrain: { value: grain },
          uWarp: { value: warp },
          uBoost: { value: 0 },
          uPointer: { value: new Float32Array([0.5, 0.5]) },
          uA: { value: new Float32Array(hexToRgb01(colorA)) },
          uB: { value: new Float32Array(hexToRgb01(colorB)) },
        },
      });
      const mesh = new Mesh(glc, { geometry: new Triangle(glc), program });
      const u = program.uniforms as Record<string, { value: unknown }>;

      let time = 0;
      let boost = 0;

      const rebuildMask = (w: number, h: number, dpr: number) => {
        const node = textRef.current;
        if (!node || w < 1 || h < 1) return;
        maskCanvas.width = Math.max(1, Math.round(w * dpr));
        maskCanvas.height = Math.max(1, Math.round(h * dpr));
        const ctx = maskCanvas.getContext("2d");
        if (!ctx) return;
        const cs = getComputedStyle(node);
        ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        ctx.scale(dpr, dpr);
        // The computed font of the real node, so the mask cannot disagree with
        // the text it is standing in for.
        ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} / ${cs.lineHeight} ${cs.fontFamily}`;
        ctx.letterSpacing = cs.letterSpacing;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff";
        ctx.fillText(live.current.text, w / 2, h / 2);
        maskTexture.image = maskCanvas;
        maskTexture.needsUpdate = true;
      };

      const sync = () => {
        const l = live.current;
        (u.uTime as { value: number }).value = time;
        (u.uMaterial as { value: number }).value = MATERIAL_ID[l.material] ?? 0;
        (u.uScale as { value: number }).value = l.scale;
        (u.uSweep as { value: number }).value = l.sweep;
        (u.uGlow as { value: number }).value = l.glow;
        (u.uGrain as { value: number }).value = l.grain;
        (u.uWarp as { value: number }).value = l.warp;
        (u.uBoost as { value: number }).value = boost;
        const pv = (u.uPointer as { value: Float32Array }).value;
        pv[0] = pointer.current.x;
        pv[1] = pointer.current.y;
        ((u.uA as { value: Float32Array }).value).set(hexToRgb01(l.colorA));
        ((u.uB as { value: Float32Array }).value).set(hexToRgb01(l.colorB));
      };

      drawRef.current = (dt) => {
        const l = live.current;
        time += dt * l.flowSpeed;
        const want = pointer.current.over ? l.hoverBoost : 0;
        boost += (want - boost) * Math.min(1, dt * 6);
        sync();
        renderer.render({ scene: mesh });
      };

      measureRef.current = ({ width, height, dpr }) => {
        renderer.dpr = dpr;
        renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
        const res = (u.uResolution as { value: Float32Array }).value;
        res[0] = glc.drawingBufferWidth;
        res[1] = glc.drawingBufferHeight;
        rebuildMask(width, height, dpr);
        sync();
        renderer.render({ scene: mesh });
      };

      loop.resize();
      loop.start();

      // Rasterising before the webfont lands bakes the fallback's letterforms in
      // and they never update — the heading then wears the wrong typeface for
      // the life of the page, silently.
      let disposed = false;
      document.fonts?.ready.then(() => {
        if (disposed) return;
        loop.resize();
      });

      return () => {
        disposed = true;
        drawRef.current = null;
        measureRef.current = null;
        if (container.contains(canvas)) container.removeChild(canvas);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fallback]);

    useEffect(() => {
      loop.resize();
    }, [text, loop]);

    useEffect(() => {
      loop.paint();
    }, [material, flowSpeed, scale, sweep, glow, grain, warp, hoverBoost, colorA, colorB, loop]);

    const track = (e: React.PointerEvent<HTMLSpanElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      pointer.current.x = (e.clientX - r.left) / r.width;
      pointer.current.y = 1 - (e.clientY - r.top) / r.height;
      pointer.current.over = true;
      loop.start();
    };
    const release = () => {
      pointer.current.over = false;
      loop.start();
    };

    if (fallback) {
      return (
        <span
          className={className ?? "relative inline-block"}
          style={{
            backgroundImage: `linear-gradient(100deg, ${colorA}, ${colorB})`,
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            color: "transparent",
          }}
        >
          {text}
        </span>
      );
    }

    return (
      <span
        ref={containerRef}
        className={className ?? "relative inline-block"}
        onPointerMove={track}
        onPointerLeave={release}
        onPointerCancel={release}
      >
        {/* The real text. Transparent, never hidden — display:none or
            visibility:hidden would take it out of the accessibility tree and out
            of find-in-page, which is the entire thing this component is trying
            not to give up. */}
        <span ref={textRef} style={{ color: "transparent" }}>
          {text}
        </span>
      </span>
    );
  },
);

Inlay.displayName = "Inlay";

export default Inlay;
