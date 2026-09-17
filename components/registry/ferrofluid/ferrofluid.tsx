"use client";

import { useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle, Color } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A pool of magnetic fluid. The body is a classic metaball sum evaluated per
// pixel; the cursor is a magnet held over it, which does two things a plain
// hover glow does not: the surface reaches toward the hand (a small extra blob
// rides under the pointer), and where the influence is strong the iso-surface
// grows a crown of radial needles — the spike instability that makes
// ferrofluid read as ferrofluid instead of as lava.
//
// The gradient is analytic, not sampled. ∇(r²/|d|²) = −2f·d/|d|², which falls
// out of the same loop that sums the field — so lighting costs nothing extra,
// where a finite-difference normal would quadruple the field evaluations and
// sink the software rasterizer the verify harness runs on.

function supportsWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

function hexToRgb01(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  if (h.length !== 6) return [1, 1, 1];
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const MAX_BLOBS = 9;

// Orbit tables, one row per blob. Every frequency is an integer, so every
// path closes over one 2π turn of the shared phase — the phase can wrap
// mod 2π forever without a single blob popping to a new position.
const AMPL: Array<[number, number]> = [
  [0.34, 0.2], [0.24, 0.3], [0.17, 0.24], [0.3, 0.15], [0.21, 0.32],
  [0.13, 0.19], [0.27, 0.23], [0.19, 0.13], [0.23, 0.28],
];
const FREQ: Array<[number, number]> = [
  [1, 2], [2, 1], [1, 1], [3, 2], [2, 3], [1, 3], [3, 1], [2, 2], [1, 2],
];
const SEED = [0, 0.9, 2.1, 3.3, 4.2, 5.1, 0.6, 1.7, 2.8];
const RADII = [0.15, 0.12, 0.1, 0.13, 0.11, 0.09, 0.12, 0.09, 0.11];

const vertexShader = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform vec2 uResolution;
uniform vec3 uBlobs[9];
uniform float uBlobCount;
uniform vec2 uMouse;
uniform float uMouseActive;
uniform float uCohesion;
uniform float uSpikes;
uniform float uSpikeFrequency;
uniform float uMagnetRadius;
uniform float uSheen;
uniform vec3 uFluidColor;
uniform vec3 uAccentColor;

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);

  float field = 0.0;
  vec2 grad = vec2(0.0);
  for (int i = 0; i < 9; i++) {
    if (float(i) >= uBlobCount) break;
    vec3 b = uBlobs[i];
    vec2 d = p - b.xy;
    float d2 = max(dot(d, d), 1e-5);
    float f = (b.z * b.z) / d2;
    field += f;
    grad += (-2.0 * f / d2) * d;
  }

  vec2 md = p - uMouse;
  float md2 = max(dot(md, md), 1e-5);
  float mf = uMouseActive * 0.0144 / md2;
  field += mf;
  grad += (-2.0 * mf / md2) * md;

  float mdist = sqrt(md2);
  float infl = uMouseActive * (1.0 - smoothstep(0.0, uMagnetRadius, mdist));
  float theta = atan(md.y, md.x);
  float crown = pow(abs(cos(theta * uSpikeFrequency * 0.5)), 6.0);
  field += uSpikes * infl * crown * 1.4;

  float iso = 1.0;
  float w = uCohesion;
  float body = smoothstep(iso - w * 0.5, iso + w * 0.5, field);
  if (body < 0.003) discard;

  float rim = body * (1.0 - smoothstep(iso, iso + w * 1.6, field));

  vec3 n = normalize(vec3(-grad * 0.08, 1.0));
  vec3 lightDir = normalize(vec3(-0.42, 0.58, 0.7));
  vec3 halfway = normalize(lightDir + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, halfway), 0.0), 30.0) * uSheen;
  float grazing = max(dot(n, lightDir), 0.0) * 0.12;

  vec3 color = uFluidColor
    + vec3(grazing)
    + uAccentColor * (spec * 1.1 + rim * 0.55 + infl * crown * body * 0.3);

  float alpha = body;
  gl_FragColor = vec4(color * alpha, alpha);
}
`;

export interface FerrofluidProps {
  /** Metaball count in the ambient orbit. */
  blobs?: number;
  /** Orbit speed of the blob field. */
  speed?: number;
  /** Iso-surface softness — how eagerly blobs merge into one body. */
  cohesion?: number;
  /** Needle amplitude where the cursor magnet touches the surface. */
  spikes?: number;
  /** Needles around the cursor — the tooth count of the spike crown. */
  spikeFrequency?: number;
  /** Cursor influence radius as a fraction of the pane. */
  magnetRadius?: number;
  /** Specular highlight strength on the fluid surface. */
  sheen?: number;
  /** Body of the fluid — near-black violet, read by its highlights. */
  fluidColor?: string;
  /** Rim light and specular tint on the iso edge. */
  accentColor?: string;
  paused?: boolean;
  reducedMotion?: boolean;
  className?: string;
}

const Ferrofluid = ({
  blobs = 5,
  speed = 1,
  cohesion = 0.35,
  spikes = 0.7,
  spikeFrequency = 14,
  magnetRadius = 0.35,
  sheen = 0.6,
  fluidColor = "#17121f",
  accentColor = "#c4b5fd",
  paused = false,
  reducedMotion = false,
  className = "",
}: FerrofluidProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const drawRef = useRef<((dt: number) => void | false) | null>(null);
  const measureRef = useRef<((m: Metrics) => void) | null>(null);
  const glRef = useRef<Renderer["gl"] | null>(null);
  const [failed, setFailed] = useState(false);

  // Live-tunable values read each frame — the GL context is never rebuilt
  // while a control is dragged.
  const live = useRef({
    blobs,
    speed,
    cohesion,
    spikes,
    spikeFrequency,
    magnetRadius,
    sheen,
    fluidColor,
    accentColor,
    paused,
    reducedMotion,
  });
  live.current = {
    blobs,
    speed,
    cohesion,
    spikes,
    spikeFrequency,
    magnetRadius,
    sheen,
    fluidColor,
    accentColor,
    paused,
    reducedMotion,
  };

  const loop = useAnimationLoop({
    target: containerRef,
    halted: paused || reducedMotion,
    dpr: "auto",
    onResize: (m) => measureRef.current?.(m),
    onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
    gl: () => glRef.current,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || failed) return;
    if (!supportsWebGL()) {
      setFailed(true);
      return;
    }

    let gl: Renderer["gl"] | undefined;
    try {
      const renderer = new Renderer({
        alpha: true,
        premultipliedAlpha: true,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      });
      gl = renderer.gl;
      gl.clearColor(0, 0, 0, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      // Out of flow, or ogl's explicit pixel width raises the container's
      // min-content width and the ResizeObserver never fires again.
      gl.canvas.style.position = "absolute";
      gl.canvas.style.top = "0";
      gl.canvas.style.left = "0";
      container.appendChild(gl.canvas);

      // Flat number[] on purpose: ogl silently drops a Float32Array handed to
      // an array uniform, and nine invisible blobs is a blank pane.
      const blobData: number[] = new Array(MAX_BLOBS * 3).fill(0);

      const geometry = new Triangle(gl);
      const program = new Program(gl, {
        vertex: vertexShader,
        fragment: fragmentShader,
        uniforms: {
          uResolution: { value: [1, 1] },
          uBlobs: { value: blobData },
          uBlobCount: { value: blobs },
          uMouse: { value: [10, 10] },
          uMouseActive: { value: 0 },
          uCohesion: { value: cohesion },
          uSpikes: { value: spikes },
          uSpikeFrequency: { value: spikeFrequency },
          uMagnetRadius: { value: magnetRadius },
          uSheen: { value: sheen },
          uFluidColor: { value: new Color(fluidColor) },
          uAccentColor: { value: new Color(accentColor) },
        },
      });

      if (!gl.getProgramParameter(program.program, gl.LINK_STATUS)) {
        throw new Error("Ferrofluid shader program failed to link");
      }

      const mesh = new Mesh(gl, { geometry, program });
      glRef.current = gl;

      let width = 1;
      let height = 1;
      measureRef.current = (m) => {
        if (m.width === 0 || m.height === 0) return;
        width = m.width;
        height = m.height;
        renderer.dpr = m.dpr;
        renderer.setSize(m.width, m.height);
        program.uniforms.uResolution.value = [
          renderer.gl.drawingBufferWidth,
          renderer.gl.drawingBufferHeight,
        ];
      };

      // Pointer state in aspect-corrected field space: origin at the pane
      // centre, one unit = the short side. Same frame the shader works in.
      const mouse = { x: 10, y: 10, tx: 10, ty: 10, active: 0, target: 0 };

      // Pointer, not mouse: a touch drag emits no mousemove, so a mouse-only
      // binding leaves the magnet inert on a phone.
      const onPointerMove = (e: PointerEvent) => {
        const rect = container.getBoundingClientRect();
        const s = Math.min(rect.width, rect.height);
        if (s <= 0) return;
        mouse.tx = (e.clientX - rect.left - rect.width / 2) / s;
        mouse.ty = -(e.clientY - rect.top - rect.height / 2) / s;
        mouse.target = 1;
      };
      const onPointerLeave = () => {
        mouse.target = 0;
      };
      container.addEventListener("pointermove", onPointerMove);
      container.addEventListener("pointerleave", onPointerLeave);
      container.addEventListener("pointercancel", onPointerLeave);

      // Shared orbit phase, wrapped mod 2π every frame. Integer-harmonic
      // orbits close over exactly this period, so the wrap never shows and
      // float32 never accumulates hours of drift.
      let phase = 0;
      const TAU = Math.PI * 2;

      drawRef.current = (dt) => {
        const l = live.current;
        phase = (phase + dt * l.speed * 0.5) % TAU;

        const count = Math.max(2, Math.min(MAX_BLOBS, Math.round(l.blobs)));
        for (let i = 0; i < count; i++) {
          const o = i * 3;
          blobData[o] = AMPL[i][0] * Math.cos(FREQ[i][0] * phase + SEED[i]);
          blobData[o + 1] = AMPL[i][1] * Math.sin(FREQ[i][1] * phase + SEED[i]);
          blobData[o + 2] = RADII[i];
        }

        // Ease the magnet, so a fast cursor drags a wake instead of teleporting.
        mouse.x += (mouse.tx - mouse.x) * Math.min(1, dt * 8);
        mouse.y += (mouse.ty - mouse.y) * Math.min(1, dt * 8);
        mouse.active += (mouse.target - mouse.active) * Math.min(1, dt * 5);

        program.uniforms.uBlobCount.value = count;
        program.uniforms.uMouse.value = [mouse.x, mouse.y];
        program.uniforms.uMouseActive.value = mouse.active;
        program.uniforms.uCohesion.value = l.cohesion;
        program.uniforms.uSpikes.value = l.spikes;
        program.uniforms.uSpikeFrequency.value = l.spikeFrequency;
        program.uniforms.uMagnetRadius.value = l.magnetRadius;
        program.uniforms.uSheen.value = l.sheen;

        const [fr, fg, fb] = hexToRgb01(l.fluidColor);
        program.uniforms.uFluidColor.value.r = fr;
        program.uniforms.uFluidColor.value.g = fg;
        program.uniforms.uFluidColor.value.b = fb;
        const [ar, ag, ab] = hexToRgb01(l.accentColor);
        program.uniforms.uAccentColor.value.r = ar;
        program.uniforms.uAccentColor.value.g = ag;
        program.uniforms.uAccentColor.value.b = ab;

        renderer.render({ scene: mesh });
      };

      loop.resize();
      loop.start();

      return () => {
        drawRef.current = null;
        measureRef.current = null;
        glRef.current = null;
        container.removeEventListener("pointermove", onPointerMove);
        container.removeEventListener("pointerleave", onPointerLeave);
        container.removeEventListener("pointercancel", onPointerLeave);
        // The host drops the GL context; this only detaches the canvas.
        if (container.contains(gl!.canvas)) container.removeChild(gl!.canvas);
      };
    } catch (err) {
      console.warn("Ferrofluid: WebGL init failed", err);
      if (gl) {
        if (container.contains(gl.canvas)) container.removeChild(gl.canvas);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
      setFailed(true);
      return;
    }
    // Everything tunable is live via the ref; `loop`'s identity is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);

  // Tuning while paused still repaints one still frame.
  useEffect(() => {
    loop.paint();
  }, [
    blobs,
    speed,
    cohesion,
    spikes,
    spikeFrequency,
    magnetRadius,
    sheen,
    fluidColor,
    accentColor,
    loop,
  ]);

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden ${className}`.trim()}
    />
  );
};

export default Ferrofluid;
