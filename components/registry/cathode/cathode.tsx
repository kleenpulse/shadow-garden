"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A cathode-ray tube with no signal worth watching, which is most of what they
// ever showed.
//
// Two decisions carry this component.
//
// **Persistence is analytic, not a feedback buffer.** The honest way to draw
// phosphor decay is to keep the previous frame in a render target, dim it, and
// composite the new beam over it. This does not do that, and the reason is not
// that render targets are risky — several entries here ping-pong half-float
// targets and verify fine. It is that the signal is *generated*, so where the
// beam was a moment ago is a function of an earlier phase rather than something
// we had to have kept. That makes the trail a closed form: an exponential in the
// distance already swept, which is what phosphor decay is. One `exp` against a
// second pass, an extension probe, a fallback path and resize bookkeeping — on
// the entry that most people will actually paste.
//
// **The sweep reverses rather than wrapping.** A beam that jumps back to the
// left edge reads as a dropped frame; one that turns around reads as a machine
// with a mechanism. That is the whole of `Alternate (yoyo)`, and it is why the
// phase is ping-ponged into position in JS rather than fed to the shader raw.
//
// Everything periodic in here is band-limited. Scanlines and the aperture grille
// are both spatial frequencies heading for one cycle per pixel as the container
// shrinks or the density rises, and an un-limited grille does not degrade into a
// softer grille — it degrades into a moiré that moves when the window does.
// `fwidth` gives cycles per pixel and the modulation fades out as that
// approaches Nyquist, so a small canvas loses its grille instead of gaining a
// pattern that was never in the signal.
export type CathodeSignal = "sweep" | "bars" | "snow" | "grid";

interface CathodeProps {
  /** What the tube is showing. `sweep` is a single beam that turns around at
   *  each edge; the rest are test patterns a set would fall back to. */
  signal?: CathodeSignal;
  /** Speed of the beam. */
  sweepSpeed?: number;
  /** Pixels per scanline. Below about two the grille is past Nyquist and fades
   *  out rather than aliasing. */
  scanlineDensity?: number;
  /** How hard the scanlines and grille cut into the image. */
  scanlineDepth?: number;
  /** Barrel distortion of the tube face. */
  curvature?: number;
  /** Halation around bright areas. */
  bloom?: number;
  /** How long the phosphor holds after the beam has passed. */
  persistence?: number;
  /** Speed of the hum bar rolling up the frame. */
  rollSpeed?: number;
  /** Convergence error between the colour guns, in px. */
  chromaOffset?: number;
  /** The phosphor. */
  phosphorColor?: string;
  backgroundColor?: string;
  /** Halt the loop. One still frame stays painted. */
  paused?: boolean;
  /** The beam parks mid-face and the hum bar stops. The tube is never blanked —
   *  only its motion is withheld. */
  reducedMotion?: boolean;
  className?: string;
}

const SIGNAL_ID: Record<string, number> = { sweep: 0, bars: 1, snow: 2, grid: 3 };

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
uniform float uSweepPos;
uniform float uSweepDir;
uniform float uRoll;
uniform float uSeed;
uniform float uScanlineDensity;
uniform float uScanlineDepth;
uniform float uCurvature;
uniform float uBloom;
uniform float uPersistence;
uniform float uChromaOffset;
uniform vec3  uPhosphor;
uniform vec3  uBg;

float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.56);
  return fract(p.x * p.y);
}

// Barrel distortion of the tube face. Returns the sampling point; the caller
// checks whether it left the glass.
vec2 curve(vec2 c) {
  float r2 = dot(c, c);
  return c * (1.0 + uCurvature * r2 * 0.55);
}

// Luma of the signal at p, where p is 0..1 across the face. Analytic in every
// mode, which is what lets the beam's trail be an exponential rather than a
// second render pass.
float luma(vec2 p) {
  if (uSignal < 0.5) {
    // One beam. d is signed along the direction of travel, so behind is how
    // far this pixel is into the part of the face already swept — and phosphor
    // decay is exactly an exponential in that distance.
    float d = p.x - uSweepPos;
    float behind = -d * uSweepDir;
    float core = exp(-(d * d) / 0.00035);
    float tail = step(0.0, behind) * exp(-behind / max(uPersistence * 0.55, 0.012));
    return clamp(core + tail * 0.72, 0.0, 1.0);
  }
  if (uSignal < 1.5) {
    // Seven bars, descending luma, the way a test card steps down.
    float b = floor(clamp(p.x, 0.0, 0.9999) * 7.0);
    return 1.0 - b / 7.0;
  }
  if (uSignal < 2.5) {
    return hash(floor(p * uResolution / max(uDpr, 1.0)) + uSeed);
  }
  // Test grid: a lattice plus a centred circle, band-limited like everything else.
  vec2 g = p * 16.0;
  vec2 gw = max(fwidth(g), vec2(1e-5));
  vec2 gd = abs(fract(g) - 0.5);
  float lines = max(
    1.0 - smoothstep(0.0, gw.x * 1.4, gd.x),
    1.0 - smoothstep(0.0, gw.y * 1.4, gd.y)
  );
  float r = length((p - 0.5) * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0));
  float rw = max(fwidth(r), 1e-5);
  float ring = 1.0 - smoothstep(0.0, rw * 2.0, abs(r - 0.34));
  return max(lines * 0.55, ring);
}

