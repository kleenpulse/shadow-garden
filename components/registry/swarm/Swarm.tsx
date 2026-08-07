"use client";

import { memo, useEffect, useRef, useState } from "react";
import {
  Renderer, Program, Mesh, Triangle, Geometry, RenderTarget, Texture,
} from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A quarter of a million particles that hold a shape, and a GPU that never sends
// one of them back to the CPU.
//
// Five decisions carry this.
//
// **Position and velocity live in floating-point textures, not in JS arrays.**
// Every particle is one texel; the simulation is two fullscreen passes that read
// the current textures and write the next ones. Nothing is uploaded per frame,
// so the count stops being bounded by what the main thread can push.
//
// **Full float, not half.** The integrator feeds its own output back in. At half
// precision the per-step delta near the target is smaller than one unit in the
// last place, so particles arrive and then jitter permanently in a band they
// cannot resolve — visible as a shimmer that no amount of damping removes.
//
// **Targets are sampled out of an offscreen 2D canvas.** Text is drawn with
// fillText, read back once with getImageData, and the lit pixels become a
// position texture. The GPU never sees a glyph, only coordinates, so the shape
// can be any string without a font atlas or an SDF pipeline.
//
// **Turbulence is curl noise.** Curl of a vector field is divergence-free by
// construction, so it stirs the cloud without ever thinning it or piling it up.
// Plain noise on a velocity field does both, and the cloud slowly develops holes.
//
// **Count is an enum, not a slider.** Each value reallocates four float targets
// and rebuilds the geometry; a slider would do that on every pointer tick of a
// drag.
export type SwarmShape = "auto" | "text" | "sphere" | "torus" | "grid" | "disperse";
export type SwarmDensity = "16k" | "65k" | "131k" | "262k";

interface SwarmProps {
  /** Particle count, as discrete steps. */
  density?: SwarmDensity;
  /** What the cloud is heading for. */
  shape?: SwarmShape;
  /** Strings the text shape cycles through. */
  targets?: string[];
  /** How hard particles are pulled to their target. */
  morphSpeed?: number;
  /** How much of the morph is spread across the cloud. */
  stagger?: number;
  /** Curl-noise turbulence on the way. */
  curl?: number;
  /** How much velocity survives each step. */
  damping?: number;
  /** How hard the pointer pushes particles away. */
  repel?: number;
  /** Point sprite width. */
  pointSize?: number;
  /** How close the camera sits to the cloud. */
  zoom?: number;
  /** Colour of a settled particle. */
  particleColor?: string;
  /** Colour of a moving one. */
  accentColor?: string;
  backgroundColor?: string;
  /** Halt the loop. The cloud freezes mid-flight. */
  paused?: boolean;
  /** The cloud settles on its shape and stays there. */
  reducedMotion?: boolean;
  className?: string;
}

const SIZES: Record<SwarmDensity, number> = {
  "16k": 128,
  "65k": 256,
  "131k": 362,
  "262k": 512,
};

const hexToRgb01 = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Lit pixels of a rendered string, in a normalised -1..1 box. Read back once
 *  per shape change; never per frame. */
function sampleText(text: string, count: number): Float32Array {
  const W = 512;
  const H = 160;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const out = new Float32Array(count * 4);
  if (!ctx) return out;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let fontSize = 120;
  ctx.font = `700 ${fontSize}px ui-monospace, Menlo, monospace`;
  // Shrink to fit rather than clip. A string that overflows the canvas loses its
  // outer letters silently, and the cloud renders a word with no ending.
  while (ctx.measureText(text).width > W * 0.92 && fontSize > 12) {
    fontSize -= 4;
    ctx.font = `700 ${fontSize}px ui-monospace, Menlo, monospace`;
  }
  ctx.fillText(text, W / 2, H / 2);

  const data = ctx.getImageData(0, 0, W, H).data;
  const lit: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4] > 128) lit.push(x, y);
    }
  }

  for (let i = 0; i < count; i++) {
    const i4 = i * 4;
    if (lit.length === 0) {
      out[i4] = 0; out[i4 + 1] = 0; out[i4 + 2] = 0; out[i4 + 3] = 1;
      continue;
    }
    const j = (i % (lit.length / 2)) * 2;
    // Jitter inside the pixel so the cloud does not band onto the raster grid.
    const x = (lit[j] + Math.random()) / W;
    const y = (lit[j + 1] + Math.random()) / H;
    out[i4] = (x - 0.5) * 2.6;
    out[i4 + 1] = -(y - 0.5) * 0.82;
    out[i4 + 2] = (Math.random() - 0.5) * 0.06;
    out[i4 + 3] = 1;
  }
  return out;
}

