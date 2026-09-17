"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A dusk ocean rolling toward a low horizon — swells, wind ripple, a sun path
// and breaking foam — marched in one bounded fragment pass. The water is a
// heightfield: six directional trochoid octaves (crests sharpened by an
// exponent, troughs flattened) laid over a noise-warped domain, so no two
// crests ever run straight enough to read as a lattice. The march is coarse
// and geometric, refined by bisection once the ray crosses the surface.
//
// Budget decisions that keep it a hero and not a benchmark: rays that point
// at the sky never march at all, the march samples three octaves and only
// the shading pass samples all six, and the normal's finite-difference
// epsilon grows with hit distance, which is also what stops far-field
// shimmer from aliasing into moiré. The march step is geometric from the
// camera to the fog distance, so every quality setting reaches the horizon —
// the step count changes crest resolution, never how far the sea extends.
//
// The sun sits right of centre and the copy is left-aligned, so the headline
// never crosses the sun path. The pointer sways the camera a few degrees and
// eases back on leave. No drag gesture: a hero owns a CTA, and the sea
// presents itself without being steered.
export interface TidalProps {
	/** Headline. An empty string removes the element. */
	title?: string;
	/** Supporting line under the headline. */
	subtitle?: string;
	/** Call-to-action label. An empty string removes the button. */
	ctaLabel?: string;
	/** Click handler for the call-to-action. */
	onCtaClick?: () => void;
	/** Deep water under the swells. */
	waterColor?: string;
	/** Dusk overhead, falling to ember at the horizon. */
	skyColor?: string;
	/** Sun disc and its path on the water. */
	sunColor?: string;
	/** Crest sparkle. */
	foamColor?: string;
	/** Amplitude of the rolling swells. */
	swellHeight?: number;
	/** How sharply the crests peak — 0 is glass. */
	choppiness?: number;
	/** How fast the sea rolls. */
	speed?: number;
	/** Sun elevation above the horizon. */
	sunHeight?: number;
	/** March step count. */
	quality?: "20" | "32" | "48";
	/** The horizon leans toward the pointer, easing back on leave. */
	parallax?: boolean;
	/** Halt the loop. The sea freezes mid-swell. */
	paused?: boolean;
	/** Settles the scene: static frame, copy at rest, no sway. */
	reducedMotion?: boolean;
	className?: string;
}

export type TidalQuality = NonNullable<TidalProps["quality"]>;

const STEPS: Record<string, number> = {
	"20": 20,
	"32": 32,
	"48": 48,
};

// The phase clock wraps here. Every frequency the shader multiplies it by is
// a multiple of 0.01, so 200π is a whole number of periods for all of them
// and the wrap is invisible. Bounding the clock is what keeps float precision
// from rotting over a long session.
const PHASE_WRAP = 200 * Math.PI;