void main() {
  vec2 res = uResolution / uDpr;
  vec2 c = (gl_FragCoord.xy / uDpr - res * 0.5) / (res * 0.5);

  vec2 warped = curve(c);
  // Soft edge of the glass rather than a hard clip — a hard one aliases along
  // the whole rim, which is the one place the eye is guaranteed to look.
  vec2 edge = abs(warped);
  float glass = (1.0 - smoothstep(0.985, 1.0, edge.x)) * (1.0 - smoothstep(0.985, 1.0, edge.y));

  vec2 p = warped * 0.5 + 0.5;

  // Convergence error: the guns land at slightly different places. Offset in px,
  // converted through the face width so the control reads the same at any size.
  float off = uChromaOffset / max(res.x, 1.0);
  float lr = luma(p + vec2(off, 0.0));
  float lg = luma(p);
  float lb = luma(p - vec2(off, 0.0));

  vec3 sig = vec3(lr, lg, lb);
  if (uSignal > 0.5 && uSignal < 1.5) {
    // Colour bars are the one signal that carries its own hue rather than
    // borrowing the phosphor's.
    float b = floor(clamp(p.x, 0.0, 0.9999) * 7.0);
    vec3 bar =
      b < 0.5 ? vec3(1.0) :
      b < 1.5 ? vec3(1.0, 1.0, 0.0) :
      b < 2.5 ? vec3(0.0, 1.0, 1.0) :
      b < 3.5 ? vec3(0.0, 1.0, 0.0) :
      b < 4.5 ? vec3(1.0, 0.0, 1.0) :
      b < 5.5 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.35, 1.0);
    sig = bar * lg;
  } else {
    sig *= uPhosphor;
  }

  // Hum bar: a soft brightening rolling up the face, with its own decay tail so
  // persistence still means something on a signal that never moves.
  float hb = fract(p.y + uRoll);
  float hum = exp(-hb / max(uPersistence * 0.35 + 0.04, 0.05)) * 0.16;
  sig += hum * uPhosphor;

  // Halation, four analytic taps rather than a blur pass.
  float g0 = luma(p + vec2(0.012, 0.0));
  float g1 = luma(p - vec2(0.012, 0.0));
  float g2 = luma(p + vec2(0.0, 0.02));
  float g3 = luma(p - vec2(0.0, 0.02));
  sig += uPhosphor * ((g0 + g1 + g2 + g3) * 0.25) * uBloom * 0.45;

  // Scanlines and grille, both band-limited. cycles-per-pixel is what fwidth returns; as it
  // passes Nyquist the modulation is faded out rather than allowed to beat
  // against the sampling grid.
  float sy = gl_FragCoord.y / max(uScanlineDensity * uDpr, 0.5);
  float scanCycles = fwidth(sy);
  float scan = 0.5 + 0.5 * cos(sy * 6.2831853);
  float scanFade = 1.0 - smoothstep(0.25, 0.5, scanCycles);
  sig *= 1.0 - uScanlineDepth * scan * scanFade;

  float gx = gl_FragCoord.x / (3.0 * uDpr);
  float grilleCycles = fwidth(gx);
  float grille = 0.5 + 0.5 * cos(gx * 6.2831853);
  float grilleFade = 1.0 - smoothstep(0.25, 0.5, grilleCycles);
  sig *= 1.0 - uScanlineDepth * 0.35 * grille * grilleFade;

  float vig = 1.0 - 0.55 * dot(c, c) * 0.5;

  fragColor = vec4(mix(uBg, sig * vig, glass), 1.0);
}`;

const Cathode = memo(
  ({
    signal = "sweep",
    sweepSpeed = 0.5,
    scanlineDensity = 2.2,
    scanlineDepth = 0.35,
    curvature = 0.18,
    bloom = 0.5,
    persistence = 0.4,
    rollSpeed = 0.25,
    chromaOffset = 0.6,
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
      signal, sweepSpeed, scanlineDensity, scanlineDepth, curvature,
      bloom, persistence, rollSpeed, chromaOffset, phosphorColor, backgroundColor,
    });
    live.current = {
      signal, sweepSpeed, scanlineDensity, scanlineDepth, curvature,
      bloom, persistence, rollSpeed, chromaOffset, phosphorColor, backgroundColor,
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
          uSweepPos: { value: 0.5 },
          uSweepDir: { value: 1 },
          uRoll: { value: 0 },
          uSeed: { value: 0 },
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

      // Every clock in here is a fraction that wraps at 1, so nothing unbounded
      // ever reaches the shader and float32 never coarsens over a long session.
      const clock = { sweep: 0.25, roll: 0, seed: 0 };

      const sync = () => {
        const l = live.current;
        // The ping-pong. A raw fraction would send the beam back to the left edge
        // between passes; folding it into a triangle turns it around instead.
        u.uSweepPos.value = 1 - Math.abs(2 * clock.sweep - 1);
        u.uSweepDir.value = clock.sweep < 0.5 ? 1 : -1;
        u.uRoll.value = clock.roll;
        u.uSeed.value = clock.seed;
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
        clock.sweep = (clock.sweep + dt * l.sweepSpeed * 0.22) % 1;
        clock.roll = (clock.roll + dt * l.rollSpeed * 0.18) % 1;
        clock.seed = (clock.seed + dt * 37) % 997;
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
      signal, sweepSpeed, scanlineDensity, scanlineDepth, curvature, bloom,
      persistence, rollSpeed, chromaOffset, phosphorColor, backgroundColor, loop,
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