function sampleShape(kind: SwarmShape, count: number): Float32Array {
  const out = new Float32Array(count * 4);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const i4 = i * 4;
    let x = 0, y = 0, z = 0;
    if (kind === "sphere") {
      // Fibonacci sphere: even coverage without the pole clustering a naive
      // lat/long parameterisation gives.
      const t = 1 - (i / Math.max(count - 1, 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - t * t));
      const a = golden * i;
      x = Math.cos(a) * r; y = t; z = Math.sin(a) * r;
      const s = 0.95;
      x *= s; y *= s; z *= s;
    } else if (kind === "torus") {
      const u = (i / count) * Math.PI * 2 * 17;
      const v = golden * i;
      const R = 0.78, rr = 0.3;
      x = (R + rr * Math.cos(v)) * Math.cos(u);
      y = rr * Math.sin(v);
      z = (R + rr * Math.cos(v)) * Math.sin(u);
    } else if (kind === "grid") {
      const side = Math.ceil(Math.cbrt(count));
      const gx = i % side;
      const gy = Math.floor(i / side) % side;
      const gz = Math.floor(i / (side * side));
      x = (gx / (side - 1) - 0.5) * 1.9;
      y = (gy / (side - 1) - 0.5) * 1.9;
      z = (gz / (side - 1) - 0.5) * 1.9;
    } else {
      x = (Math.random() - 0.5) * 3.2;
      y = (Math.random() - 0.5) * 1.9;
      z = (Math.random() - 0.5) * 2.2;
    }
    out[i4] = x; out[i4 + 1] = y; out[i4 + 2] = z; out[i4 + 3] = 1;
  }
  return out;
}

