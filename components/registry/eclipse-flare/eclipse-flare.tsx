"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A hero opener built around a total eclipse: a matte disc over a light
// source, a streamered corona, a diamond-ring bead flaring on a slow breath,
// and god-rays marched through a veil of drifting cirrus. The scattering is
// screen-space — every pixel walks a short jittered line toward the light and
// sums how much of that path the disc and the cloud leave clear — so the whole
// scene is one fragment pass with no geometry and no depth buffer.
//
// The per-pixel interleaved-gradient-noise jitter is what lets the march stay
// short: neighbouring pixels sample the ray at offset phases, so banding
// dissolves into grain the eye reads as atmosphere.
//
// The copy sits on liquid glass: real backdrop blur over the canvas, a
// gradient fill, a specular sheen along the top edge and a hairline rim.
// Everything is inline classes so the paste carries the material with it.
//
// The pointer sways the composition (disc and light shift in OPPOSITE
// directions, which is all a depth cue needs) rather than orbiting a camera.
// A hero owns a CTA; claiming drag for a camera would put a gesture between
// the visitor and the click.
export interface EclipseFlareProps {
	/** Headline. An empty string removes the element. */
	title?: string;
	/** Supporting line under the headline. */
	subtitle?: string;
	/** Call-to-action label. An empty string removes the button. */
	ctaLabel?: string;
	/** Click handler for the call-to-action. */
	onCtaClick?: () => void;
	/** The light burning behind the disc. */
	coreColor?: string;
	/** Edge light grazing the eclipse rim. */
	rimColor?: string;
	/** The dark the rays cut through. */
	backgroundColor?: string;
	/** Occluder radius, as a fraction of the frame. */
	discSize?: number;
	/** God-ray strength past the silhouette. */
	rayIntensity?: number;
	/** How deeply the corona swells and the diamond ring flares. */
	breathe?: number;
	/** Global clock rate for the breathing. */
	speed?: number;
	/** Scatter sample count per pixel. */
	quality?: "16" | "28" | "48";
	/** The eclipse leans toward the pointer, easing back on leave. */
	parallax?: boolean;
	/** Halt the loop. The corona freezes mid-breath. */
	paused?: boolean;
	/** Settles the scene: static frame, copy at rest, no sway. */
	reducedMotion?: boolean;
	className?: string;
}

export type EclipseQuality = NonNullable<EclipseFlareProps["quality"]>;

const STEPS: Record<string, number> = {
	"16": 16,
	"28": 28,
	"48": 48,
};

// Every use of uPhase in the shader is a sine or cosine at a frequency that is
// a multiple of 0.01, so wrapping the clock at 200π lands every one of them
// back on its own start — no seam at the wrap, and float precision never rots.
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
uniform vec3 uCore;
uniform vec3 uRim;
uniform vec3 uBg;
uniform float uPhase;
uniform float uAspect;
uniform float uDisc;
uniform float uRays;
uniform float uBreathe;
uniform float uSteps;
uniform vec2 uPointer;

