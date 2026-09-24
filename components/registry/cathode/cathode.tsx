"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A cathode-ray tube slowed down far enough to watch it work. A real set paints
// its picture one line at a time, left to right, top to bottom, fifty times a
// second — far too fast to see, which is the only reason it reads as a picture.
// Here the raster crawls: the beam draws a test card line by line and the
// phosphor it leaves behind fades until the next pass comes round.
//
// **Persistence is analytic, not a feedback buffer.** The honest way to draw
// phosphor decay is to keep the previous frame in a render target, dim it, and
// composite the new beam over it. This does not, because the raster is a pure
// function of time: every pixel knows exactly when the beam last crossed it —
// its own position in scan order against the beam's. Decay is an exponential in
// that elapsed fraction of a frame. One `exp` against a second pass, a float
// target, a fallback path and resize bookkeeping — on the entry most people
// will actually paste.
//
// Everything periodic in here is band-limited. Scanlines, the aperture grille
// and the test card's frequency gratings all head for one cycle per pixel as
// the container shrinks, and an un-limited grating does not degrade into a
// softer one — it degrades into a moiré that moves when the window does.
// `fwidth` gives cycles per pixel and each modulation fades out as that nears
// Nyquist, so a small canvas loses detail instead of gaining a pattern that was
// never in the signal.
export type CathodeSignal = "testcard" | "bars" | "grid" | "snow";

interface CathodeProps {
  /** What the beam is painting. */
  signal?: CathodeSignal;
  /** Frames the beam completes per second. Zero parks it. */
  scanRate?: number;
  /** How long the phosphor holds after the beam has passed, 0..1. */
  persistence?: number;
  /** Height of one raster line, in px. Each line is one pass of the beam. */
  scanlineDensity?: number;
  /** How hard the scanlines and grille cut into the image. */
  scanlineDepth?: number;
  /** Barrel distortion of the tube face. */
  curvature?: number;
  /** Halation around the beam and the bright parts of the picture. */
  bloom?: number;
  /** Speed of the hum bar rolling up the frame. */
  rollSpeed?: number;
  /** Convergence error between the colour guns, in px. */
  chromaOffset?: number;
  /** The phosphor. */
  phosphorColor?: string;
  backgroundColor?: string;
  /** Halt the loop. One still frame stays painted. */
  paused?: boolean;
  /** The beam is withheld and the whole picture holds steady — the tube is
   *  never blanked, only its motion is. */
  reducedMotion?: boolean;
  className?: string;
}

const SIGNAL_ID: Record<string, number> = { testcard: 0, bars: 1, grid: 2, snow: 3 };

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
uniform float uSignal;
uniform float uPhase;
uniform float uFrame;
uniform float uSteady;
uniform float uRoll;
uniform float uScanlineDensity;
uniform float uScanlineDepth;
uniform float uCurvature;
uniform float uBloom;
uniform float uPersistence;
uniform float uChromaOffset;
uniform vec3  uPhosphor;
uniform vec3  uBg;

const float TAU = 6.2831853;

// Integer hash. A float one built on fract(p * k) runs out of mantissa at the
// cell counts a wide canvas reaches and the snow grows diagonal structure.
float hash(vec2 cell, float seed) {
  uvec3 q = uvec3(ivec3(int(cell.x), int(cell.y), int(seed)));
  uint h = q.x * 0x8da6b343u + q.y * 0xd8163841u + q.z * 0xcb1ab31fu;
  h ^= h >> 16; h *= 0x7feb352du;
  h ^= h >> 15; h *= 0x846ca68bu;
  h ^= h >> 16;
  return float(h) / 4294967295.0;
}

vec2 curve(vec2 c) {
  float r2 = dot(c, c);
  return c * (1.0 + uCurvature * r2 * 0.55);
}

// A band-limited line: 1 on the line, 0 off it, faded out as the lattice it
// belongs to approaches one cycle per pixel.
float gridLine(float v, float width) {
  float w = max(fwidth(v), 1e-5);
  float d = abs(fract(v) - 0.5);
  float fade = 1.0 - smoothstep(0.2, 0.45, w);
  return (1.0 - smoothstep(width, width + w * 1.5, 0.5 - d)) * fade;
}