const hexToRgb01 = (hex: string): [number, number, number] => {
	const h = hex.replace("#", "");
	const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
	const n = parseInt(full, 16);
	if (Number.isNaN(n) || full.length !== 6) return [1, 1, 1];
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const vert = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }`;

const frag = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec3 uWater;
uniform vec3 uSky;
uniform vec3 uSun;
uniform vec3 uFoam;
uniform float uPhase;
uniform float uAspect;
uniform float uSwell;
uniform float uChop;
uniform float uSunH;
uniform float uSteps;
uniform vec2 uPointer;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
// The fraction is derived from the floor, never from fract(): on some GPU
// paths (NVIDIA under D3D11) floor() and fract() of an FMA-contracted
// argument round differently at an exact cell boundary, so the cell index
// and the fraction disagree and the noise jumps — a one-pixel seam wherever
// a sample lands on an integer, which the centre ray column always does.
float vnoise(vec2 p) {
  vec2 i = floor(p), f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1, 0)), u.x),
    mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x),
    u.y);
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// Phase speed per octave follows deep-water dispersion (faster for shorter
// waves). Each is a multiple of 0.01 so the 200π clock wrap is seamless.
const float SPD[6] = float[6](0.48, 0.66, 0.91, 1.26, 1.73, 2.39);

// Trochoid octaves on a warped domain. The warp is a static low-frequency
// noise displacement: the sea rolls through it, so crests bend and wander
// instead of running straight to the horizon. Each octave's direction turns
// by an odd angle so no two ever phase-lock. Choppiness sharpens the crest
// exponent, strongest on the long swells.
float height(vec2 p, float chop, int oct) {
  p += (vec2(vnoise(p * 0.045), vnoise(p * 0.045 + 19.0)) - 0.5) * 9.0;
  float h = 0.0;
  float amp = 1.0;
  float k = 0.17;
  vec2 dir = normalize(vec2(0.3, 1.0));
  mat2 R = rot(1.93);
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    float x = dot(dir, p) * k + uPhase * SPD[i];
    float s = chop * (2.0 - 0.3 * float(i));
    float c = 0.5 + 0.5 * sin(x);
    h += (pow(c, 1.0 + s) - 1.0 / (2.0 + s)) * amp;
    dir = R * dir;
    k *= 1.9;
    amp *= 0.5;
  }
  return h * uSwell * 0.55;
}

// Dusk sky: darkest overhead, an ember band pressed against the horizon,
// forward scatter around the sun in three widths, a disc, backlit cirrus low
// in the sky and a scatter of stars overhead. disc = 0 for reflections, so the
// sun path on the water comes from the soft glow and the glitter pass, not a
// hard-edged mirror image.
vec3 skyAt(vec3 rd, vec3 sunDir, float disc) {
  float up = clamp(rd.y, 0.0, 1.0);
  vec3 zenith = uSky * 0.5;
  vec3 horizon = mix(uSky * 1.5, uSun, 0.3);
  vec3 c = mix(horizon, zenith, pow(up, 0.5));
  // The ember band hugs the horizon; the glow stays tight to the sun so the
  // rest of the sky keeps the dusk colour instead of going brown.
  c += uSun * exp(-up * 12.0) * 0.22;
  float ang = max(dot(rd, sunDir), 0.0);
  c += uSun * (pow(ang, 14.0) * 0.16 + pow(ang, 60.0) * 0.4 + pow(ang, 500.0) * 1.1);

  // Stars: one per cell of a gnomonic lattice (no atan, so no branch cut
  // for a reflected ray that points back past the camera), fading toward
  // the horizon haze and into the sun's glow.
  vec2 sq = rd.xz / (up + 0.25) * 30.0;
  vec2 cell = floor(sq);
  float sh = hash(cell);
  vec2 off = vec2(hash(cell + 1.7), hash(cell + 3.1)) - 0.5;
  float sr = length(sq - cell - 0.5 - off * 0.6);
  float star = (1.0 - smoothstep(0.0, 0.09, sr)) * step(0.94, sh) * (0.4 + 0.6 * hash(cell + 5.3));
  star *= smoothstep(0.06, 0.4, rd.y) * (1.0 - pow(ang, 6.0));
  c += vec3(0.9, 0.93, 1.0) * star * 0.55;

  // Cirrus: a cloud layer projected onto the sky plane, stretched sideways
  // into streaks, catching the sun from below.
  float band = smoothstep(0.0, 0.05, rd.y) * (1.0 - smoothstep(0.06, 0.5, rd.y));
  vec2 cq = rd.xz / (rd.y + 0.06) * vec2(0.09, 0.3) + vec2(uPhase * 0.01, 0.0);
  float cl = vnoise(cq) * 0.6 + vnoise(cq * 2.3 + 5.0) * 0.4;
  cl = smoothstep(0.5, 0.78, cl) * band;
  vec3 cloudCol = mix(uSky * 0.75, uSun * 1.05, 0.2 + 0.7 * pow(ang, 3.0));
  c = mix(c, cloudCol, cl * 0.6);

  c = mix(c, uSun * 1.6 + 0.35, smoothstep(0.99935, 0.99965, ang) * disc);
  return c;
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  vec3 rd = normalize(vec3(uv.x * uAspect, uv.y - 0.12, -1.35));
  rd.yz *= rot(uPointer.y * 0.05);
  rd.xz *= rot(-uPointer.x * 0.09);
  vec3 ro = vec3(0.0, 2.8, 0.0);

  vec3 sunDir = normalize(vec3(0.42, uSunH, -1.0));
  vec3 horizonCol = skyAt(normalize(vec3(rd.x, 0.001, rd.z)), sunDir, 0.0);
  // Periodic drifts for the ripple and foam textures — closed loops on the
  // phase clock, so they never jump at the wrap.
  vec2 drift = vec2(cos(uPhase * 0.03), sin(uPhase * 0.02)) * 4.0;

  vec3 col;
  float chop = uChop;

  // The camera rides above the tallest swell, so an upward ray can never hit
  // water — sky rays skip the march entirely.
  if (rd.y > -0.004) {
    col = skyAt(rd, sunDir, 1.0);
  } else {
    // Geometric march from t=1 to the fog distance in exactly uSteps steps,
    // then a short bisection once the ray crosses the surface.
    float g = pow(190.0, 1.0 / uSteps);
    float t = 1.0;
    float tPrev = 1.0;
    bool hit = false;
    for (int i = 0; i < 48; i++) {
      if (float(i) >= uSteps) break;
      t = tPrev * g;
      vec3 sp = ro + rd * t;
      if (sp.y - height(sp.xz, chop, 3) < 0.0) { hit = true; break; }
      tPrev = t;
    }
    if (!hit) {
      col = horizonCol;
    } else {
      for (int i = 0; i < 5; i++) {
        float tm = (tPrev + t) * 0.5;
        vec3 sp = ro + rd * tm;
        if (sp.y - height(sp.xz, chop, 6) < 0.0) { t = tm; } else { tPrev = tm; }
      }
      vec3 p = ro + rd * t;
      float hC = height(p.xz, chop, 6);
      float near = 1.0 - smoothstep(6.0, 45.0, t);

      // Normal epsilon scales with distance — the anti-moiré valve.
      float e = 0.012 + t * 0.006;
      vec3 n = normalize(vec3(
        height(p.xz - vec2(e, 0.0), chop, 6) - height(p.xz + vec2(e, 0.0), chop, 6),
        2.0 * e,
        height(p.xz - vec2(0.0, e), chop, 6) - height(p.xz + vec2(0.0, e), chop, 6)));
      // Wind ripple: a fine normal perturbation that fades with distance,
      // which is what breaks the glassy sheen on the near swells.
      float slope = 1.0 - n.y;
      vec2 rq = p.xz * 4.5 + drift;
      n.xz += (vec2(vnoise(rq), vnoise(rq + 17.0)) - 0.5) * 0.16 * near * (0.4 + 0.6 * chop);
      n = normalize(n);

      vec3 ref = reflect(rd, n);
      ref.y = abs(ref.y);
      float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);

      // Body colour: deep water lit by the sky, lifting toward the crests,
      // plus light passing through a crest that stands between the eye and
      // the sun — the glow that makes a swell read as water and not paint.
      float crest = clamp(hC / max(uSwell, 0.15) * 1.2 + 0.2, 0.0, 1.0);
      float sss = pow(max(dot(rd, sunDir), 0.0), 3.0) * crest * crest;
      vec3 body = uWater * (0.35 + 0.65 * max(n.y, 0.0)) + uWater * 0.6 * crest
        + mix(uWater, uSun, 0.45) * 1.4 * sss;
      col = mix(body, skyAt(ref, sunDir, 0.0), fres);

      // Sun path: a tight specular lobe broken up by a cell twinkle so it
      // sparkles instead of smearing, over a broad soft lobe.
      vec3 hv = normalize(sunDir - rd);
      float nh = max(dot(n, hv), 0.0);
      float cellT = 0.4 + 0.6 * hash(floor(p.xz * 3.1) + floor(uPhase * 3.0));
      col += uSun * (pow(nh, 900.0) * 2.4 * cellT + pow(nh, 80.0) * 0.16);

      // Foam breaks only where a crest is both high and steep, near the
      // camera; the slope is the coarse one, before the ripple, so wind
      // texture never reads as whitewater. Noise keeps the edge ragged.
      float foam = smoothstep(0.66, 0.92, crest + (vnoise(p.xz * 2.3 + drift) - 0.5) * 0.25)
        * smoothstep(0.08, 0.3, slope);
      foam *= (0.45 + 0.55 * vnoise(p.xz * 8.0 - drift)) * near * min(chop + 0.2, 1.0);
      col = mix(col, uFoam * (0.6 + 0.4 * max(n.y, 0.0)), clamp(foam, 0.0, 1.0) * 0.8);

      // Aerial perspective: fog the water into the colour the sky paints at
      // the horizon in this direction so the seam never reads as an edge.
      col = mix(col, horizonCol, smoothstep(25.0, 175.0, t));
    }
  }

  // Vignette to seat the copy, grain and a dither so the dusk gradient
  // never bands.
  col *= 1.0 - 0.12 * dot(uv * vec2(0.8, 1.0), uv * vec2(0.8, 1.0));
  col += (hash(vUv * 1731.0 + fract(uPhase)) - 0.5) * 0.022;
  col += (hash(vUv * 977.0) - 0.5) / 255.0;

  fragColor = vec4(col, 1.0);
}`;