const quadVert = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }`;

const NOISE = `
vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453) * 2.0 - 1.0;
}
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(dot(hash33(i + vec3(0,0,0)), f - vec3(0,0,0)), dot(hash33(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
        mix(dot(hash33(i + vec3(0,1,0)), f - vec3(0,1,0)), dot(hash33(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
    mix(mix(dot(hash33(i + vec3(0,0,1)), f - vec3(0,0,1)), dot(hash33(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
        mix(dot(hash33(i + vec3(0,1,1)), f - vec3(0,1,1)), dot(hash33(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y),
    u.z);
}
// Curl of a noise field. Divergence-free by construction, which is the entire
// reason to use it here: it stirs without thinning or piling up.
vec3 curlNoise(vec3 p) {
  const float e = 0.12;
  float n1 = vnoise(p + vec3(0.0, e, 0.0)), n2 = vnoise(p - vec3(0.0, e, 0.0));
  float n3 = vnoise(p + vec3(0.0, 0.0, e)), n4 = vnoise(p - vec3(0.0, 0.0, e));
  float n5 = vnoise(p + vec3(e, 0.0, 0.0)), n6 = vnoise(p - vec3(e, 0.0, 0.0));
  return normalize(vec3(n1 - n2 - (n3 - n4), n3 - n4 - (n5 - n6), n5 - n6 - (n1 - n2)) + 1e-6);
}`;

const velFragment = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform sampler2D uTarget;
uniform float uDt;
uniform float uMorph;
uniform float uStagger;
uniform float uCurl;
uniform float uDamping;
uniform float uRepel;
uniform vec2  uPointer;
uniform float uPointerOn;
uniform float uTime;
${NOISE}

void main() {
  vec3 pos = texture(uPos, vUv).xyz;
  vec3 vel = texture(uVel, vUv).xyz;
  vec3 tgt = texture(uTarget, vUv).xyz;

  // Per-particle phase from its own texel, so the cloud arrives over a spread of
  // time rather than all at once. Deterministic, so it does not reshuffle when
  // the shape changes.
  float phase = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
  float gain = mix(1.0, 0.25 + phase * 1.5, uStagger);

  vec3 toTarget = tgt - pos;
  vec3 acc = toTarget * uMorph * 9.0 * gain;

  // Turbulence fades out as a particle closes on its target. Applied at full
  // strength everywhere it competes with the restoring force near the target,
  // and the cloud hovers permanently in a band a few tenths wide — which reads
  // as an amorphous blob no matter what shape it was given. Fading it means the
  // curl stirs the crossing and lets the arrival settle.
  float travel = clamp(length(toTarget) * 1.6, 0.0, 1.0);
  acc += curlNoise(pos * 0.9 + uTime * 0.12) * uCurl * 1.6 * travel;

  if (uPointerOn > 0.5) {
    vec3 d = pos - vec3(uPointer, 0.0);
    float r2 = dot(d, d);
    acc += normalize(d + 1e-6) * uRepel * 4.0 * exp(-r2 * 5.0);
  }

  vel = vel * pow(uDamping, uDt * 60.0) + acc * uDt;
  fragColor = vec4(vel, 1.0);
}`;

const posFragment = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform float uDt;
void main() {
  vec3 pos = texture(uPos, vUv).xyz;
  vec3 vel = texture(uVel, vUv).xyz;
  fragColor = vec4(pos + vel * uDt, 1.0);
}`;

const pointVert = `#version 300 es
in vec2 reference;
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform float uPointSize;
uniform float uAspect;
uniform float uSpin;
uniform float uPitch;
uniform float uZoom;
out float vSpeed;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

void main() {
  vec3 p = texture(uPos, reference).xyz;
  vSpeed = length(texture(uVel, reference).xyz);
  // Yaw before pitch. The other order tilts the axis the yaw then spins about,
  // so the cloud rolls instead of orbiting.
  p.xz *= rot(uSpin);
  p.yz *= rot(uPitch);
  // Weak perspective, computed here rather than through a matrix — there is one
  // camera, it never moves, and a uniform matrix would be three more uploads a
  // frame for a constant.
  float persp = 1.0 / (2.9 - p.z * 0.55);
  vec2 screen = vec2(p.x / uAspect, p.y) * persp * 2.2 * uZoom;
  gl_Position = vec4(screen, 0.0, 1.0);
  // Sprites scale with the zoom too. Leaving them fixed makes a zoomed-in
  // cloud look sparser rather than closer, which is the tell that the zoom is
  // a viewport crop rather than a camera.
  gl_PointSize = max(uPointSize * persp * 2.4 * uZoom, 1.0);
}`;

const pointFrag = `#version 300 es
precision highp float;
in float vSpeed;
out vec4 fragColor;
uniform vec3 uColor;
uniform vec3 uAccent;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d);
  if (r > 0.25) discard;
  float a = smoothstep(0.25, 0.02, r);
  // Moving particles take the accent; settled ones fall back to the base. The
  // colour is the readout of the simulation rather than decoration on it.
  vec3 col = mix(uColor, uAccent, clamp(vSpeed * 1.6, 0.0, 1.0));
  fragColor = vec4(col, a);
}`;

const AUTO_CYCLE = ["text", "sphere", "torus", "grid"] as const;

const Swarm = memo(
  ({
    density = "65k",
    shape = "auto",
    targets = ["SHADOW", "GARDEN"],
    morphSpeed = 1.1,
    stagger = 0.45,
    curl = 0.3,
    damping = 0.9,
    repel = 1,
    pointSize = 1.6,
    zoom = 1,
    particleColor = "#a855f7",
    accentColor = "#67e8f9",
    backgroundColor = "#04040a",
    paused = false,
    reducedMotion = false,
    className,
  }: SwarmProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const drawRef = useRef<((dt: number) => void | false) | null>(null);
    const measureRef = useRef<((m: Metrics) => void) | null>(null);
    const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(null);
    const retargetRef = useRef<((kind: SwarmShape, word: string) => void) | null>(null);
    const pointer = useRef({ x: 0, y: 0, on: false });
    // Drag orbits, hover repels. Sharing one gesture between the two would mean
    // every attempt to look around also blows a hole in what you are looking at.
    const orbit = useRef({
      yaw: 0, pitch: 0, vYaw: 0, vPitch: 0,
      dragging: false, pointerId: -1, lastX: 0, lastY: 0, lastT: 0,
    });

    const [fallback, setFallback] = useState(false);
    const pausedRef = useRef(paused);
    pausedRef.current = paused;

    const loop = useAnimationLoop({
      target: containerRef,
      halted: paused,
      dpr: "auto",
      onResize: (metrics) => measureRef.current?.(metrics),
      onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
      gl: () => glRef.current,
    });

    const live = useRef({
      shape, targets, morphSpeed, stagger, curl, damping, repel,
      pointSize, zoom, particleColor, accentColor, backgroundColor, reducedMotion,
    });
    live.current = {
      shape, targets, morphSpeed, stagger, curl, damping, repel,
      pointSize, zoom, particleColor, accentColor, backgroundColor, reducedMotion,
    };

    useEffect(() => {
      const container = containerRef.current;
      if (fallback || !container) return;

      const side = SIZES[density] ?? 256;
      const count = side * side;

      let renderer: Renderer;
      try {
        renderer = new Renderer({
          webgl: 2, alpha: false, antialias: false,
          powerPreference: "high-performance",
          dpr: Math.min(window.devicePixelRatio || 1, 2),
        });
        const probe = renderer.gl as unknown as WebGL2RenderingContext;
        if (!probe.getExtension("EXT_color_buffer_float")) {
          throw new Error("Swarm requires EXT_color_buffer_float");
        }
      } catch {
        setFallback(true);
        return;
      }

      const glc = renderer.gl;
      const gl2 = glc as unknown as WebGL2RenderingContext;
      glRef.current = gl2;

      const canvas = glc.canvas as HTMLCanvasElement;
      canvas.style.display = "block";
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      container.appendChild(canvas);

      const makeRT = () =>
        new RenderTarget(glc, {
          width: side, height: side, depth: false,
          type: gl2.FLOAT, format: gl2.RGBA, internalFormat: gl2.RGBA32F,
          minFilter: gl2.NEAREST, magFilter: gl2.NEAREST,
          wrapS: gl2.CLAMP_TO_EDGE, wrapT: gl2.CLAMP_TO_EDGE,
        });

      let posRead = makeRT(), posWrite = makeRT();
      let velRead = makeRT(), velWrite = makeRT();

      const targetTexture = new Texture(glc, {
        image: sampleText(targets[0] ?? "SHADOW", count),
        width: side, height: side,
        type: gl2.FLOAT, format: gl2.RGBA, internalFormat: gl2.RGBA32F,
        minFilter: gl2.NEAREST, magFilter: gl2.NEAREST,
        generateMipmaps: false, flipY: false,
      });

      const quad = new Triangle(glc);

      // Seed: everything starts scattered, so the first morph is something to
      // watch rather than a shape that was simply already there.
      const seed = sampleShape("disperse", count);
      const seedTexture = new Texture(glc, {
        image: seed, width: side, height: side,
        type: gl2.FLOAT, format: gl2.RGBA, internalFormat: gl2.RGBA32F,
        minFilter: gl2.NEAREST, magFilter: gl2.NEAREST,
        generateMipmaps: false, flipY: false,
      });
      const zero = new Texture(glc, {
        image: new Float32Array(count * 4), width: side, height: side,
        type: gl2.FLOAT, format: gl2.RGBA, internalFormat: gl2.RGBA32F,
        minFilter: gl2.NEAREST, magFilter: gl2.NEAREST,
        generateMipmaps: false, flipY: false,
      });
      const copyProgram = new Program(glc, {
        vertex: quadVert,
        fragment: `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSrc;
void main() { fragColor = texture(uSrc, vUv); }`,
        uniforms: { uSrc: { value: seedTexture } },
      });
      const copyMesh = new Mesh(glc, { geometry: quad, program: copyProgram });
      const cu = copyProgram.uniforms as Record<string, { value: unknown }>;
      cu.uSrc.value = seedTexture;
      renderer.render({ scene: copyMesh, target: posRead });
      renderer.render({ scene: copyMesh, target: posWrite });
      cu.uSrc.value = zero;
      renderer.render({ scene: copyMesh, target: velRead });
      renderer.render({ scene: copyMesh, target: velWrite });

      const velProgram = new Program(glc, {
        vertex: quadVert,
        fragment: velFragment,
        uniforms: {
          uPos: { value: posRead.texture }, uVel: { value: velRead.texture },
          uTarget: { value: targetTexture },
          uDt: { value: 0.016 }, uMorph: { value: morphSpeed },
          uStagger: { value: stagger }, uCurl: { value: curl },
          uDamping: { value: damping }, uRepel: { value: repel },
          uPointer: { value: new Float32Array([0, 0]) },
          uPointerOn: { value: 0 }, uTime: { value: 0 },
        },
      });
      const posProgram = new Program(glc, {
        vertex: quadVert,
        fragment: posFragment,
        uniforms: {
          uPos: { value: posRead.texture }, uVel: { value: velRead.texture },
          uDt: { value: 0.016 },
        },
      });
      const velMesh = new Mesh(glc, { geometry: quad, program: velProgram });
      const posMesh = new Mesh(glc, { geometry: quad, program: posProgram });

      const reference = new Float32Array(count * 2);
      for (let i = 0; i < count; i++) {
        reference[i * 2] = ((i % side) + 0.5) / side;
        reference[i * 2 + 1] = (Math.floor(i / side) + 0.5) / side;
      }
      const pointGeometry = new Geometry(glc, {
        reference: { size: 2, data: reference },
      });
      const pointProgram = new Program(glc, {
        vertex: pointVert,
        fragment: pointFrag,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uPos: { value: posRead.texture }, uVel: { value: velRead.texture },
          uPointSize: { value: pointSize }, uAspect: { value: 1 },
          uSpin: { value: 0 }, uPitch: { value: 0 }, uZoom: { value: zoom },
          uColor: { value: new Float32Array(hexToRgb01(particleColor)) },
          uAccent: { value: new Float32Array(hexToRgb01(accentColor)) },
        },
      });
      // Additive, so density reads as brightness. Without it a dense core is a
      // flat disc and the whole point of the count is lost.
      pointProgram.setBlendFunc(gl2.SRC_ALPHA, gl2.ONE);
      const points = new Mesh(glc, {
        geometry: pointGeometry, program: pointProgram, mode: gl2.POINTS,
      });

      const vu = velProgram.uniforms as Record<string, { value: unknown }>;
      const pu = posProgram.uniforms as Record<string, { value: unknown }>;
      const du = pointProgram.uniforms as Record<string, { value: unknown }>;

      retargetRef.current = (kind, word) => {
        targetTexture.image =
          kind === "text" ? sampleText(word, count) : sampleShape(kind, count);
        targetTexture.needsUpdate = true;
      };

      let time = 0;
      let spin = 0;
      let autoAt = 0;
      let autoIndex = 0;

      drawRef.current = (dt) => {
        const l = live.current;
        const o = orbit.current;
        const step = Math.min(dt, 1 / 30);
        // While paused the frame still runs — it just does not ADVANCE anything.
        // Uniforms are re-uploaded and the points redrawn, so tuning a colour,
        // the sprite size or the zoom lands immediately, and the camera can still
        // be dragged around a frozen cloud. Stepping the simulation here instead
        // would make pause mean "one frame per slider tick", which is worse than
        // either honest option.
        const still = pausedRef.current;
        if (!still) {
        time = (time + step) % 1000;
        if (!o.dragging) {
          // Coasting first, then the idle drift resumes — a fling hands off to
          // the automatic rotation rather than fighting it.
          o.yaw += o.vYaw * step;
          o.pitch = Math.max(-1.4, Math.min(1.4, o.pitch + o.vPitch * step));
          const decay = Math.pow(0.92, step * 60);
          o.vYaw *= decay;
          o.vPitch *= decay;
          spin = (spin + step * 0.14) % (Math.PI * 2);
        }
        o.yaw %= Math.PI * 2;

        if (l.shape === "auto") {
          autoAt += step;
          if (autoAt > 3.2) {
            autoAt = 0;
            autoIndex = (autoIndex + 1) % AUTO_CYCLE.length;
            const next = AUTO_CYCLE[autoIndex];
            const word = l.targets[autoIndex % Math.max(l.targets.length, 1)] ?? "SHADOW";
            retargetRef.current?.(next as SwarmShape, word);
          }
        }

        }
        if (!still) {
        vu.uPos.value = posRead.texture;
        vu.uVel.value = velRead.texture;
        (vu.uDt as { value: number }).value = step;
        (vu.uMorph as { value: number }).value = l.reducedMotion ? 2.5 : l.morphSpeed;
        (vu.uStagger as { value: number }).value = l.stagger;
        (vu.uCurl as { value: number }).value = l.reducedMotion ? 0 : l.curl;
        (vu.uDamping as { value: number }).value = l.damping;
        (vu.uRepel as { value: number }).value = l.repel;
        (vu.uTime as { value: number }).value = time;
        (vu.uPointerOn as { value: number }).value =
          pointer.current.on && !l.reducedMotion ? 1 : 0;
        const pv = (vu.uPointer as { value: Float32Array }).value;
        pv[0] = pointer.current.x;
        pv[1] = pointer.current.y;
        renderer.render({ scene: velMesh, target: velWrite });
        const tv = velRead; velRead = velWrite; velWrite = tv;

        pu.uPos.value = posRead.texture;
        pu.uVel.value = velRead.texture;
        (pu.uDt as { value: number }).value = step;
        renderer.render({ scene: posMesh, target: posWrite });
        const tp = posRead; posRead = posWrite; posWrite = tp;
        }

        du.uPos.value = posRead.texture;
        du.uVel.value = velRead.texture;
        (du.uPointSize as { value: number }).value = l.pointSize;
        (du.uSpin as { value: number }).value = spin + o.yaw;
        (du.uPitch as { value: number }).value = o.pitch;
        (du.uZoom as { value: number }).value = l.zoom;
        ((du.uColor as { value: Float32Array }).value).set(hexToRgb01(l.particleColor));
        ((du.uAccent as { value: Float32Array }).value).set(hexToRgb01(l.accentColor));

        const bg = hexToRgb01(l.backgroundColor);
        renderer.gl.clearColor(bg[0], bg[1], bg[2], 1);
        renderer.render({ scene: points });
      };

      measureRef.current = ({ width, height, dpr }) => {
        renderer.dpr = dpr;
        renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
        (du.uAspect as { value: number }).value = Math.max(width, 1) / Math.max(height, 1);
        // The simulation grid is independent of the canvas, so a resize repaints
        // rather than reseeds — dragging the window never wipes the cloud.
        drawRef.current?.(0.016);
      };

      loop.resize();
      loop.start();

      return () => {
        drawRef.current = null;
        measureRef.current = null;
        retargetRef.current = null;
        if (container.contains(canvas)) container.removeChild(canvas);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fallback, density]);

    useEffect(() => {
      if (shape === "auto") return;
      retargetRef.current?.(shape, targets[0] ?? "SHADOW");
      loop.paint();
    }, [shape, targets, loop]);

    useEffect(() => {
      loop.paint();
    }, [
      morphSpeed, stagger, curl, damping, repel, pointSize, zoom,
      particleColor, accentColor, backgroundColor, loop,
    ]);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      const o = orbit.current;
      o.dragging = true;
      o.pointerId = e.pointerId;
      o.lastX = e.clientX;
      o.lastY = e.clientY;
      o.lastT = e.timeStamp;
      o.vYaw = 0;
      o.vPitch = 0;
      // The cloud should not also be blown apart by the finger steering it.
      pointer.current.on = false;
      e.currentTarget.setPointerCapture(e.pointerId);
      loop.start();
    };

    const track = (e: React.PointerEvent<HTMLDivElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const o = orbit.current;

      if (o.dragging && e.pointerId === o.pointerId) {
        const dx = e.clientX - o.lastX;
        const dy = e.clientY - o.lastY;
        const dt = (e.timeStamp - o.lastT) / 1000;
        // Both axes are negated relative to ascii-engine, and for one reason:
        // that component rotates the CAMERA (ro.xz, ro.yz), this one rotates the
        // GEOMETRY (p.xz, p.yz). Turning the camera by +theta and turning the
        // object by +theta move the view in opposite directions, so the two
        // components need opposite signs on BOTH axes to feel the same under the
        // hand. Copying a sign between them inverts it.
        const dYaw = -dx * 0.008;
        const dPitch = dy * 0.006;
        o.yaw += dYaw;
        o.pitch = Math.max(-1.4, Math.min(1.4, o.pitch + dPitch));
        if (dt > 0.001) {
          o.vYaw = dYaw / dt;
          o.vPitch = dPitch / dt;
        }
        o.lastX = e.clientX;
        o.lastY = e.clientY;
        o.lastT = e.timeStamp;
        loop.start();
        return;
      }

      const aspect = r.width / r.height;
      pointer.current.x = (((e.clientX - r.left) / r.width) * 2 - 1) * aspect * 0.62;
      pointer.current.y = -(((e.clientY - r.top) / r.height) * 2 - 1) * 0.62;
      pointer.current.on = true;
      loop.start();
    };

    const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
      const o = orbit.current;
      if (o.pointerId !== -1 && e.currentTarget.hasPointerCapture(o.pointerId)) {
        e.currentTarget.releasePointerCapture(o.pointerId);
      }
      o.dragging = false;
      o.pointerId = -1;
      loop.start();
    };

    const release = () => {
      pointer.current.on = false;
      orbit.current.dragging = false;
      orbit.current.pointerId = -1;
    };

    if (fallback) {
      return (
        <div
          className={className ?? "relative h-full w-full overflow-hidden"}
          style={{
            backgroundColor,
            backgroundImage: `radial-gradient(circle at 50% 50%, ${particleColor}55 0%, transparent 55%), radial-gradient(circle at 35% 60%, ${accentColor}33 0%, transparent 40%)`,
          }}
        />
      );
    }

    return (
      <div
        ref={containerRef}
        className={
          className ??
          "relative h-full w-full cursor-grab overflow-hidden active:cursor-grabbing [&_canvas]:touch-none"
        }
        onPointerDown={onPointerDown}
        onPointerMove={track}
        onPointerUp={endDrag}
        onPointerLeave={release}
        onPointerCancel={release}
      />
    );
  },
);

Swarm.displayName = "Swarm";

export default Swarm;