float testcard(vec2 p, float aspect) {
  // Square cells measured against the height, centred so the lattice is
  // symmetric at any aspect.
  vec2 q = (p - 0.5) * vec2(aspect, 1.0);
  vec2 g = q * 12.0 + 0.5;
  float lattice = max(gridLine(g.x, 0.035), gridLine(g.y, 0.035));
  float v = 0.22 + lattice * 0.6;

  float r = length(q);
  float rw = max(fwidth(r), 1e-5);
  float inside = 1.0 - smoothstep(0.42 - rw, 0.42 + rw, r);
  if (inside > 0.0) {
    float u = clamp((q.x + 0.42) / 0.84, 0.0, 0.9999);
    float body;
    if (q.y > 0.2) {
      // Grey steps, black to white.
      body = floor(u * 6.0) / 5.0;
    } else if (q.y > 0.06) {
      // The colour bars' luma, as a monochrome set would show them.
      body = 0.95 - floor(u * 7.0) * 0.13;
    } else if (q.y > -0.06) {
      // Centre band: a crosshair on black.
      float cw = max(fwidth(q.x), 1e-5);
      body = (1.0 - smoothstep(0.0, cw * 1.5, abs(q.x))) * 0.9 + 0.04;
      body = max(body, 1.0 - smoothstep(0.004, 0.004 + cw, abs(q.y)));
    } else if (q.y > -0.22) {
      // Multiburst: gratings of rising frequency, each fading as it passes
      // Nyquist instead of beating against the pixel grid.
      float f = 14.0 * pow(1.7, floor(u * 5.0));
      float s = q.x * f;
      float fade = 1.0 - smoothstep(0.2, 0.45, fwidth(s));
      body = 0.5 + 0.5 * cos(s * TAU) * fade;
    } else {
      body = u;
    }
    v = mix(v, body, inside);
  }
  float ring = 1.0 - smoothstep(0.0, rw * 2.0, abs(r - 0.42));
  return max(v, ring);
}

float grid(vec2 p, float aspect) {
  vec2 q = (p - 0.5) * vec2(aspect, 1.0);
  vec2 g = q * 16.0 + 0.5;
  float lines = max(gridLine(g.x, 0.03), gridLine(g.y, 0.03));
  float r = length(q);
  float rw = max(fwidth(r), 1e-5);
  float ring = 1.0 - smoothstep(0.0, rw * 2.0, abs(r - 0.34));
  return max(lines * 0.7, ring) + 0.03;
}

vec3 bars(vec2 p) {
  float b = floor(clamp(p.x, 0.0, 0.9999) * 7.0);
  return
    b < 0.5 ? vec3(0.9) :
    b < 1.5 ? vec3(0.9, 0.9, 0.0) :
    b < 2.5 ? vec3(0.0, 0.9, 0.9) :
    b < 3.5 ? vec3(0.0, 0.9, 0.0) :
    b < 4.5 ? vec3(0.9, 0.0, 0.9) :
    b < 5.5 ? vec3(0.9, 0.0, 0.0) : vec3(0.0, 0.0, 0.9);
}

// What the phosphor is doing at p: the picture, weighted by how long ago the
// beam last crossed it.
vec3 lit(vec2 p, vec2 res, float lines) {
  float line = floor((1.0 - p.y) * lines);
  // Where this pixel sits in scan order, and how much of a frame has passed
  // since the beam was here. Exponential decay in that is phosphor decay.
  float s = (line + clamp(p.x, 0.0, 1.0)) / lines;
  float behind = fract(uPhase - s);
  float tau = 0.04 + uPersistence * uPersistence * 2.4;
  // Fresh phosphor overshoots before it settles, which is what makes the scan
  // front readable when the dot itself crosses a line faster than a frame.
  float flash = exp(-behind / 0.012) * 0.7;
  float decay = mix(exp(-behind / tau) + flash, 1.0, uSteady);

  float aspect = res.x / max(res.y, 1.0);
  vec3 img;
  if (uSignal < 0.5) {
    img = vec3(testcard(p, aspect)) * uPhosphor;
  } else if (uSignal < 1.5) {
    // The one signal that carries its own hue rather than borrowing the
    // phosphor's.
    img = bars(p);
  } else if (uSignal < 2.5) {
    img = vec3(grid(p, aspect)) * uPhosphor;
  } else {
    // A pixel shows the noise of the pass that last painted it, so the snow is
    // redrawn line by line behind the beam rather than all at once.
    float frame = uFrame - step(uPhase, s);
    vec2 cell = floor(vec2(p.x * res.x * 0.5, line));
    img = vec3(hash(cell, frame)) * uPhosphor;
  }
  return img * decay;
}