const Tidal = memo(
	({
		title = "Built for the long swell",
		subtitle = "Steady under everything the surface does.",
		ctaLabel = "Chart a course",
		onCtaClick,
		waterColor = "#0a1e33",
		skyColor = "#2a1636",
		sunColor = "#ffab5e",
		foamColor = "#dcecf5",
		swellHeight = 1,
		choppiness = 1,
		speed = 1,
		sunHeight = 0.12,
		quality = "32",
		parallax = true,
		paused = false,
		reducedMotion = false,
		className,
	}: TidalProps) => {
		const containerRef = useRef<HTMLDivElement>(null);
		const drawRef = useRef<((dt: number) => void | false) | null>(null);
		const measureRef = useRef<((m: Metrics) => void) | null>(null);
		const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(
			null,
		);
		const pointer = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
		const [fallback, setFallback] = useState(false);
		const [entered, setEntered] = useState(false);
		const pausedRef = useRef(paused);
		pausedRef.current = paused;

		useEffect(() => setEntered(true), []);

		const loop = useAnimationLoop({
			target: containerRef,
			halted: paused,
			dpr: "auto",
			onResize: (metrics) => measureRef.current?.(metrics),
			onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
			gl: () => glRef.current,
		});

		const live = useRef({
			waterColor, skyColor, sunColor, foamColor,
			swellHeight, choppiness, speed, sunHeight, quality,
			parallax, reducedMotion,
		});
		live.current = {
			waterColor, skyColor, sunColor, foamColor,
			swellHeight, choppiness, speed, sunHeight, quality,
			parallax, reducedMotion,
		};

		useEffect(() => {
			const container = containerRef.current;
			if (fallback || !container) return;

			let renderer: Renderer;
			try {
				renderer = new Renderer({
					dpr: Math.min(window.devicePixelRatio || 1, 2),
					alpha: false,
				});
			} catch {
				setFallback(true);
				return;
			}
			const glc = renderer.gl;
			glRef.current = glc;

			const canvas = glc.canvas as HTMLCanvasElement;
			canvas.style.display = "block";
			canvas.style.position = "absolute";
			canvas.style.top = "0";
			canvas.style.left = "0";
			container.appendChild(canvas);

			const program = new Program(glc, {
				vertex: vert,
				fragment: frag,
				cullFace: false,
				depthTest: false,
				depthWrite: false,
				uniforms: {
					uWater: { value: new Float32Array(hexToRgb01(waterColor)) },
					uSky: { value: new Float32Array(hexToRgb01(skyColor)) },
					uSun: { value: new Float32Array(hexToRgb01(sunColor)) },
					uFoam: { value: new Float32Array(hexToRgb01(foamColor)) },
					uPhase: { value: 0 },
					uAspect: { value: 1 },
					uSwell: { value: swellHeight },
					uChop: { value: choppiness },
					uSunH: { value: sunHeight },
					uSteps: { value: STEPS[quality] ?? 32 },
					uPointer: { value: new Float32Array([0, 0]) },
				},
			});
			const mesh = new Mesh(glc, { geometry: new Triangle(glc), program });
			const u = program.uniforms as Record<string, { value: unknown }>;

			let phase = 0;

			drawRef.current = (dt) => {
				const l = live.current;
				const step = Math.min(dt, 1 / 30);
				const still = pausedRef.current || l.reducedMotion;

				if (!still) {
					phase = (phase + step * l.speed) % PHASE_WRAP;
					const ease = Math.min(1, step * 4);
					pointer.current.x += (pointer.current.tx - pointer.current.x) * ease;
					pointer.current.y += (pointer.current.ty - pointer.current.y) * ease;
				}

				const steer = l.parallax && !l.reducedMotion ? 1 : 0;
				((u.uWater as { value: Float32Array }).value).set(hexToRgb01(l.waterColor));
				((u.uSky as { value: Float32Array }).value).set(hexToRgb01(l.skyColor));
				((u.uSun as { value: Float32Array }).value).set(hexToRgb01(l.sunColor));
				((u.uFoam as { value: Float32Array }).value).set(hexToRgb01(l.foamColor));
				(u.uPhase as { value: number }).value = phase;
				(u.uSwell as { value: number }).value = l.swellHeight;
				(u.uChop as { value: number }).value = l.choppiness;
				(u.uSunH as { value: number }).value = l.sunHeight;
				(u.uSteps as { value: number }).value = STEPS[l.quality] ?? 32;
				const pv = u.uPointer.value as Float32Array;
				pv[0] = pointer.current.x * steer;
				pv[1] = pointer.current.y * steer;

				renderer.render({ scene: mesh });
			};

			measureRef.current = ({ width, height, dpr }: Metrics) => {
				renderer.dpr = dpr;
				renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
				(u.uAspect as { value: number }).value =
					Math.max(width, 1) / Math.max(height, 1);
				drawRef.current?.(0.016);
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

		useEffect(() => {
			loop.paint();
		}, [
			waterColor, skyColor, sunColor, foamColor, swellHeight,
			choppiness, speed, sunHeight, quality, parallax, loop,
		]);

		const track = (e: React.PointerEvent<HTMLDivElement>) => {
			const r = e.currentTarget.getBoundingClientRect();
			if (r.width === 0 || r.height === 0) return;
			pointer.current.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
			pointer.current.ty = -(((e.clientY - r.top) / r.height) * 2 - 1);
			loop.start();
		};

		const settle = () => {
			pointer.current.tx = 0;
			pointer.current.ty = 0;
			loop.start();
		};

		// Copy rises in with a stagger; reduced motion renders the final state
		// immediately. Inline styles keep the entrance inside the pasted file.
		const rise = (i: number): React.CSSProperties =>
			reducedMotion
				? {}
				: {
						opacity: entered ? 1 : 0,
						transform: entered ? "none" : "translateY(14px)",
						transition: `opacity 700ms cubic-bezier(0.22,1,0.36,1) ${i * 110}ms, transform 700ms cubic-bezier(0.22,1,0.36,1) ${i * 110}ms`,
					};

		// Left-aligned so the headline never crosses the sun path on the right.
		// White copy is deliberate: the scene is dark at every tunable setting,
		// and inheriting the host's font keeps the paste native to its brand.
		// The CTA is a miniature of the scene: a dusk gradient from the sun
		// colour to the foam colour, a small sun, and two wave silhouettes in
		// the water colour along the bottom that lift on hover. Every colour
		// comes from the props, so the button belongs to the palette at any
		// setting. Container-query sizing (cqi with px floors) so the same
		// layout holds from a bench preview to a fullscreen stage.
		const overlay = (
			<div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-start justify-center bg-[linear-gradient(90deg,rgba(0,0,0,0.32),rgba(0,0,0,0)_58%)] px-[max(20px,5.5cqi)] text-left">
				{title ? (
					<h1
						className="max-w-[max(260px,52cqi)] text-[max(28px,5.4cqi)] leading-[1.02] font-semibold tracking-tight text-white"
						style={rise(0)}
					>
						{title}
					</h1>
				) : null}
				{subtitle ? (
					<p
						className="mt-[max(10px,1.4cqi)] max-w-[max(220px,40cqi)] text-[max(12px,1.7cqi)] leading-snug text-white/70"
						style={rise(1)}
					>
						{subtitle}
					</p>
				) : null}
				{ctaLabel && !reducedMotion ? (
					<style>{`@keyframes __sg_tidal_wave { to { transform: translateX(-200px); } }
.__sg_tidal_cta g { animation: __sg_tidal_wave 11s linear infinite paused; }
.__sg_tidal_cta g:first-of-type { animation-duration: 19s; }
.__sg_tidal_cta:hover g, .__sg_tidal_cta:focus-visible g { animation-play-state: running; }`}</style>
				) : null}
				{ctaLabel ? (
					<button
						type="button"
						onClick={onCtaClick}
						className="__sg_tidal_cta pointer-events-auto relative mt-[max(18px,2.6cqi)] cursor-pointer overflow-hidden rounded-md px-[max(22px,3cqi)] py-[max(11px,1.4cqi)] text-[max(11px,1.3cqi)] font-bold tracking-[0.2em] uppercase shadow-[0_12px_30px_-12px_rgba(0,0,0,0.8)] transition-[transform,filter] duration-150 hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 active:scale-95"
						style={{
							...rise(2),
							color: waterColor,
							backgroundImage: `radial-gradient(circle at 88% 26%, ${sunColor} 0 4.5%, transparent 6%), linear-gradient(to bottom, ${sunColor} 0%, ${foamColor} 100%)`,
						}}
					>
						{/* The waves roll while the button is hovered: each path is three
						    periods wide and slides one period, so the loop is seamless and the
						    trailing edge never uncovers; the back wave is slower. The hover rule is
						    scoped to the button's own class in the style block above: a
						    Tailwind `group-hover` fires for any `.group` ancestor, and a host
						    page's wrapper may well be one; an inline `animation` shorthand
						    would reset the play-state, so the whole rule lives in CSS. The
						    svg overshoots the bottom edge by a pixel so no fractional DPR
						    can show the gradient beneath it. */}
						<svg
							aria-hidden
							viewBox="0 0 400 40"
							preserveAspectRatio="none"
							className="absolute inset-x-0 -bottom-px h-[58%] w-full"
						>
							<g>
								<path
									fill={waterColor}
									fillOpacity={0.5}
									d="M0 28 C 30 12, 60 12, 100 24 S 170 40, 200 28 C 230 12, 260 12, 300 24 S 370 40, 400 28 C 430 12, 460 12, 500 24 S 570 40, 600 28 V 40 H 0 Z"
								/>
							</g>
							<g>
								<path
									fill={waterColor}
									d="M0 34 C 40 20, 70 36, 100 26 S 160 14, 200 34 C 240 20, 270 36, 300 26 S 360 14, 400 34 C 440 20, 470 36, 500 26 S 560 14, 600 34 V 40 H 0 Z"
								/>
							</g>
						</svg>
						<span className="relative">{ctaLabel}</span>
					</button>
				) : null}
			</div>
		);

		if (fallback) {
			return (
				<div
					className={className ?? "@container relative h-full w-full overflow-hidden"}
					style={{
						backgroundColor: skyColor,
						backgroundImage: `radial-gradient(circle at 66% 50%, ${sunColor}88 0%, transparent 34%), linear-gradient(to bottom, ${skyColor} 0%, ${sunColor}40 52%, ${waterColor} 56%, ${waterColor} 100%)`,
					}}
				>
					{overlay}
				</div>
			);
		}

		return (
			<div
				ref={containerRef}
				className={className ?? "@container relative h-full w-full overflow-hidden"}
				onPointerMove={track}
				onPointerLeave={settle}
			>
				{overlay}
			</div>
		);
	},
);

Tidal.displayName = "Tidal";

export default Tidal;
