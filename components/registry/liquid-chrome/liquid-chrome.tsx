"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A liquid-chrome centerpiece: up to five spheres on slow Lissajous orbits,
// fused by a smooth-min into one morphing mass, sphere-traced in a single
// fragment pass and hovering over a black mirror floor.
//
// Chrome is nothing but what it reflects, so the studio IS the material: a
// cyclorama ramp (dark floor, lit backdrop at eye level, dark ceiling) plus
// four rectangular softboxes — a white key above-right, a tall accent strip
// left, a rim behind, a low bounce card in front — sampled by direction. One
// mirror bounce lets the lobes reflect each other in the crevices, a short
// occlusion walk seats them, and ACES rolls the softbox highlights off
// instead of clipping them. The floor marches the mirrored ray once so the
// form's reflection sits under it; the rest of the floor is fogged into the
// backdrop so no horizon line can form.
//
// The form sits right of the copy (a lens shift, not a camera move, so the
// perspective stays centred) and above it in portrait. The pointer sways the
// camera a few degrees rather than orbit-dragging it: the blob morphs
// continuously, so every part of its surface presents itself over a few
// seconds of watching — and a hero owns a CTA, so no gesture may sit between
// the visitor and the click.
export interface LiquidChromeProps {
	/** Headline. An empty string removes the element. */
	title?: string;
	/** Supporting line under the headline. */
	subtitle?: string;
	/** Call-to-action label. An empty string removes the button. */
	ctaLabel?: string;
	/** Click handler for the call-to-action. */
	onCtaClick?: () => void;
	/** Metal tint on the reflections. */
	chromeColor?: string;
	/** The second softbox — the colored glint in the chrome. */
	accentColor?: string;
	/** Studio void behind the blob. */
	backgroundColor?: string;
	/** How many spheres melt into the form. */
	blobCount?: "2" | "3" | "4" | "5";
	/** How fast the form breathes and reflows. */
	morphSpeed?: number;
	/** Blend radius where the blobs fuse — low is lumpy, high is one mass. */
	smoothness?: number;
	/** Softbox sharpness — below 1 the metal goes to pewter, above 1 the studio lights harden. */
	gloss?: number;
	/** March step ceiling — the mirror bounce and the floor reflection run at half of it. */
	quality?: "40" | "64" | "96";
	/** The camera sways toward the pointer, easing back on leave. */
	parallax?: boolean;
	/** Halt the loop. The form freezes mid-morph. */
	paused?: boolean;
	/** Settles the scene: static front view, copy at rest, no sway. */
	reducedMotion?: boolean;
	className?: string;
}

export type LiquidChromeBlobCount = NonNullable<LiquidChromeProps["blobCount"]>;
export type LiquidChromeQuality = NonNullable<LiquidChromeProps["quality"]>;

const COUNTS: Record<string, number> = {
	"2": 2,
	"3": 3,
	"4": 4,
	"5": 5,
};

const STEPS: Record<string, number> = {
	"40": 40,
	"64": 64,
	"96": 96,
};

// Every rate in the shader is a multiple of 0.01, so one shared period of
// 200π brings every sin/cos back to its start and the wrap is invisible.
// An arbitrary wrap (the first draft used 1000) snapped the whole form once
// per lap.
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
uniform vec3 uChrome;
uniform vec3 uAccent;
uniform vec3 uBg;
uniform float uPhase;
uniform float uAspect;
uniform float uCount;
uniform float uSmooth;
uniform float uGloss;
uniform float uSteps;
uniform float uPixel;
uniform float uDist;
uniform vec2 uShift;
uniform vec2 uPointer;

const float FLOOR_Y = -1.1;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

// Each sphere rides its own Lissajous orbit — sin/cos with per-blob rate
// multipliers chosen off any common divisor, so the ensemble never visibly
// repeats even though every term is periodic and bounded.
vec3 blobCenter(int i, float t) {
  float fi = float(i);
  float a = t * (0.51 + fi * 0.17) + fi * 2.4;
  float b = t * (0.43 + fi * 0.21) + fi * 1.7;
  float c = t * (0.37 + fi * 0.15) + fi * 3.9;
  return vec3(sin(a) * 0.55, sin(b) * 0.4, sin(c) * 0.36);
}