// Interleaved gradient noise — a screen-space dither that costs two fracts and
// still decorrelates neighbouring pixels well enough to hide the march steps.
float ign(vec2 px) {
  return fract(52.9829189 * fract(0.06711056 * px.x + 0.00583715 * px.y));
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Thin cirrus between the viewer and the light. Two octaves is enough for a
// veil, and the march samples it up to 48 times per pixel.
float veil(vec2 q) {
  return smoothstep(0.42, 0.88, vnoise(q) * 0.62 + vnoise(q * 2.13 + 7.3) * 0.38);
}

// 1 where the disc blocks the sample, 0 in the clear.
float occ(vec2 p, vec2 c, float r) {
  return smoothstep(r + 0.004, r - 0.004, distance(p, c));
}

void main() {
  // Aspect-corrected frame space, so the disc stays a circle at any size.
  vec2 p = (vUv * 2.0 - 1.0) * vec2(uAspect, 1.0);

  // Disc and light shift in opposite directions under the pointer — two
  // layers moving against each other is the whole depth illusion. The disc
  // sits in the upper half so the copy has the lower half to itself.
  vec2 discPos = vec2(0.0, 0.32) + uPointer * vec2(0.06, 0.04);
  vec2 lightPos = vec2(0.0, 0.32) - uPointer * vec2(0.05, 0.035);

  float breath = sin(uPhase * 0.7);
  float radius = uDisc * (1.0 + 0.006 * breath);
  // The corona swells on the breath; the bead flares on its crest only.
  float swell = 1.0 + uBreathe * 0.45 * breath;
  float flare = uBreathe * smoothstep(-0.3, 1.0, breath);

  // Sky: darker overhead, a 360-degree twilight band at the bottom edge —
  // under a total eclipse the horizon glows all the way round.
  vec3 col = uBg * mix(1.35, 0.55, vUv.y);
  col += uRim * 0.07 * pow(1.0 - vUv.y, 3.0);

  // Stars on a jittered cell lattice, fixed in the frame: they never sway
  // with the disc, which is exactly what says they are further away.
  float dist = distance(p, discPos);
  vec2 sc = p * 60.0;
  vec2 ci = floor(sc);
  float sh = hash21(ci);
  vec2 sj = vec2(hash21(ci + 3.1), hash21(ci + 7.7));
  float sd = length(fract(sc) - sj);
  float star = step(0.955, sh) * smoothstep(0.09, 0.0, sd) * (0.3 + 0.7 * fract(sh * 43.0));
  star *= smoothstep(radius * 1.2, radius * 2.8, dist) * smoothstep(0.0, 0.45, vUv.y);
  col += vec3(0.88, 0.92, 1.0) * star * 0.5;

  // Volumetric scatter: march from this pixel toward the light, summing what
  // the disc and the cirrus leave clear, older samples decayed. The jitter
  // offsets the whole ladder per pixel. Weights are normalised so a higher
  // sample count changes the grain, never the brightness.
  vec2 drift = vec2(cos(uPhase * 0.02), sin(uPhase * 0.01)) * 1.2;
  float jitter = ign(gl_FragCoord.xy);
  float illum = 0.0;
  float decay = 1.0;
  float wsum = 0.0;
  for (int i = 0; i < 48; i++) {
    if (float(i) >= uSteps) break;
    vec2 sp = mix(p, lightPos, (float(i) + jitter) / uSteps);
    float clear = (1.0 - occ(sp, discPos, radius)) * (1.0 - veil(sp * 2.2 + drift) * 0.9);
    illum += clear * decay;
    wsum += decay;
    decay *= 0.962;
  }
  illum /= wsum;

  float d = distance(p, lightPos);
  col += uCore * illum * illum * exp(-d * 2.1) * uRays * swell * 1.1;
  // The veil itself, lit from behind where the rays reach it.
  float vHere = veil(p * 2.2 + drift);
  col += mix(uRim, uCore, 0.4) * vHere * exp(-d * 2.4) * illum * uRays * 0.4;

  // Corona: a bright structure-free inner ring, then streamers — angular
  // harmonics that drift at different rates, longest along the equator,
  // short polar plumes. Integer harmonics stay continuous across the seam.
  float t = max(dist - radius, 0.0);
  float cang = atan(p.y - discPos.y, p.x - discPos.x);
  float streamer = 0.55
    + 0.25 * sin(cang * 6.0 + 1.3 + uPhase * 0.03)
    + 0.14 * sin(cang * 11.0 - 0.7 - uPhase * 0.02)
    + 0.06 * sin(cang * 23.0 + 2.1);
  streamer *= 0.72 + 0.28 * cos(2.0 * cang);
  float corona = (exp(-t * 3.4) * 0.5 + 0.16 / (1.0 + t * t * 70.0)) * streamer
    + exp(-t * 26.0) * 0.75;
  corona *= swell * (1.0 - occ(p, discPos, radius));
  col += mix(uCore, uRim, smoothstep(0.0, 0.35, t)) * corona;

  // The disc itself: matte, near-black, a whisper of earthshine at the limb.
  // Painted over the rays — it is the occluder.
  float discMask = occ(p, discPos, radius);
  vec3 discCol = uBg * 0.1 + uRim * 0.035 * smoothstep(radius * 0.7, radius, dist);
  col = mix(col, discCol, discMask);

  // Chromosphere: the thin pink-red ring a real eclipse shows at the limb.
  float edge = dist - radius;
  col += mix(uRim, vec3(1.0, 0.42, 0.36), 0.6) * exp(-max(edge, 0.0) * 110.0) * (1.0 - discMask) * 0.7 * swell;

  // Diamond ring: the first bead of sun clearing the limb, on the side the
  // light leans toward. Brightest on the crest of the breath.
  vec2 beadDir = normalize(vec2(0.45, 0.6) - uPointer * vec2(1.4, 1.0));
  vec2 beadPos = discPos + beadDir * radius;
  float side = 0.6 + 0.4 * dot(normalize(p - discPos + 1e-4), beadDir);
  col += uRim * exp(-abs(edge) * 32.0) * side * 0.45;
  float bd = distance(p, beadPos);
  float bead = (exp(-bd * 70.0) * 2.2 + exp(-bd * 14.0) * 0.45) * (0.35 + flare);
  col += mix(uCore, vec3(1.0), 0.5) * bead;
  // Anamorphic streak off the bead, and lens ghosts strung through the frame
  // centre — the camera's admission that it is looking at the sun.
  col += uCore * exp(-abs(p.y - beadPos.y) * 70.0) * exp(-abs(p.x - beadPos.x) * 2.6) * 0.5 * (0.2 + flare);
  for (int k = 0; k < 3; k++) {
    float f = 0.55 + float(k) * 0.35;
    vec2 gp = mix(beadPos, -beadPos, f);
    float gr = 0.035 + float(k) * 0.03;
    float g = smoothstep(gr, gr - 0.012, distance(p, gp)) * (k == 1 ? 0.07 : 0.045);
    col += mix(uRim, uCore, 0.5) * g * (0.3 + flare);
  }

  // Vignette, then film grain riding the same clock so a settled scene holds
  // a still frame, then a dither so the dark gradients never band.
  col *= 1.0 - 0.14 * dot(p, p);
  col += (ign(gl_FragCoord.xy + vec2(fract(uPhase * 0.31) * 61.0, fract(uPhase * 0.17) * 43.0)) - 0.5) * 0.024;
  col += (hash21(gl_FragCoord.xy) - 0.5) / 255.0;

  fragColor = vec4(col, 1.0);
}`;

// Liquid glass: real blur of the canvas behind, a diagonal gradient fill so
// the pane reads as having thickness, a hairline rim, an inset top highlight
// and the drop the pane casts on the scene. The sheen is a pseudo-element so
// it never interferes with the label.
const GLASS =
	"relative overflow-hidden rounded-full border border-white/20 bg-[linear-gradient(135deg,rgba(255,255,255,0.18),rgba(255,255,255,0.05)_48%,rgba(255,255,255,0.12))] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-1px_0_rgba(255,255,255,0.08),0_14px_40px_-14px_rgba(0,0,0,0.7)] backdrop-blur-xl backdrop-saturate-150 before:pointer-events-none before:absolute before:inset-x-[8%] before:top-0 before:h-[46%] before:rounded-full before:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.3),rgba(255,255,255,0))] before:content-['']";

const EclipseFlare = memo(
	({
		title = "After the eclipse",
		subtitle = "Light finds its way around everything you put in front of it.",
		ctaLabel = "Step into the light",
		onCtaClick,
		coreColor = "#f6e3b4",
		rimColor = "#e8b96a",
		backgroundColor = "#060409",
		discSize = 0.28,
		rayIntensity = 1,
		breathe = 0.6,
		speed = 1,
		quality = "28",
		parallax = true,
		paused = false,
		reducedMotion = false,
		className,
	}: EclipseFlareProps) => {
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
			coreColor, rimColor, backgroundColor,
			discSize, rayIntensity, breathe, speed, quality,
			parallax, reducedMotion,
		});
		live.current = {
			coreColor, rimColor, backgroundColor,
			discSize, rayIntensity, breathe, speed, quality,
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
					uCore: { value: new Float32Array(hexToRgb01(coreColor)) },
					uRim: { value: new Float32Array(hexToRgb01(rimColor)) },
					uBg: { value: new Float32Array(hexToRgb01(backgroundColor)) },
					uPhase: { value: 0 },
					uAspect: { value: 1 },
					uDisc: { value: discSize },
					uRays: { value: rayIntensity },
					uBreathe: { value: breathe },
					uSteps: { value: STEPS[quality] ?? 28 },
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
					// Ease toward the pointer target — a hard follow reads as bolted
					// to the cursor instead of leaning after it.
					const ease = Math.min(1, step * 4);
					pointer.current.x += (pointer.current.tx - pointer.current.x) * ease;
					pointer.current.y += (pointer.current.ty - pointer.current.y) * ease;
				}

				const steer = l.parallax && !l.reducedMotion ? 1 : 0;
				((u.uCore as { value: Float32Array }).value).set(hexToRgb01(l.coreColor));
				((u.uRim as { value: Float32Array }).value).set(hexToRgb01(l.rimColor));
				((u.uBg as { value: Float32Array }).value).set(hexToRgb01(l.backgroundColor));
				(u.uPhase as { value: number }).value = phase;
				(u.uDisc as { value: number }).value = l.discSize;
				(u.uRays as { value: number }).value = l.rayIntensity;
				(u.uBreathe as { value: number }).value = l.reducedMotion ? 0 : l.breathe;
				(u.uSteps as { value: number }).value = STEPS[l.quality] ?? 28;
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
			coreColor, rimColor, backgroundColor, discSize, rayIntensity,
			breathe, speed, quality, parallax, loop,
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
		// immediately. Inline styles keep the entrance inside the pasted file —
		// no keyframes required in the host project's CSS.
		const rise = (i: number): React.CSSProperties =>
			reducedMotion
				? {}
				: {
						opacity: entered ? 1 : 0,
						transform: entered ? "none" : "translateY(14px)",
						transition: `opacity 700ms cubic-bezier(0.22,1,0.36,1) ${i * 110}ms, transform 700ms cubic-bezier(0.22,1,0.36,1) ${i * 110}ms`,
					};

		// The copy starts at the frame's midline, under the disc, so the eclipse
		// is never behind the headline. Type is container-query sized so a bench
		// preview and a fullscreen hero share one layout. White copy is
		// deliberate: the scene is dark at every tunable setting, and inheriting
		// the host's font keeps the paste native to its brand.
		const overlay = (
			<div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex flex-col items-center px-[max(16px,4cqi)] text-center">
				{title ? (
					<h1
						className="max-w-[80cqi] text-[max(28px,5.2cqi)] leading-[1.02] font-semibold tracking-tight text-white"
						style={rise(0)}
					>
						{title}
					</h1>
				) : null}
				{subtitle ? (
					<p
						className="mt-[max(10px,1.4cqi)] max-w-[54cqi] text-[max(12px,1.7cqi)] leading-snug text-white/70"
						style={rise(1)}
					>
						{subtitle}
					</p>
				) : null}
				{ctaLabel ? (
					<button
						type="button"
						onClick={onCtaClick}
						className={`${GLASS} pointer-events-auto mt-[max(18px,2.6cqi)] cursor-pointer px-[max(18px,2.6cqi)] py-[max(9px,1.1cqi)] text-[max(12px,1.35cqi)] font-medium text-white transition-[transform,background-color] duration-200 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 active:scale-95`}
						style={rise(2)}
					>
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
						backgroundColor,
						backgroundImage: `radial-gradient(circle at 50% 34%, ${rimColor}55 0%, transparent 30%), radial-gradient(circle at 50% 34%, ${coreColor}44 0%, transparent 60%), linear-gradient(to bottom, ${backgroundColor}, ${backgroundColor})`,
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

EclipseFlare.displayName = "EclipseFlare";

export default EclipseFlare;