void main() {
  vec2 res = uResolution / uDpr;
  vec2 c = (gl_FragCoord.xy / uDpr - res * 0.5) / (res * 0.5);

  vec2 warped = curve(c);
  // Soft edge of the glass rather than a hard clip — a hard one aliases along
  // the whole rim, which is the one place the eye is guaranteed to look.
  vec2 edge = abs(warped);
  float glass = (1.0 - smoothstep(0.975, 1.0, edge.x)) * (1.0 - smoothstep(0.975, 1.0, edge.y));

  vec2 p = warped * 0.5 + 0.5;
  float lines = max(floor(res.y / max(uScanlineDensity, 0.5)), 8.0);

  // Convergence error: the guns land at slightly different places. Held in px
  // so the fringe reads the same at any size.
  float off = uChromaOffset / max(res.x, 1.0);
  vec3 sig = vec3(
    lit(p + vec2(off, 0.0), res, lines).r,
    lit(p, res, lines).g,
    lit(p - vec2(off, 0.0), res, lines).b
  );

  // Halation: four analytic taps of the lit picture rather than a blur pass.
  vec3 halo =
    lit(p + vec2(0.01, 0.0), res, lines) +
    lit(p - vec2(0.01, 0.0), res, lines) +
    lit(p + vec2(0.0, 0.016), res, lines) +
    lit(p - vec2(0.0, 0.016), res, lines);
  sig += halo * 0.25 * uBloom * 0.4;

  // The beam itself: a hot spot at its current position, and a wide glow.
  float scan = uPhase * lines;
  vec2 beam = vec2(fract(scan), 1.0 - (floor(scan) + 0.5) / lines);
  vec2 dpx = (p - beam) * res;
  float spot = exp(-dot(dpx, dpx) / 18.0);
  float glow = exp(-length(dpx) / 70.0) * 0.35;
  float live = 1.0 - uSteady;
  sig += (uPhosphor * 0.6 + 0.4) * spot * live;
  sig += uPhosphor * glow * uBloom * live;

  // Hum bar: a soft periodic band rolling up the face. A cosine rather than a
  // wrapped ramp, so there is no seam where it comes back round.
  float hum = pow(0.5 + 0.5 * cos((p.y + uRoll) * TAU), 12.0) * 0.07;
  sig += hum * uPhosphor;

  // Scanlines follow the raster, so they bend with the glass.
  float sy = (1.0 - p.y) * lines;
  float scanFade = 1.0 - smoothstep(0.25, 0.5, fwidth(sy));
  float scanDark = 0.5 + 0.5 * cos(sy * TAU);
  sig *= 1.0 - uScanlineDepth * scanDark * scanFade;

  float gx = gl_FragCoord.x / (3.0 * uDpr);
  float grilleFade = 1.0 - smoothstep(0.25, 0.5, fwidth(gx));
  sig *= 1.0 - uScanlineDepth * 0.3 * (0.5 + 0.5 * cos(gx * TAU)) * grilleFade;

  float vig = 1.0 - 0.3 * dot(c, c);

  fragColor = vec4(mix(uBg, sig * vig, glass), 1.0);
}`;

const Cathode = memo(
  ({
    signal = "testcard",
    scanRate = 0.3,
    persistence = 0.55,
    scanlineDensity = 3,
    scanlineDepth = 0.4,
    curvature = 0.18,
    bloom = 0.6,
    rollSpeed = 0.2,
    chromaOffset = 0.8,
    phosphorColor = "#7ef0c0",
    backgroundColor = "#050607",
    paused = false,
    reducedMotion = false,
    className,
  }: CathodeProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const drawRef = useRef<((dt: number) => void | false) | null>(null);
    const measureRef = useRef<((m: Metrics) => void) | null>(null);
    const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(null);

    const [fallback, setFallback] = useState(false);

    const loop = useAnimationLoop({
      target: containerRef,
      halted: paused || reducedMotion,
      dpr: "auto",
      onResize: (metrics) => measureRef.current?.(metrics),
      onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
      gl: () => glRef.current,
    });

    // Mirrored every render so the frame body reads live values. The GL context is
    // built once and never rebuilt while a control is dragged.
    const live = useRef({
      signal, scanRate, persistence, scanlineDensity, scanlineDepth, curvature,
      bloom, rollSpeed, chromaOffset, phosphorColor, backgroundColor, reducedMotion,
    });
    live.current = {
      signal, scanRate, persistence, scanlineDensity, scanlineDepth, curvature,
      bloom, rollSpeed, chromaOffset, phosphorColor, backgroundColor, reducedMotion,
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

      const program = new Program(gl, {
        vertex,
        fragment,
        uniforms: {
          uResolution: { value: new Float32Array([1, 1]) },
          uDpr: { value: 1 },
          uSignal: { value: SIGNAL_ID[signal] ?? 0 },
          uPhase: { value: 0 },
          uFrame: { value: 0 },
          uSteady: { value: 0 },
          uRoll: { value: 0 },
          uScanlineDensity: { value: scanlineDensity },
          uScanlineDepth: { value: scanlineDepth },
          uCurvature: { value: curvature },
          uBloom: { value: bloom },
          uPersistence: { value: persistence },
          uChromaOffset: { value: chromaOffset },
          uPhosphor: { value: new Float32Array(hexToRgb01(phosphorColor)) },
          uBg: { value: new Float32Array(hexToRgb01(backgroundColor)) },
        },
      });
      const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
      const u = program.uniforms as Record<string, { value: number | Float32Array }>;

      // The scan clock counts whole frames and wraps at a prime, so it stays
      // bounded for float32 without the snow repeating on a period anyone sees.
      const clock = { scan: 0.62, roll: 0 };

      const sync = () => {
        const l = live.current;
        u.uPhase.value = clock.scan % 1;
        u.uFrame.value = Math.floor(clock.scan);
        u.uSteady.value = l.reducedMotion ? 1 : 0;
        u.uRoll.value = clock.roll;
        u.uSignal.value = SIGNAL_ID[l.signal] ?? 0;
        u.uScanlineDensity.value = l.scanlineDensity;
        u.uScanlineDepth.value = l.scanlineDepth;
        u.uCurvature.value = l.curvature;
        u.uBloom.value = l.bloom;
        u.uPersistence.value = l.persistence;
        u.uChromaOffset.value = l.chromaOffset;
        (u.uPhosphor.value as Float32Array).set(hexToRgb01(l.phosphorColor));
        (u.uBg.value as Float32Array).set(hexToRgb01(l.backgroundColor));
      };

      drawRef.current = (dt) => {
        const l = live.current;
        clock.scan = (clock.scan + dt * l.scanRate) % 997;
        clock.roll = (clock.roll + dt * l.rollSpeed * 0.12) % 1;
        sync();
        renderer.render({ scene: mesh });
      };

      measureRef.current = ({ width, height, dpr }) => {
        renderer.dpr = dpr;
        renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
        const res = u.uResolution.value as Float32Array;
        res[0] = gl.drawingBufferWidth;
        res[1] = gl.drawingBufferHeight;
        u.uDpr.value = dpr;
        // Bake one corrected frame so a halted tube is never stale after a
        // resize; the host then paints its own on top (§V2).
        sync();
        renderer.render({ scene: mesh });
      };

      loop.resize();
      loop.start();

      return () => {
        drawRef.current = null;
        measureRef.current = null;
        if (container.contains(canvas)) container.removeChild(canvas);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fallback]);

    // Repaint on tuning so a paused or reduced-motion tube still shows the change.
    useEffect(() => {
      loop.paint();
    }, [
      signal, scanRate, persistence, scanlineDensity, scanlineDepth, curvature, bloom,
      rollSpeed, chromaOffset, phosphorColor, backgroundColor, reducedMotion, loop,
    ]);

    if (fallback) {
      // Scanlines over the phosphor in CSS. Not the tube, but never a blank box.
      return (
        <div
          className={className ?? "relative h-full w-full overflow-hidden"}
          style={{
            backgroundColor,
            backgroundImage: `repeating-linear-gradient(0deg, ${phosphorColor}22 0 1px, transparent 1px ${Math.max(scanlineDensity, 1)}px)`,
          }}
        />
      );
    }

    return (
      <div
        ref={containerRef}
        className={className ?? "relative h-full w-full overflow-hidden"}
      />
    );
  },
);

Cathode.displayName = "Cathode";

export default Cathode;