float map(vec3 p, float t) {
  float d = 1e5;
  for (int i = 0; i < 5; i++) {
    if (float(i) >= uCount) break;
    vec3 c = blobCenter(i, t);
    float r = 0.45 + 0.06 * sin(t * (0.6 + float(i) * 0.21) + float(i));
    d = smin(d, length(p - c) - r, uSmooth);
  }
  // Liquid skin: a faint travelling ripple on the distance field. Tiny in
  // amplitude, but a mirror magnifies slope, so the softbox edges waver the
  // way they do on mercury. Small enough to keep the field near-Lipschitz.
  d += 0.005 * sin(p.x * 9.0 + t * 1.7) * sin(p.y * 8.0 - t * 1.3) * sin(p.z * 7.0 + t * 1.1);
  return d;
}

vec3 normalAt(vec3 p, float t) {
  // Tetrahedron gradient: four taps for a normal instead of six.
  vec2 k = vec2(1.0, -1.0) * 0.0018;
  return normalize(
    k.xyy * map(p + k.xyy, t) +
    k.yyx * map(p + k.yyx, t) +
    k.yxy * map(p + k.yxy, t) +
    k.xxx * map(p + k.xxx, t));
}

float occlusion(vec3 p, vec3 n, float t) {
  float o = 0.0, s = 1.0;
  for (int i = 1; i <= 4; i++) {
    float h = 0.04 * float(i);
    o += (h - map(p + n * h, t)) * s;
    s *= 0.72;
  }
  return clamp(1.0 - 2.4 * o, 0.0, 1.0);
}

// A rectangular softbox facing the origin: the direction is projected onto
// the light's plane one unit out, and the rectangle's edges are feathered
// by roughness. Sharp rectangles are what make chrome read as chrome.
float softbox(vec3 d, vec3 L, vec2 sz, float feather) {
  float dl = dot(d, L);
  if (dl <= 0.0) return 0.0;
  vec3 R = normalize(cross(vec3(0.0, 1.0, 0.0), L));
  vec3 U = cross(L, R);
  vec2 q = vec2(dot(d, R), dot(d, U)) / dl;
  vec2 e = sz - abs(q);
  return smoothstep(-feather, feather, e.x) * smoothstep(-feather, feather, e.y) * smoothstep(0.0, 0.25, dl);
}

// The whole studio, by direction. The ramp is most of the material: dark
// enough below that the metal has a belly, bright at eye level so the mass
// never reads as a silhouette, dark again overhead so the softboxes carry
// the highlights.
vec3 env(vec3 d) {
  float g = clamp(uGloss, 0.0, 1.0);
  float boost = 1.0 + max(uGloss - 1.0, 0.0) * 0.45;
  float feather = mix(0.5, 0.035, g);
  float lip = mix(0.35, 0.03, g);
  float up = d.y;
  vec3 floorC = uBg * 0.6 + vec3(0.05);
  vec3 lipC = vec3(0.86, 0.87, 0.9);
  vec3 wallC = vec3(0.42, 0.42, 0.47);
  vec3 ceilC = vec3(0.2, 0.2, 0.24);
  vec3 c = mix(floorC, lipC, smoothstep(-0.5, -lip, up));
  c = mix(c, wallC, smoothstep(lip * 0.3, 0.3 + lip, up));
  c = mix(c, ceilC, smoothstep(0.4, 0.95, up));
  c += vec3(1.0, 0.98, 0.95) * softbox(d, normalize(vec3(0.55, 0.72, 0.42)), vec2(0.7, 0.42), feather) * 2.2 * boost;
  c += uAccent * softbox(d, normalize(vec3(-0.78, 0.2, 0.5)), vec2(0.25, 0.8), feather * 1.3) * 1.8 * boost;
  c += vec3(0.9, 0.92, 1.0) * softbox(d, normalize(vec3(0.15, 0.35, -0.92)), vec2(1.0, 0.25), feather * 1.5) * 1.2;
  c += vec3(0.35) * softbox(d, normalize(vec3(0.0, -0.42, 0.9)), vec2(0.8, 0.35), feather * 2.0 + 0.2) * 0.8;
  return c;
}

// Metal: the tint is the base reflectance, and grazing angles go white.
vec3 chrome(vec3 e, vec3 rd, vec3 n) {
  float cosv = max(dot(-rd, n), 0.0);
  vec3 F = uChrome + (1.0 - uChrome) * pow(1.0 - cosv, 5.0);
  return e * F;
}

// The void behind everything: radial falloff around the form, an accent
// bloom, a whisper of key spill.
vec3 backdrop(vec2 uv) {
  float r = length(uv * vec2(0.8, 1.0));
  vec3 c = uBg * mix(1.45, 0.55, smoothstep(0.0, 1.8, r));
  c += uAccent * exp(-r * r * 1.6) * 0.13;
  c += vec3(0.55, 0.56, 0.62) * exp(-r * r * 0.9) * 0.05;
  return c;
}

void main() {
  vec2 uvn = vUv * 2.0 - 1.0;
  // Lens shift: the form's image moves, the perspective does not.
  vec2 uv = uvn * vec2(uAspect, 1.0) - uShift;

  // Slightly raised camera looking a few degrees down, so the floor and the
  // reflection in it are in frame; the pointer sways it around the form.
  vec3 ro = vec3(0.0, 0.14 * uDist, uDist);
  vec3 rd = normalize(vec3(uv * 0.62, -1.0));
  rd.yz *= rot(-0.14);
  float yaw = -uPointer.x * 0.22;
  float pitch = -uPointer.y * 0.16;
  ro.xz *= rot(yaw); rd.xz *= rot(yaw);
  ro.yz *= rot(pitch); rd.yz *= rot(pitch);
  float t = uPhase;

  float tf = rd.y < -1e-4 ? (FLOOR_Y - ro.y) / rd.y : 1e5;
  float tmax = min(tf, 7.5);

  // Sphere-trace with an early out, tracking the closest approach in pixels
  // so a near miss can still be shaded and blended: silhouette anti-aliasing
  // for the price of a division.
  float dist = 0.0, minR = 1e5;
  vec3 pNear = ro;
  bool hit = false;
  for (int i = 0; i < 96; i++) {
    if (float(i) >= uSteps) break;
    vec3 p = ro + rd * dist;
    float d = map(p, t);
    float px = max(uPixel * dist, 0.0007);
    if (d < px * 0.5) { hit = true; break; }
    float r = d / px;
    if (r < minR) { minR = r; pNear = p; }
    dist += d * 0.9;
    if (dist > tmax) break;
  }

  vec3 col = backdrop(uv);

  if (!hit && tf < 1e4) {
    // Black mirror floor: a darker copy of the backdrop, a soft contact
    // shadow, and the form's reflection — one march along the mirrored ray,
    // fresnel-weighted like glossy acrylic and faded with the distance to
    // the surface so only the underside ghosts through.
    vec3 pf = ro + rd * tf;
    // The key sits front-right-high, so the shadow falls back-left.
    float rs = length((pf.xz - vec2(-0.2, -0.35)) * vec2(1.0, 1.3));
    vec3 fc = col * 0.72;
    fc *= 1.0 - 0.3 * exp(-rs * rs * 2.0);
    vec3 rr = reflect(rd, vec3(0.0, 1.0, 0.0));
    float d2 = 0.0;
    bool h2 = false;
    for (int i = 0; i < 48; i++) {
      if (float(i) >= uSteps * 0.5) break;
      vec3 q = pf + rr * d2;
      float dd = map(q, t);
      if (dd < 0.002 * (1.0 + d2)) { h2 = true; break; }
      d2 += dd * 0.9;
      if (d2 > 6.0) break;
    }
    if (h2) {
      vec3 q = pf + rr * d2;
      vec3 n2 = normalAt(q, t);
      vec3 rc = aces(chrome(env(reflect(rr, n2)), rr, n2) * mix(0.6, 1.0, occlusion(q, n2, t)));
      float Ff = 0.3 + 0.7 * pow(1.0 - max(-rd.y, 0.0), 5.0);
      fc += rc * Ff * exp(-d2 * 0.9);
    }
    col = mix(fc, col, 1.0 - exp(-tf * 0.09));
  }

  float alpha = hit ? 1.0 : clamp(1.5 - minR, 0.0, 1.0);
  if (alpha > 0.0) {
    vec3 p = hit ? ro + rd * dist : pNear;
    vec3 n = normalAt(p, t);
    vec3 ref = reflect(rd, n);
    vec3 e = env(ref);
    // One mirror bounce: does the chrome see itself? Only the crevices do,
    // and that is exactly where the fused-mass read comes from.
    float d2 = 0.03;
    bool h2 = false;
    vec3 o2 = p + n * 0.006;
    for (int i = 0; i < 48; i++) {
      if (float(i) >= uSteps * 0.5) break;
      vec3 q = o2 + ref * d2;
      float dd = map(q, t);
      if (dd < 0.0025 * (1.0 + d2) && d2 > 0.05) { h2 = true; break; }
      d2 += dd * 0.9;
      if (d2 > 4.0) break;
    }
    if (h2) {
      vec3 q = o2 + ref * d2;
      vec3 n2 = normalAt(q, t);
      e = chrome(env(reflect(ref, n2)), ref, n2) * mix(0.55, 1.0, occlusion(q, n2, t));
    }
    vec3 c = chrome(e, rd, n) * mix(0.5, 1.0, occlusion(p, n, t));
    col = mix(col, aces(c), alpha);
  }

  // Gentle vignette to seat the copy; a hair of dither so the void's
  // gradient never bands.
  col *= 1.0 - 0.28 * dot(uvn * 0.6, uvn * 0.6);
  col += (hash(gl_FragCoord.xy) - 0.5) * (1.0 / 128.0);

  fragColor = vec4(col, 1.0);
}`;

const LiquidChrome = memo(
	({
		title = "Form in flux",
		subtitle = "Never the same shape twice, always the same substance.",
		ctaLabel = "Watch it move",
		onCtaClick,
		chromeColor = "#dfe4ee",
		accentColor = "#a855f7",
		backgroundColor = "#0a0a12",
		blobCount = "4",
		morphSpeed = 1,
		smoothness = 0.35,
		gloss = 1,
		quality = "64",
		parallax = true,
		paused = false,
		reducedMotion = false,
		className,
	}: LiquidChromeProps) => {
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
			chromeColor, accentColor, backgroundColor,
			blobCount, morphSpeed, smoothness, gloss, quality,
			parallax, reducedMotion,
		});
		live.current = {
			chromeColor, accentColor, backgroundColor,
			blobCount, morphSpeed, smoothness, gloss, quality,
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
					uChrome: { value: new Float32Array(hexToRgb01(chromeColor)) },
					uAccent: { value: new Float32Array(hexToRgb01(accentColor)) },
					uBg: { value: new Float32Array(hexToRgb01(backgroundColor)) },
					uPhase: { value: 0 },
					uAspect: { value: 1 },
					uCount: { value: COUNTS[blobCount] ?? 4 },
					uSmooth: { value: smoothness },
					uGloss: { value: gloss },
					uSteps: { value: STEPS[quality] ?? 64 },
					uPixel: { value: 0.002 },
					uDist: { value: 2.7 },
					uShift: { value: new Float32Array([0, 0]) },
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
					phase = (phase + step * l.morphSpeed) % PHASE_WRAP;
					const ease = Math.min(1, step * 4);
					pointer.current.x += (pointer.current.tx - pointer.current.x) * ease;
					pointer.current.y += (pointer.current.ty - pointer.current.y) * ease;
				}

				const steer = l.parallax && !l.reducedMotion ? 1 : 0;
				((u.uChrome as { value: Float32Array }).value).set(hexToRgb01(l.chromeColor));
				((u.uAccent as { value: Float32Array }).value).set(hexToRgb01(l.accentColor));
				((u.uBg as { value: Float32Array }).value).set(hexToRgb01(l.backgroundColor));
				(u.uPhase as { value: number }).value = phase;
				(u.uCount as { value: number }).value = COUNTS[l.blobCount] ?? 4;
				(u.uSmooth as { value: number }).value = l.smoothness;
				(u.uGloss as { value: number }).value = l.gloss;
				(u.uSteps as { value: number }).value = STEPS[l.quality] ?? 64;
				const pv = u.uPointer.value as Float32Array;
				pv[0] = pointer.current.x * steer;
				pv[1] = pointer.current.y * steer;

				renderer.render({ scene: mesh });
			};

			measureRef.current = ({ width, height, dpr }: Metrics) => {
				renderer.dpr = dpr;
				renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
				const aspect = Math.max(width, 1) / Math.max(height, 1);
				(u.uAspect as { value: number }).value = aspect;
				// World size of one pixel at unit distance: the lens spans 1.24
				// units of ray slope over the canvas height.
				(u.uPixel as { value: number }).value = 1.24 / Math.max(height * dpr, 1);
				// Landscape puts the form at 68% of the width, a touch above centre
				// so its floor reflection has room below it; portrait lifts it
				// above the copy. Same orientation split as the container query on
				// the copy, so the two never disagree.
				const sv = u.uShift.value as Float32Array;
				sv[0] = aspect > 1 ? 0.36 * aspect : 0;
				sv[1] = aspect > 1 ? 0.1 : 0.3;
				// A narrow frame backs the camera off so the form keeps to about
				// three quarters of the width instead of spilling past both edges.
				(u.uDist as { value: number }).value =
					2.7 * Math.min(1.6, Math.max(1, 0.85 / aspect));
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
			chromeColor, accentColor, backgroundColor, blobCount, morphSpeed,
			smoothness, gloss, quality, parallax, loop,
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

		// The CTA is a chrome pill: the metal tint is the fill, a horizon
		// gradient over it does the reflection, and the label's ink follows the
		// tint's luminance so a dark metal keeps a legible button.
		const [cr, cg, cb] = hexToRgb01(chromeColor);
		const ink = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb > 0.45 ? "#0c0c14" : "#f4f2fa";

		// White copy is deliberate: the scene is dark at every tunable setting,
		// and inheriting the host's font keeps the paste native to its brand.
		// The copy sits left in landscape, under the form in portrait — the
		// same orientation split the shader uses for its lens shift.
		const overlay = (
			<div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-start justify-end bg-[linear-gradient(0deg,rgba(0,0,0,0.45),rgba(0,0,0,0)_55%)] px-[max(20px,5.5cqi)] pb-[max(20px,6cqi)] text-left [@container(orientation:landscape)]:justify-center [@container(orientation:landscape)]:bg-[linear-gradient(90deg,rgba(0,0,0,0.3),rgba(0,0,0,0)_55%)] [@container(orientation:landscape)]:pb-0">
				{title ? (
					<h1
						className="max-w-[max(260px,44cqi)] text-[max(28px,5.4cqi)] leading-[1.02] font-semibold tracking-tight text-white"
						style={rise(0)}
					>
						{title}
					</h1>
				) : null}
				{subtitle ? (
					<p
						className="mt-[max(10px,1.4cqi)] max-w-[max(220px,38cqi)] text-[max(12px,1.7cqi)] leading-snug text-white/70"
						style={rise(1)}
					>
						{subtitle}
					</p>
				) : null}
				{ctaLabel && !reducedMotion ? (
					// The sheen sweeps once per hover: `forwards` parks it off the
					// right edge while hovered, and leaving drops the animation so
					// the inline transform resets it to the left for the next pass.
					// Scoped to the button's own hover on purpose — group-hover would
					// fire from any ancestor that carries `group`.
					<style>{`@keyframes __sg_lc_sheen { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
.__sg_lc_cta:hover .__sg_lc_sheen, .__sg_lc_cta:focus-visible .__sg_lc_sheen { animation: __sg_lc_sheen 900ms cubic-bezier(0.4,0,0.2,1) forwards; }`}</style>
				) : null}
				{ctaLabel ? (
					<button
						type="button"
						onClick={onCtaClick}
						className="__sg_lc_cta pointer-events-auto relative mt-[max(18px,2.6cqi)] cursor-pointer overflow-hidden rounded-full px-[max(22px,3cqi)] py-[max(11px,1.4cqi)] text-[max(11px,1.3cqi)] font-bold tracking-[0.2em] uppercase shadow-[0_14px_34px_-12px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.85),inset_0_-1px_0_rgba(0,0,0,0.4)] transition-[transform,filter] duration-150 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 active:scale-95"
						style={{
							...rise(2),
							color: ink,
							backgroundColor: chromeColor,
							backgroundImage: `radial-gradient(120% 90% at 16% 12%, color-mix(in srgb, ${accentColor} 45%, transparent), transparent 55%), linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.35) 42%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.22) 60%, rgba(255,255,255,0.15) 85%, rgba(255,255,255,0.55) 100%)`,
						}}
					>
						<span
							aria-hidden
							className="__sg_lc_sheen pointer-events-none absolute inset-0"
							style={{
								transform: "translateX(-100%)",
								backgroundImage:
									"linear-gradient(105deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.22) 44%, rgba(255,255,255,0.9) 50%, rgba(0,0,0,0.22) 56%, rgba(0,0,0,0) 70%)",
							}}
						/>
						<span className="relative">{ctaLabel}</span>
					</button>
				) : null}
			</div>
		);

		if (fallback) {
			return (
				<div
					className={className ?? "relative h-full w-full overflow-hidden @container-size"}
					style={{
						backgroundColor,
						backgroundImage: `radial-gradient(circle at 68% 50%, ${chromeColor}55 0%, transparent 30%), radial-gradient(circle at 62% 44%, ${accentColor}44 0%, transparent 42%), linear-gradient(to bottom, ${backgroundColor}, ${backgroundColor})`,
					}}
				>
					{overlay}
				</div>
			);
		}

		return (
			<div
				ref={containerRef}
				// A size container, not the default inline-size one: the copy's
				// orientation query needs the block axis, and cqi still resolves.
				className={className ?? "relative h-full w-full overflow-hidden @container-size"}
				onPointerMove={track}
				onPointerLeave={settle}
			>
				{overlay}
			</div>
		);
	},
);

LiquidChrome.displayName = "LiquidChrome";

export default LiquidChrome;
