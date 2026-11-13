"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Camera, Geometry, Mesh, Program, Renderer, Transform, Triangle } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A night lake with paper lanterns rising off it, beside left-aligned copy.
//
// THE LANTERNS. Each one is a quad that turns to face the camera about its
// vertical axis, shaded as a lit paper shell: a hot mouth where the flame is,
// warm paper above it, darker shoulders. They are drawn three times from one
// instance buffer. First the shells, written to depth with alpha to coverage,
// so they sort themselves and still have soft edges. Then a larger additive
// quad per lantern for the glow, depth tested against the shells but never
// written, so a glow can be hidden by a nearer lantern and can never hide
// one. Last, the same lanterns mirrored under the water as a stretched,
// shearing smear of light.
//
// A PATH, AND A KNOCK OFF IT. Where a lantern would be if nothing touched it
// is a function of one wrapped phase and its own seed, worked out in the
// vertex shader: where it started, how far up it is, how far the wind has
// leaned it. Every lantern climbs a whole number of times per cycle, so the
// phase can wrap without a single one jumping, and no value in the shader
// ever grows with time. On top of that path each lantern carries an offset
// and a tilt. Those are the only simulated state, and they go back to zero
// each time the lantern leaves the water.
//
// THE POINTER IS A SOLID THING. The loop works out the same path on the CPU,
// sweeps the pointer's travel since the last frame across the lanterns as
// discs on the screen, and hits the nearest one under it. The blow is a
// collision, not a shove: it acts along the line from the point of contact to
// the middle of the lantern, and only on the speed the two are closing at. A
// hit through the middle sends the lantern the way the pointer was going, a
// graze sends it sideways and spins it, and a lantern already moving away
// faster than the pointer is not hit again. Paper is light, so the air takes
// a fast lantern down hard and lets a slow one drift. A knocked lantern
// swings with its top trailing and rights itself, bounces off the water, and
// hands some of its speed to a lantern it runs into.
//
// A CLICK lets go of a cluster from the water under the pointer. Those are a
// small second pool in the same buffer, placed from the age of the click that
// owns them.
//
// THE CAMERA orbits the middle of the cloud. Drag turns it, a release coasts,
// and the pitch is held between "just above the water" and "looking down on
// the lake". The pointer hits lanterns on hover and turns the camera on drag,
// so looking around never disturbs the scene by accident.
//
// The sky, the hills and the water are one fullscreen fragment shader. The
// water is a mirror with ripples: it reflects that same sky function along a
// disturbed ray.

export interface SkyLanternsProps {
	/** Headline, left-aligned over the scene. */
	title?: string;
	/** One or two lines under the headline. */
	subtitle?: string;
	/** Label of the button. Leave it out for no button. */
	ctaLabel?: string;
	onCtaClick?: () => void;
	/** How many lanterns are in the air, in fixed steps. Each step rebuilds them. */
	count?: "150" | "300" | "600";
	/** The paper. */
	lanternColor?: string;
	/** The flame, and the light it throws. */
	glowColor?: string;
	/** The sky overhead. */
	skyColor?: string;
	/** The lake. */
	waterColor?: string;
	/** How fast the lanterns climb. 0 holds them in the air. */
	rise?: number;
	/** How much each flame wavers. */
	flicker?: number;
	/** How far the wind leans the lanterns as they climb. */
	wind?: number;
	/** Mist in the air. More mist gives each lantern a bigger glow. */
	haze?: number;
	/** How strong the reflections on the water are. */
	reflection?: number;
	/** Turn slowly while nothing is held. */
	autoRotate?: boolean;
	/** The camera leans toward the pointer. */
	parallax?: boolean;
	/** Halt the scene where it is. */
	paused?: boolean;
	/** A still scene. The pointer and the drag still answer. */
	reducedMotion?: boolean;
	className?: string;
}

export type SkyLanternsCount = NonNullable<SkyLanternsProps["count"]>;

type U = Record<string, { value: unknown }>;
type RGB = [number, number, number];
type Vec3 = [number, number, number];

const TAU = Math.PI * 2;

/** Seconds in one cycle of the rise phase at speed 1. */
const CYCLE = 780;
/** Whole climbs per cycle: the slowest lantern takes 130s, the fastest 60s. */
const LAPS_MIN = 6;
const LAPS_SPAN = 8;
/** Radius of the lake the lanterns rise from, and how high they go. */
const FIELD = 24;
const TOP = 26;

/** Clusters let go by a click. */
const BURSTS = 4;
const PER_BURST = 14;
const BURST_LIFE = 32;

const TARGET_Y = 4.5;
const DIST = 16;
const ELEV_MIN = -0.2;
const ELEV_MAX = 0.45;
const ELEV_REST = -0.13;
const IDLE_SPIN = 0.035;
const DRAG_PX = 6;
const FOG_K = 0.03;
/** The bearing the wind blows across the lake. */
const WIND_X = 0.82;
const WIND_Z = 0.57;

/** A lantern is hit as a ball this many times its size in radius. */
const BODY = 0.44;
/** The tip of the pointer, in half frame heights. About four pixels. */
const TIP = 0.012;
/** Nearer than this a lantern is an out-of-focus disc and cannot be hit. */
const NEAR = 5;
/** Below this a lantern is too faint to hit, and at nothing it is reset. */
const SOLID = 0.25;
/** What the pointer weighs next to a lantern, which weighs its size squared. */
const HAND_MASS = 1.2;
/** Paper gives: a blow keeps about a third of its bounce. */
const RESTITUTION = 0.35;
/** How much of a glancing blow grips the paper instead of sliding off. */
const FRICTION = 0.3;
/** Air drag: a steady part, and a part that grows with speed. */
const DRAG = 1.4;
const DRAG_FAST = 0.4;
/** The fastest the pointer counts as moving, in world units a second. */
const MAX_HIT = 24;
/** How far a hit carries the lantern away from the eye, next to across. */
const DEPTH_PUSH = 0.3;
/** Spin from a glancing blow, and the swing that rights a lantern after. */
const SPIN = 0.35;
const SWING_STIFFNESS = 30;
const SWING_DAMPING = 2.2;
const SWING_LEAN = 0.05;
/** The lowest a knocked lantern can go before it bounces off the water. */
const WATER = 0.35;

const COUNTS: Record<string, number> = { "150": 150, "300": 300, "600": 600 };

function hexToRgb01(hex: string): RGB {
	const raw = hex.trim().replace(/^#/, "");
	const full =
		raw.length === 3
			? raw
					.split("")
					.map((c) => c + c)
					.join("")
			: raw;
	if (!/^[0-9a-f]{6}$/i.test(full)) return [1, 1, 1];
	const n = parseInt(full, 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function mixRgb(a: RGB, b: RGB, k: number): RGB {
	return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function clamp(v: number, lo: number, hi: number): number {
	return v < lo ? lo : v > hi ? hi : v;
}

/** The GLSL one, so the path worked out here matches the shader's. */
function smoothstep(a: number, b: number, x: number): number {
	const t = clamp((x - a) / (b - a), 0, 1);
	return t * t * (3 - 2 * t);
}

/** Deterministic PRNG: the same count always gives the same sky. */
function mulberry32(seed: number) {
	let a = seed | 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Per-lantern data. `home` is x, z, size and climbs per cycle; `seed` is
 * three phases and the click cluster the lantern belongs to, or -1.
 */
function buildLanterns(count: number) {
	const total = count + BURSTS * PER_BURST;
	const home = new Float32Array(total * 4);
	const seed = new Float32Array(total * 4);
	const rand = mulberry32(0x1a27 + count);
	for (let i = 0; i < count; i++) {
		const j = i * 4;
		const a = rand() * TAU;
		// Denser toward the middle, with a thin scatter out to the edge.
		const r = FIELD * Math.pow(rand(), 0.75);
		home[j] = Math.cos(a) * r;
		home[j + 1] = Math.sin(a) * r;
		home[j + 2] = 0.6 + rand() * 0.4;
		home[j + 3] = LAPS_MIN + Math.floor(rand() * LAPS_SPAN);
		seed[j] = rand();
		seed[j + 1] = rand();
		seed[j + 2] = rand();
		seed[j + 3] = -1;
	}
	for (let b = 0; b < BURSTS; b++) {
		for (let k = 0; k < PER_BURST; k++) {
			const j = (count + b * PER_BURST + k) * 4;
			const a = rand() * TAU;
			const r = 1.8 * Math.sqrt(rand());
			home[j] = Math.cos(a) * r;
			home[j + 1] = Math.sin(a) * r;
			home[j + 2] = 0.6 + rand() * 0.35;
			home[j + 3] = 0;
			seed[j] = rand();
			seed[j + 1] = rand();
			seed[j + 2] = rand();
			seed[j + 3] = b;
		}
	}
	return { home, seed };
}

const HASH = `
vec2 hash22(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}
`;

const SKY_VERT = `#version 300 es
in vec2 position;
out vec2 vNdc;
void main() {
  vNdc = position;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const SKY_FRAG = `#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uCamPos;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform float uTanHalf;
uniform float uAspect;
uniform vec2 uShift;
uniform vec3 uSky;
uniform vec3 uWater;
uniform vec3 uLantern;
uniform vec3 uHorizon;
uniform float uTwinkle;
uniform float uRipA;
uniform float uRipB;
uniform float uHaze;
uniform float uReflect;
uniform float uFogK;
out vec4 fragColor;
${HASH}

// Whole-number frequencies only, so the ridge meets itself where the angle wraps.
float ridge(float a, float s) {
  return 0.034 * s
    + 0.022 * s * sin(a * 3.0 + 1.0 + s)
    + 0.016 * s * sin(a * 7.0 + 2.3 * s)
    + 0.009 * sin(a * 13.0 + 0.7)
    + 0.005 * sin(a * 29.0 + s * 4.0);
}

float stars(vec3 d) {
  vec2 uv = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0))) * 58.0;
  vec2 id = floor(uv);
  vec2 f = fract(uv) - 0.5;
  vec2 h = hash22(id);
  vec2 off = (hash22(id + 17.0) - 0.5) * 0.6;
  vec2 q = f - off;
  float tw = 0.72 + 0.28 * sin(uTwinkle * (1.0 + floor(h.y * 3.0)) + h.y * 40.0);
  return step(0.86, h.x) * tw * (1.0 - smoothstep(0.0, 0.012, dot(q, q))) * (0.3 + 0.7 * h.y);
}

vec3 sky(vec3 d) {
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uSky, pow(h, 0.42));
  // The lantern light the mist holds, low in the sky.
  col += uLantern * (0.05 + 0.1 * uHaze) * exp(-h * 7.0);
  col += vec3(0.82, 0.86, 1.0) * stars(d) * smoothstep(0.03, 0.22, h) * (1.0 - 0.5 * uHaze);
  float a = atan(d.z, d.x);
  float el = d.y / max(length(d.xz), 1e-4);
  float far = smoothstep(0.0, 0.004, ridge(a, 1.0) - el);
  float near = smoothstep(0.0, 0.004, ridge(a + 2.1, 0.62) - el);
  col = mix(col, mix(uHorizon, uSky, 0.55) * 0.72, far);
  col = mix(col, uSky * 0.5, near);
  return col;
}

void main() {
  vec2 ndc = vNdc - uShift;
  vec3 dir = normalize(uFwd + uRight * ndc.x * uAspect * uTanHalf + uUp * ndc.y * uTanHalf);
  vec3 col;
  if (dir.y >= 0.0) {
    col = sky(dir);
  } else {
    float t = -uCamPos.y / dir.y;
    vec2 w = uCamPos.xz + dir.xz * t;
    // Ripples get shallower with distance, or the far water turns to noise.
    float amp = 0.07 / (1.0 + t * 0.07);
    vec2 n = vec2(
      sin(w.x * 1.7 + uRipA) * cos(w.y * 1.3 - uRipB),
      cos(w.x * 1.1 - uRipB) * sin(w.y * 2.1 + uRipA * 2.0)
    ) * amp;
    n += vec2(sin(w.x * 5.3 + w.y * 2.0 + uRipA * 3.0), cos(w.y * 4.7 - w.x * 1.6 + uRipB * 2.0)) * amp * 0.35;
    vec3 r = normalize(vec3(dir.x + n.x, -dir.y + abs(n.x + n.y) * 0.25, dir.z + n.y));
    float fresnel = 0.22 + 0.78 * pow(1.0 - clamp(-dir.y, 0.0, 1.0), 4.0);
    col = mix(uWater, sky(r), fresnel * (0.3 + 0.7 * uReflect));
    // The pool of light under the middle of the cloud.
    col += uLantern * 0.05 * (0.4 + uReflect) * exp(-dot(w, w) / 260.0);
    col = mix(uHorizon, col, exp(-t * uFogK * 0.7));
  }
  // A grain of noise under the 8-bit step, so the night sky does not band.
  float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  col += (grain - 0.5) / 255.0;
  fragColor = vec4(col, 1.0);
}
`;

const LANTERN_VERT = `#version 300 es
precision highp float;
in vec2 position;
in vec4 aHome;
in vec4 aSeed;
in vec4 aKick;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 uRight;
uniform float uDrift;
uniform float uSway;
uniform float uFlick;
uniform float uRipA;
uniform vec3 uWind;
uniform vec4 uBursts[${BURSTS}];
uniform float uPass;
uniform float uFogK;
uniform float uFlicker;
out vec2 vUv;
out float vFade;
out float vHeat;
out float vFog;
out float vLift;

const float TAU = 6.28318530718;

void main() {
  float burst = aSeed.w;
  vec3 p;
  float fade;
  if (burst < 0.0) {
    float t = fract(aSeed.x + uDrift * aHome.w);
    float lean = t * 7.0 * uWind.z;
    float meander = sin(t * TAU * 3.0 + aSeed.y * TAU) * 0.7;
    p = vec3(
      aHome.x + uWind.x * lean - uWind.y * meander,
      0.4 + t * ${TOP.toFixed(1)},
      aHome.y + uWind.y * lean + uWind.x * meander
    );
    fade = smoothstep(0.0, 0.03, t) * (1.0 - smoothstep(0.82, 1.0, t));
  } else {
    vec4 b = uBursts[int(burst)];
    // Each lantern in a cluster lets go a little after the last.
    float mine = b.z - aSeed.x * 2.5;
    float up = max(mine, 0.0);
    float speed = 0.5 + 0.4 * aSeed.y;
    float climbed = speed * (up - 1.5 * (1.0 - exp(-up / 1.5)));
    float spread = 0.3 + 0.7 * smoothstep(0.0, 9.0, up);
    float lean = climbed * 0.27 * uWind.z;
    p = vec3(
      b.x + aHome.x * spread + uWind.x * lean,
      0.35 + climbed,
      b.y + aHome.y * spread + uWind.y * lean
    );
    fade = b.w * smoothstep(0.0, 0.7, mine) * (1.0 - smoothstep(${(BURST_LIFE - 9).toFixed(1)}, ${BURST_LIFE.toFixed(1)}, b.z));
  }

  // Where the pointer has knocked it to since it left the water.
  p += aKick.xyz;
  p.y = max(p.y, 0.3);
  vLift = p.y;

  // A lantern close to the lens goes out of focus: the paper fades and its
  // glow swells into a soft disc, instead of a hard box filling the frame.
  float depth = -(viewMatrix * vec4(p, 1.0)).z;
  float sharp = smoothstep(5.0, 6.6, depth);

  float size = aHome.z;
  vec2 q = position;
  vec2 local;
  if (uPass < 0.5) {
    local = q * vec2(0.36, 0.5) * size;
    fade *= sharp;
  } else if (uPass < 1.5) {
    q *= 3.4;
    local = q * vec2(0.36, 0.5) * size * (1.0 + (1.0 - sharp) * 0.9);
    fade *= smoothstep(0.8, 2.6, depth) * mix(0.45, 1.0, sharp);
  } else {
    // Under the water: mirrored, stretched down, and sheared by the ripples.
    q *= 2.6;
    local = q * vec2(0.36, 0.5) * size * vec2(1.0, 2.2);
    p.y = -p.y;
    local.x += sin(q.y * 2.4 + uRipA * 3.0 + aSeed.z * TAU) * 0.16 * size;
    fade *= smoothstep(1.5, 5.0, depth);
  }
  vUv = q;

  float a = 0.14 * sin(uSway * (1.0 + floor(aSeed.y * 3.0)) + aSeed.y * TAU) + aKick.w;
  if (uPass > 1.5) a = 0.0;
  vec2 r = vec2(local.x * cos(a) - local.y * sin(a), local.x * sin(a) + local.y * cos(a));
  vec4 view = viewMatrix * vec4(p + uRight * r.x + vec3(0.0, r.y, 0.0), 1.0);
  // The glow sits a little behind its own shell, along the line of sight.
  // In the same plane the two fight for depth and the shell comes out striped.
  if (uPass > 0.5 && uPass < 1.5) view.xyz += normalize(view.xyz) * 0.6;
  gl_Position = projectionMatrix * view;

  vFog = exp(-depth * uFogK);
  vFade = fade;
  float f = 0.6 * sin(uFlick * (2.0 + floor(aSeed.z * 4.0)) + aSeed.z * TAU)
          + 0.4 * sin(uFlick * (5.0 + floor(aSeed.y * 5.0)) + aSeed.x * TAU);
  vHeat = 1.0 + uFlicker * 0.4 * f;
  if (vFade <= 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const LANTERN_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
in float vFade;
in float vHeat;
in float vFog;
in float vLift;
uniform float uPass;
uniform vec3 uLantern;
uniform vec3 uGlow;
uniform float uHalo;
uniform float uReflect;
out vec4 fragColor;

// Distance to the paper shell: a rounded box, narrower at the mouth.
float shell(vec2 uv) {
  float widen = mix(0.74, 1.0, smoothstep(-1.0, 0.7, uv.y));
  vec2 q = vec2(uv.x / widen, uv.y);
  vec2 d = abs(q) - vec2(0.66);
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 0.34;
}

void main() {
  if (uPass < 0.5) {
    float sd = shell(vUv);
    float aa = fwidth(sd);
    float alpha = 1.0 - smoothstep(-aa, aa, sd);
    if (alpha < 0.02) discard;
    // The flame sits in the mouth and lights the paper from inside.
    vec2 f = (vUv - vec2(0.0, -0.72)) * vec2(1.3, 0.9);
    float core = exp(-dot(f, f) * 1.1);
    float side = 1.0 - 0.42 * vUv.x * vUv.x;
    float ribs = 1.0 - 0.07 * pow(abs(sin(vUv.x * 7.0)), 6.0);
    vec3 col = mix(uLantern * (0.6 + 0.5 * core) * side * ribs, uGlow, core * 0.8) * vHeat;
    col *= 1.0 - 0.2 * smoothstep(0.45, 1.0, vUv.y);
    // The wire ring that holds the mouth open.
    col *= 1.0 - 0.4 * smoothstep(0.88, 0.97, -vUv.y);
    // A light does not fog to the horizon color. It dims.
    col *= 0.3 + 0.7 * vFog;
    fragColor = vec4(col, alpha * vFade);
  } else if (uPass < 1.5) {
    vec2 g = vUv * vec2(1.0, 0.8);
    // Falls to nothing before the edge of the quad, so the quad never shows.
    float edge = 1.0 - smoothstep(0.7, 1.0, max(abs(vUv.x), abs(vUv.y)) / 3.4);
    float halo = exp(-dot(g, g) * 0.55) * edge;
    vec3 col = mix(uLantern, uGlow, 0.35) * halo * 0.4 * uHalo * vHeat * vFade * (0.3 + 0.7 * vFog);
    fragColor = vec4(col, 0.0);
  } else {
    vec2 g = vUv * vec2(1.0, 0.5);
    float edge = 1.0 - smoothstep(0.7, 1.0, max(abs(vUv.x), abs(vUv.y)) / 2.6);
    float smear = exp(-dot(g, g) * 0.9) * edge;
    // High lanterns reflect weaker: more ripples lie between them and the eye.
    vec3 col = mix(uLantern, uGlow, 0.2) * smear * 0.5 * uReflect * vHeat * vFade * vFog * exp(-vLift * 0.07);
    fragColor = vec4(col, 0.0);
  }
}
`;

const SkyLanterns = memo(
	({
		title,
		subtitle,
		ctaLabel,
		onCtaClick,
		count = "300",
		lanternColor = "#ff8a3c",
		glowColor = "#ffd9a0",
		skyColor = "#070a1c",
		waterColor = "#080d20",
		rise = 1,
		flicker = 0.5,
		wind = 0.6,
		haze = 0.4,
		reflection = 0.6,
		autoRotate = true,
		parallax = true,
		paused = false,
		reducedMotion = false,
		className,
	}: SkyLanternsProps) => {
		const containerRef = useRef<HTMLDivElement>(null);
		const drawRef = useRef<((dt: number) => void | false) | null>(null);
		const measureRef = useRef<((m: Metrics) => void) | null>(null);
		const rebuildRef = useRef<((next: SkyLanternsCount) => void) | null>(null);
		const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(null);
		// Orbit, hover and press live in refs written by the handlers and read by
		// the loop. React state here would re-render on every pointer tick.
		const orbit = useRef({
			yaw: 0.5,
			elev: ELEV_REST,
			vYaw: 0,
			vElev: 0,
			dragging: false,
			lastX: 0,
			lastY: 0,
			lastT: 0,
		});
		const hover = useRef({ inside: false, nx: 0, ny: 0, leanX: 0, leanY: 0 });
		const press = useRef({
			down: false,
			moved: false,
			pointerId: -1,
			startX: 0,
			startY: 0,
			nx: 0,
			ny: 0,
			tap: null as null | { nx: number; ny: number },
		});
		const [fallback, setFallback] = useState(false);
		const [entered, setEntered] = useState(false);
		const pausedRef = useRef(paused);
		pausedRef.current = paused;

		useEffect(() => setEntered(true), []);

		const loop = useAnimationLoop({
			target: containerRef,
			halted: paused,
			dpr: "auto",
			onResize: (m) => measureRef.current?.(m),
			onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
			gl: () => glRef.current,
		});

		const live = useRef({
			lanternColor, glowColor, skyColor, waterColor, rise, flicker, wind, haze,
			reflection, autoRotate, parallax, reducedMotion,
		});
		live.current = {
			lanternColor, glowColor, skyColor, waterColor, rise, flicker, wind, haze,
			reflection, autoRotate, parallax, reducedMotion,
		};

		useEffect(() => {
			const container = containerRef.current;
			if (fallback || !container) return;

			let renderer: Renderer;
			try {
				renderer = new Renderer({
					webgl: 2,
					// Alpha to coverage on the shells needs a multisampled buffer.
					antialias: true,
					alpha: false,
					powerPreference: "high-performance",
					dpr: Math.min(window.devicePixelRatio || 1, 2),
				});
				if (!renderer.isWebgl2) {
					// The shaders are GLSL 3.00; a WebGL1 context cannot run them.
					renderer.gl.getExtension("WEBGL_lose_context")?.loseContext();
					throw new Error("SkyLanterns needs WebGL2");
				}
			} catch {
				setFallback(true);
				return;
			}
			const glc = renderer.gl;

			const skyProgram = new Program(glc, {
				vertex: SKY_VERT,
				fragment: SKY_FRAG,
				cullFace: false,
				depthTest: false,
				depthWrite: false,
				uniforms: {
					uCamPos: { value: new Float32Array(3) },
					uRight: { value: new Float32Array([1, 0, 0]) },
					uUp: { value: new Float32Array([0, 1, 0]) },
					uFwd: { value: new Float32Array([0, 0, -1]) },
					uTanHalf: { value: 0.4 },
					uAspect: { value: 1 },
					uShift: { value: new Float32Array(2) },
					uSky: { value: new Float32Array(3) },
					uWater: { value: new Float32Array(3) },
					uLantern: { value: new Float32Array(3) },
					uHorizon: { value: new Float32Array(3) },
					uTwinkle: { value: 0 },
					uRipA: { value: 0 },
					uRipB: { value: 0 },
					uHaze: { value: 0.4 },
					uReflect: { value: 0.6 },
					uFogK: { value: FOG_K },
				},
			});

			// One set of values for all three lantern passes: the programs differ
			// only in `uPass` and in their GL state.
			const shared: U = {
				uRight: { value: new Float32Array([1, 0, 0]) },
				uDrift: { value: 0 },
				uSway: { value: 0 },
				uFlick: { value: 0 },
				uRipA: { value: 0 },
				uWind: { value: new Float32Array(3) },
				// ogl drops a typed array on an array uniform; it must be plain.
				uBursts: { value: new Array<number>(BURSTS * 4).fill(0) },
				uFogK: { value: FOG_K },
				uFlicker: { value: 0.5 },
				uLantern: { value: new Float32Array(3) },
				uGlow: { value: new Float32Array(3) },
				uHalo: { value: 1 },
				uReflect: { value: 0.6 },
			};
			const shellProgram = new Program(glc, {
				vertex: LANTERN_VERT,
				fragment: LANTERN_FRAG,
				cullFace: false,
				uniforms: { ...shared, uPass: { value: 0 } },
			});
			const haloProgram = new Program(glc, {
				vertex: LANTERN_VERT,
				fragment: LANTERN_FRAG,
				cullFace: false,
				transparent: true,
				depthWrite: false,
				uniforms: { ...shared, uPass: { value: 1 } },
			});
			const mirrorProgram = new Program(glc, {
				vertex: LANTERN_VERT,
				fragment: LANTERN_FRAG,
				cullFace: false,
				transparent: true,
				depthWrite: false,
				uniforms: { ...shared, uPass: { value: 2 } },
			});
			// Light only adds: a glow can brighten what is behind it, never stain it.
			haloProgram.setBlendFunc(glc.ONE, glc.ONE);
			mirrorProgram.setBlendFunc(glc.ONE, glc.ONE);

			const programs = [skyProgram, shellProgram, haloProgram, mirrorProgram];
			// ogl only logs a failed link. A broken program would draw nothing on
			// a black canvas, so a failed link goes to the poster instead.
			if (!programs.every((p) => glc.getProgramParameter(p.program, glc.LINK_STATUS))) {
				programs.forEach((p) => p.remove());
				glc.getExtension("WEBGL_lose_context")?.loseContext();
				setFallback(true);
				return;
			}
			glRef.current = glc;

			const canvas = glc.canvas;
			canvas.style.display = "block";
			canvas.style.position = "absolute";
			canvas.style.top = "0";
			canvas.style.left = "0";
			container.appendChild(canvas);

			const camera = new Camera(glc, { fov: 44, near: 0.1, far: 160 });
			const scene = new Transform();

			const sky = new Mesh(glc, {
				geometry: new Triangle(glc),
				program: skyProgram,
				renderOrder: -1,
				frustumCulled: false,
			});
			sky.setParent(scene);

			// Fresh attribute objects every time: ogl writes the GL buffer onto the
			// object it is given, so sharing one between two geometries would let
			// the old one's remove() delete the new one's buffer.
			//
			// `kick` is the one buffer that changes: the offset from the path and
			// the tilt, per lantern. `vel` is its rate of change, `pos` is this
			// frame's place in the world, and `awake` marks the ones still moving.
			const makeLanterns = (n: number) => {
				const data = buildLanterns(n);
				const total = data.home.length / 4;
				const kick = new Float32Array(total * 4);
				const geometry = new Geometry(glc, {
					position: { size: 2, data: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]) },
					index: { data: new Uint16Array([0, 1, 2, 0, 2, 3]) },
					aHome: { size: 4, data: data.home, instanced: 1 },
					aSeed: { size: 4, data: data.seed, instanced: 1 },
					aKick: { size: 4, data: kick, instanced: 1, usage: glc.DYNAMIC_DRAW },
				});
				return {
					geometry,
					total,
					home: data.home,
					seed: data.seed,
					kick,
					vel: new Float32Array(total * 4),
					pos: new Float32Array(total * 4),
					awake: new Uint8Array(total),
				};
			};
			let built = count;
			let flock = makeLanterns(COUNTS[built] ?? 300);

			const shells = new Mesh(glc, {
				geometry: flock.geometry,
				program: shellProgram,
				frustumCulled: false,
			});
			shells.onBeforeRender(() => glc.enable(glc.SAMPLE_ALPHA_TO_COVERAGE));
			shells.onAfterRender(() => glc.disable(glc.SAMPLE_ALPHA_TO_COVERAGE));
			shells.setParent(scene);
			const mirror = new Mesh(glc, {
				geometry: flock.geometry,
				program: mirrorProgram,
				renderOrder: 1,
				frustumCulled: false,
			});
			mirror.setParent(scene);
			const halos = new Mesh(glc, {
				geometry: flock.geometry,
				program: haloProgram,
				renderOrder: 2,
				frustumCulled: false,
			});
			halos.setParent(scene);

			// The count swaps the instance buffers only. The renderer, the context
			// and every program survive, so the change lands on the next frame.
			rebuildRef.current = (next) => {
				if (next === built) return;
				built = next;
				const old = flock;
				flock = makeLanterns(COUNTS[next] ?? 300);
				shells.geometry = flock.geometry;
				mirror.geometry = flock.geometry;
				halos.geometry = flock.geometry;
				old.geometry.remove();
			};

			const su = skyProgram.uniforms as U;
			const vec = (u: U, key: string) => u[key].value as Float32Array;
			const num = (u: U, key: string, v: number) => {
				(u[key] as { value: number }).value = v;
			};
			const burstUniform = shared.uBursts.value as number[];

			// Wrapped phases. Each one is bounded, so nothing drifts in float32.
			let drift = 0;
			let sway = 0;
			let flick = 0;
			let ripA = 0;
			let ripB = 0;
			let twinkle = 0;

			// Projection state, written by measure and shared with the ray caster.
			let aspect = 1;
			let tanHalf = Math.tan((44 * Math.PI) / 360);
			const shift: [number, number] = [0, 0];

			// This frame's camera, kept for the pointer rays.
			const eye = [0, 2, DIST];
			const right = [1, 0, 0];
			const up = [0, 1, 0];
			const fwd = [0, 0, -1];

			const bursts = Array.from({ length: BURSTS }, () => ({ x: 0, z: 0, age: 0, s: 0 }));

			// A ray through a point of the frame, with the exact projection the
			// scene renders with (basis, aspect, field of view, lens shift).
			const rayAt = (nx: number, ny: number): Vec3 => {
				const dx = (nx - shift[0]) * aspect * tanHalf;
				const dy = (ny - shift[1]) * tanHalf;
				const rx = fwd[0] + right[0] * dx + up[0] * dy;
				const ry = fwd[1] + right[1] * dx + up[1] * dy;
				const rz = fwd[2] + right[2] * dx + up[2] * dy;
				const len = Math.hypot(rx, ry, rz) || 1;
				return [rx / len, ry / len, rz / len];
			};

			// Where the pointer was on the last frame, for the sweep.
			let tipX = 0;
			let tipY = 0;
			let tipLive = false;
			// Lanterns still moving. The reduced-motion halt waits for zero.
			let moving = 0;
			// This frame's hits, nine numbers each: lantern, depth, the point of
			// contact, the normal there, the middle of the disc and its radius.
			const hits: number[] = [];

			const simulate = (step: number, dt: number, windAmt: number, calm: boolean, hitting: boolean) => {
				const { total, home, seed, kick, vel, pos, awake } = flock;
				const hv = hover.current;
				let dirty = false;

				// 1. Every lantern's place this frame: the shader's path, plus
				// its own offset. One that has faded out goes back on its path.
				for (let i = 0; i < total; i++) {
					const j = i * 4;
					const cluster = seed[j + 3];
					let x: number;
					let y: number;
					let z: number;
					let fade: number;
					if (cluster < 0) {
						const raw = seed[j] + drift * home[j + 3];
						const t = raw - Math.floor(raw);
						const lean = t * 7 * windAmt;
						const meander = Math.sin(t * TAU * 3 + seed[j + 1] * TAU) * 0.7;
						x = home[j] + WIND_X * lean - WIND_Z * meander;
						y = 0.4 + t * TOP;
						z = home[j + 1] + WIND_Z * lean + WIND_X * meander;
						fade = smoothstep(0, 0.03, t) * (1 - smoothstep(0.82, 1, t));
					} else {
						const b = bursts[cluster];
						const mine = b.age - seed[j] * 2.5;
						const risen = Math.max(mine, 0);
						const climbed = (0.5 + 0.4 * seed[j + 1]) * (risen - 1.5 * (1 - Math.exp(-risen / 1.5)));
						const spread = 0.3 + 0.7 * smoothstep(0, 9, risen);
						const lean = climbed * 0.27 * windAmt;
						x = b.x + home[j] * spread + WIND_X * lean;
						y = 0.35 + climbed;
						z = b.z + home[j + 1] * spread + WIND_Z * lean;
						fade = b.s * smoothstep(0, 0.7, mine) * (1 - smoothstep(BURST_LIFE - 9, BURST_LIFE, b.age));
					}
					if (fade < 0.02 && (awake[i] || kick[j] !== 0 || kick[j + 1] !== 0 || kick[j + 2] !== 0)) {
						kick.fill(0, j, j + 4);
						vel.fill(0, j, j + 4);
						awake[i] = 0;
						dirty = true;
					}
					pos[j] = x + kick[j];
					pos[j + 1] = y + kick[j + 1];
					pos[j + 2] = z + kick[j + 2];
					pos[j + 3] = fade;
				}

				// 2. The pointer. Its travel since the last frame is a segment on
				// the screen, and each lantern is a disc there, so a fast pointer
				// cannot step over one between two frames. The first frame after
				// a halt has no elapsed time to take a speed from.
				if (!hitting) {
					tipLive = false;
				} else if (!tipLive || dt <= 0) {
					tipLive = true;
					tipX = hv.nx;
					tipY = hv.ny;
				} else {
					// Screen units: half frame heights, measured from the lens axis.
					const ax = (tipX - shift[0]) * aspect;
					const ay = tipY - shift[1];
					const mx = (hv.nx - shift[0]) * aspect - ax;
					const my = hv.ny - shift[1] - ay;
					const len2 = mx * mx + my * my;
					tipX = hv.nx;
					tipY = hv.ny;
					hits.length = 0;
					if (len2 > 1e-9) {
						for (let i = 0; i < total; i++) {
							const j = i * 4;
							if (pos[j + 3] < SOLID) continue;
							const rx = pos[j] - eye[0];
							const ry = pos[j + 1] - eye[1];
							const rz = pos[j + 2] - eye[2];
							const depth = rx * fwd[0] + ry * fwd[1] + rz * fwd[2];
							if (depth < NEAR) continue;
							const inv = 1 / (depth * tanHalf);
							const cx = (rx * right[0] + ry * right[1] + rz * right[2]) * inv;
							const cy = (rx * up[0] + ry * up[1] + rz * up[2]) * inv;
							const radius = BODY * home[j + 2] * inv + TIP;
							// Where the segment first meets the disc. A pointer that
							// began the frame inside is in contact where it stands.
							const fx = ax - cx;
							const fy = ay - cy;
							const c = fx * fx + fy * fy - radius * radius;
							let t = 0;
							if (c > 0) {
								const b = fx * mx + fy * my;
								if (b >= 0) continue;
								const disc = b * b - len2 * c;
								if (disc < 0) continue;
								t = (-b - Math.sqrt(disc)) / len2;
								if (t > 1) continue;
							}
							const ex = ax + mx * t;
							const ey = ay + my * t;
							let nx = cx - ex;
							let ny = cy - ey;
							let nl = Math.hypot(nx, ny);
							if (nl < 1e-6) {
								nx = mx;
								ny = my;
								nl = Math.sqrt(len2);
							}
							hits.push(i, depth, ex, ey, nx / nl, ny / nl, cx, cy, radius);
						}
					}
					const rate = 1 / Math.max(dt, 1 / 120);
					for (let h = 0; h < hits.length; h += 9) {
						const depth = hits[h + 1];
						const ex = hits[h + 2];
						const ey = hits[h + 3];
						// The pointer touches what is in front. A lantern whose
						// point of contact is behind a nearer one is left alone.
						let covered = false;
						for (let g = 0; g < hits.length && !covered; g += 9) {
							if (g === h || hits[g + 1] >= depth) continue;
							const dx = ex - hits[g + 6];
							const dy = ey - hits[g + 7];
							covered = dx * dx + dy * dy < hits[g + 8] * hits[g + 8];
						}
						if (covered) continue;

						const i = hits[h];
						const j = i * 4;
						const nx = hits[h + 4];
						const ny = hits[h + 5];
						// The pointer's speed in the world at this lantern's depth.
						const scale = depth * tanHalf * rate;
						let pr = mx * scale;
						let pu = my * scale;
						const speed = Math.hypot(pr, pu);
						if (speed > MAX_HIT) {
							pr *= MAX_HIT / speed;
							pu *= MAX_HIT / speed;
						}
						// Against the lantern's own speed across the view: only the
						// speed the two are closing at counts.
						const relR = pr - (vel[j] * right[0] + vel[j + 1] * right[1] + vel[j + 2] * right[2]);
						const relU = pu - (vel[j] * up[0] + vel[j + 1] * up[1] + vel[j + 2] * up[2]);
						const closing = relR * nx + relU * ny;
						if (closing <= 0) continue;
						const size = home[j + 2];
						const give = ((1 + RESTITUTION) * HAND_MASS) / (HAND_MASS + size * size);
						const along = closing * give * (calm ? 0.45 : 1);
						// Friction carries some of the sideways speed across too,
						// never more than the blow itself can grip.
						const slide = clamp((-relR * ny + relU * nx) * give, -FRICTION * along, FRICTION * along);
						const dr = along * nx - slide * ny;
						const du = along * ny + slide * nx;
						// A hit also carries the lantern away from the eye a little.
						const rx = pos[j] - eye[0];
						const ry = pos[j + 1] - eye[1];
						const rz = pos[j + 2] - eye[2];
						const away = (DEPTH_PUSH * along) / (Math.hypot(rx, ry, rz) || 1);
						vel[j] += right[0] * dr + up[0] * du + rx * away;
						vel[j + 1] += right[1] * dr + up[1] * du + ry * away;
						vel[j + 2] += right[2] * dr + up[2] * du + rz * away;
						// Only the sideways part turns it: a blow through the middle
						// has no lever.
						if (!calm) vel[j + 3] -= slide * SPIN;
						awake[i] = 1;
					}
				}

				// 3. A moving lantern that runs into another one hands over some
				// of its speed, by their weights.
				for (let i = 0; i < total; i++) {
					if (!awake[i]) continue;
					const j = i * 4;
					if (pos[j + 3] < SOLID) continue;
					if (vel[j] * vel[j] + vel[j + 1] * vel[j + 1] + vel[j + 2] * vel[j + 2] < 0.09) continue;
					const si = home[j + 2];
					for (let o = 0; o < total; o++) {
						const k = o * 4;
						if (o === i || pos[k + 3] < SOLID) continue;
						const dx = pos[j] - pos[k];
						const dy = pos[j + 1] - pos[k + 1];
						const dz = pos[j + 2] - pos[k + 2];
						const reach = BODY * (si + home[k + 2]);
						const d2 = dx * dx + dy * dy + dz * dz;
						if (d2 > reach * reach || d2 < 1e-6) continue;
						const d = Math.sqrt(d2);
						const closing =
							((vel[j] - vel[k]) * dx + (vel[j + 1] - vel[k + 1]) * dy + (vel[j + 2] - vel[k + 2]) * dz) / d;
						if (closing >= 0) continue;
						const mi = si * si;
						const mo = home[k + 2] * home[k + 2];
						const impulse = (-(1 + RESTITUTION) * closing) / (1 / mi + 1 / mo) / d;
						vel[j] += (impulse / mi) * dx;
						vel[j + 1] += (impulse / mi) * dy;
						vel[j + 2] += (impulse / mi) * dz;
						vel[k] -= (impulse / mo) * dx;
						vel[k + 1] -= (impulse / mo) * dy;
						vel[k + 2] -= (impulse / mo) * dz;
						awake[o] = 1;
					}
				}

				// 4. Move the ones that are awake.
				moving = 0;
				for (let i = 0; i < total; i++) {
					if (!awake[i]) continue;
					const j = i * 4;
					const speed = Math.hypot(vel[j], vel[j + 1], vel[j + 2]);
					const keep = Math.exp(-(DRAG + DRAG_FAST * speed) * step);
					vel[j] *= keep;
					vel[j + 1] *= keep;
					vel[j + 2] *= keep;
					const pathY = pos[j + 1] - kick[j + 1];
					kick[j] += vel[j] * step;
					kick[j + 1] += vel[j + 1] * step;
					kick[j + 2] += vel[j + 2] * step;
					if (pathY + kick[j + 1] < WATER) {
						kick[j + 1] = WATER - pathY;
						if (vel[j + 1] < 0) vel[j + 1] *= -RESTITUTION;
					}
					// The swing: the top trails the way the lantern is going, and
					// a loose spring stands it back up with a few wobbles.
					const across = vel[j] * right[0] + vel[j + 1] * right[1] + vel[j + 2] * right[2];
					const lean = calm ? 0 : clamp(across * SWING_LEAN, -0.45, 0.45);
					vel[j + 3] += (SWING_STIFFNESS * (lean - kick[j + 3]) - SWING_DAMPING * vel[j + 3]) * step;
					kick[j + 3] = clamp(kick[j + 3] + vel[j + 3] * step, -0.9, 0.9);
					if (speed * keep < 0.02 && Math.abs(kick[j + 3]) < 0.003 && Math.abs(vel[j + 3]) < 0.02) {
						// At rest it stays where it was knocked to, upright.
						vel.fill(0, j, j + 4);
						kick[j + 3] = 0;
						awake[i] = 0;
					} else {
						moving++;
					}
					dirty = true;
				}

				if (dirty) flock.geometry.attributes.aKick.needsUpdate = true;
			};

			drawRef.current = (dt) => {
				const l = live.current;
				const o = orbit.current;
				const hv = hover.current;
				const pr = press.current;
				const step = Math.min(dt, 1 / 30);
				const frozen = pausedRef.current;
				// Still: nothing climbs, wavers or ripples. Paused freezes the
				// pointer too; reduced motion lets it ease, since it answers the
				// visitor's own hand.
				const still = frozen || l.reducedMotion;
				const ease = frozen ? 0 : step;

				if (!still) {
					drift = (drift + (step * Math.max(0, l.rise)) / CYCLE) % 1;
					sway = (sway + step * 0.6) % TAU;
					flick = (flick + step * 1.7) % TAU;
					ripA = (ripA + step * 0.5) % TAU;
					ripB = (ripB + step * 0.31) % TAU;
					twinkle = (twinkle + step * 0.8) % TAU;
				}

				// Orbit: the fling coasts first, then the idle turn takes over as
				// the coast dies away, so a release hands off instead of fighting.
				if (l.reducedMotion) {
					o.vYaw = 0;
					o.vElev = 0;
				}
				if (!still && !o.dragging) {
					o.yaw += o.vYaw * step;
					o.elev += o.vElev * step;
					const decay = Math.pow(0.92, step * 60);
					o.vYaw *= decay;
					o.vElev *= decay;
					if (l.autoRotate && !pr.down) {
						o.yaw += IDLE_SPIN * step * (1 - Math.min(1, Math.abs(o.vYaw) / 0.06));
					}
					o.yaw %= TAU;
				}
				o.elev = clamp(o.elev, ELEV_MIN, ELEV_MAX);

				// Parallax: a small lean toward the pointer, eased both ways.
				const leaning = l.parallax && hv.inside && !o.dragging;
				const leanK = 1 - Math.exp(-ease * 3.5);
				const leanToX = leaning ? -hv.nx * 0.05 : 0;
				const leanToY = leaning ? -hv.ny * 0.03 : 0;
				hv.leanX += (leanToX - hv.leanX) * leanK;
				hv.leanY += (leanToY - hv.leanY) * leanK;

				const yaw = o.yaw + hv.leanX;
				const elev = clamp(o.elev + hv.leanY, ELEV_MIN, ELEV_MAX);
				const ce = Math.cos(elev);
				eye[0] = DIST * ce * Math.sin(yaw);
				eye[1] = Math.max(0.6, TARGET_Y + DIST * Math.sin(elev));
				eye[2] = DIST * ce * Math.cos(yaw);
				camera.position.set(eye[0], eye[1], eye[2]);
				camera.lookAt([0, TARGET_Y, 0]);
				camera.updateMatrixWorld();
				const m = camera.worldMatrix;
				right[0] = m[0]; right[1] = m[1]; right[2] = m[2];
				up[0] = m[4]; up[1] = m[5]; up[2] = m[6];
				fwd[0] = -m[8]; fwd[1] = -m[9]; fwd[2] = -m[10];

				// A release that never became a drag: a cluster lets go from the
				// water under the pointer, or under the ray where it passes the
				// middle of the lake if it never meets the water.
				if (pr.tap) {
					const tap = pr.tap;
					pr.tap = null;
					if (!l.reducedMotion) {
						const d = rayAt(tap.nx, tap.ny);
						let t = d[1] < -0.02 ? -eye[1] / d[1] : DIST;
						t = Math.min(t, DIST * 2.2);
						let slot = 0;
						for (let i = 1; i < BURSTS; i++) {
							const a = bursts[i];
							const b = bursts[slot];
							if (b.s > 0 && (a.s <= 0 || a.age > b.age)) slot = i;
						}
						const b = bursts[slot];
						b.x = eye[0] + d[0] * t;
						b.z = eye[2] + d[2] * t;
						b.age = 0;
						b.s = 1;
					}
				}
				for (let i = 0; i < BURSTS; i++) {
					const b = bursts[i];
					if (b.s > 0) {
						if (!still) b.age += step * Math.max(0.25, l.rise);
						if (b.age > BURST_LIFE) b.s = 0;
					}
					const j = i * 4;
					burstUniform[j] = b.x;
					burstUniform[j + 1] = b.z;
					burstUniform[j + 2] = b.age;
					burstUniform[j + 3] = b.s;
				}

				const lantern = hexToRgb01(l.lanternColor);
				const glow = hexToRgb01(l.glowColor);
				const skyC = hexToRgb01(l.skyColor);
				const water = hexToRgb01(l.waterColor);
				const hazeAmt = clamp(l.haze, 0, 1);
				// The horizon: the sky lifted, with some of the lantern light the
				// mist holds. The far water fogs toward it, so the two meet.
				const horizon = mixRgb(
					[skyC[0] * 1.9 + 0.012, skyC[1] * 1.9 + 0.014, skyC[2] * 1.9 + 0.02],
					lantern,
					0.05 + 0.13 * hazeAmt,
				);
				const fogK = FOG_K * (0.45 + 1.1 * hazeAmt);
				// Wind blows across the lake at a fixed bearing.
				const windAmt = Math.max(0, l.wind);

				// The pointer only hits while it hovers: a press is a click or an
				// orbit. Paused holds every lantern where it is. Reduced motion
				// still answers the hand, with a softer blow and no swing.
				if (frozen) tipLive = false;
				else simulate(step, dt, windAmt, l.reducedMotion, hv.inside && !pr.down && !o.dragging);

				vec(su, "uCamPos").set(eye);
				vec(su, "uRight").set(right);
				vec(su, "uUp").set(up);
				vec(su, "uFwd").set(fwd);
				vec(su, "uShift").set(shift);
				vec(su, "uSky").set(skyC);
				vec(su, "uWater").set(water);
				vec(su, "uLantern").set(lantern);
				vec(su, "uHorizon").set(horizon);
				num(su, "uTanHalf", tanHalf);
				num(su, "uAspect", aspect);
				num(su, "uTwinkle", twinkle);
				num(su, "uRipA", ripA);
				num(su, "uRipB", ripB);
				num(su, "uHaze", hazeAmt);
				num(su, "uReflect", clamp(l.reflection, 0, 1));
				num(su, "uFogK", fogK);

				vec(shared, "uRight").set(right);
				vec(shared, "uWind").set([WIND_X, WIND_Z, windAmt]);
				vec(shared, "uLantern").set(lantern);
				vec(shared, "uGlow").set(glow);
				num(shared, "uDrift", drift);
				num(shared, "uSway", sway);
				num(shared, "uFlick", flick);
				num(shared, "uRipA", ripA);
				num(shared, "uFogK", fogK);
				num(shared, "uFlicker", clamp(l.flicker, 0, 1));
				num(shared, "uHalo", 0.55 + 1.3 * hazeAmt);
				num(shared, "uReflect", clamp(l.reflection, 0, 1));
				mirror.visible = l.reflection > 0.001;

				glc.clearColor(horizon[0], horizon[1], horizon[2], 1);
				renderer.render({ scene, camera, frustumCull: false });

				// Reduced motion settles to one painted pose, then halts until a
				// hand arrives (every handler restarts the loop).
				if (l.reducedMotion && !frozen) {
					const busy =
						pr.down ||
						o.dragging ||
						moving > 0 ||
						Math.abs(leanToX - hv.leanX) + Math.abs(leanToY - hv.leanY) > 0.0005;
					if (!busy) return false;
				}
			};

			measureRef.current = ({ width, height, dpr }: Metrics) => {
				const w = Math.max(1, Math.floor(width));
				const h = Math.max(1, Math.floor(height));
				renderer.dpr = dpr;
				renderer.setSize(w, h);
				aspect = w / h;
				// Landscape pushes the middle of the cloud to the right of the copy
				// with a lens shift, which moves the picture without turning the
				// camera, so the lanterns stay upright. Portrait widens the lens (a
				// narrow frame otherwise sees a sliver of lake) and lifts the
				// horizon above the copy. Same split as the container query on the
				// copy, so the two never disagree.
				const landscape = aspect >= 1;
				const fov = landscape ? 44 : Math.min(64, 44 + (1 - aspect) * 36);
				tanHalf = Math.tan((fov * Math.PI) / 360);
				shift[0] = landscape ? 0.2 : 0;
				shift[1] = landscape ? 0 : 0.22;
				camera.perspective({ fov, aspect, near: 0.1, far: 160 });
				// An off-axis frustum. ogl rebuilds the matrix in perspective(), so
				// the shift is reapplied after it.
				camera.projectionMatrix[8] = -shift[0];
				camera.projectionMatrix[9] = -shift[1];
				drawRef.current?.(0.016);
			};

			loop.resize();
			loop.start();

			return () => {
				drawRef.current = null;
				measureRef.current = null;
				rebuildRef.current = null;
				flock.geometry.remove();
				sky.geometry.remove();
				programs.forEach((p) => p.remove());
				if (container.contains(canvas)) container.removeChild(canvas);
			};
			// Built once. The count swaps buffers through rebuildRef; every other
			// prop reaches the shaders as a uniform through the live ref.
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [fallback]);

		useEffect(() => {
			rebuildRef.current?.(count);
			loop.paint();
		}, [count, loop]);

		useEffect(() => {
			loop.paint();
		}, [
			lanternColor, glowColor, skyColor, waterColor, rise, flicker, wind, haze,
			reflection, autoRotate, parallax, loop,
		]);

		// Reduced motion halts itself once settled; turning it off restarts.
		useEffect(() => {
			if (!reducedMotion) loop.start();
		}, [reducedMotion, loop]);

		const toNdc = (e: React.PointerEvent<HTMLDivElement>): [number, number] => {
			const r = e.currentTarget.getBoundingClientRect();
			return [
				((e.clientX - r.left) / Math.max(r.width, 1)) * 2 - 1,
				1 - ((e.clientY - r.top) / Math.max(r.height, 1)) * 2,
			];
		};

		const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
			// A press on the button is a click, never an orbit: with capture taken
			// here, the click would land on this element instead.
			if ((e.target as HTMLElement).closest("button, a")) return;
			if (e.pointerType === "mouse" && e.button !== 0) return;
			const [nx, ny] = toNdc(e);
			const hv = hover.current;
			hv.inside = true;
			hv.nx = nx;
			hv.ny = ny;
			const pr = press.current;
			pr.down = true;
			pr.moved = false;
			pr.pointerId = e.pointerId;
			pr.startX = e.clientX;
			pr.startY = e.clientY;
			pr.nx = nx;
			pr.ny = ny;
			const o = orbit.current;
			o.lastX = e.clientX;
			o.lastY = e.clientY;
			o.lastT = e.timeStamp;
			o.vYaw = 0;
			o.vElev = 0;
			e.currentTarget.setPointerCapture(e.pointerId);
			loop.start();
		};

		const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
			const [nx, ny] = toNdc(e);
			const hv = hover.current;
			const pr = press.current;
			const o = orbit.current;
			// A touch only hovers while the finger is down.
			if (e.pointerType === "mouse" || pr.down) {
				hv.inside = true;
				hv.nx = nx;
				hv.ny = ny;
			}
			if (pr.down && e.pointerId === pr.pointerId) {
				pr.nx = nx;
				pr.ny = ny;
				if (!pr.moved && Math.hypot(e.clientX - pr.startX, e.clientY - pr.startY) > DRAG_PX) {
					// Past the slop the press becomes an orbit, starting from this
					// point so the view does not jump.
					pr.moved = true;
					o.dragging = true;
				}
				if (o.dragging) {
					const dx = e.clientX - o.lastX;
					const dy = e.clientY - o.lastY;
					const dt = (e.timeStamp - o.lastT) / 1000;
					// The camera moves, not the lanterns, so the vertical is the
					// opposite of a geometry rotation: drag down raises the eye and
					// the top of the cloud comes toward you.
					const dYaw = -dx * 0.005;
					const dElev = dy * 0.003;
					o.yaw += dYaw;
					o.elev = clamp(o.elev + dElev, ELEV_MIN, ELEV_MAX);
					// Speed from the last segment only: an average over the whole
					// drag would fling a slow, careful release.
					if (dt > 0.001) {
						o.vYaw = dYaw / dt;
						o.vElev = dElev / dt;
					}
				}
				o.lastX = e.clientX;
				o.lastY = e.clientY;
				o.lastT = e.timeStamp;
			}
			loop.start();
		};

		const endPress = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
			const pr = press.current;
			if (e.pointerId !== pr.pointerId) return;
			if (e.currentTarget.hasPointerCapture(e.pointerId)) {
				e.currentTarget.releasePointerCapture(e.pointerId);
			}
			if (!cancelled && pr.down && !pr.moved) pr.tap = { nx: pr.nx, ny: pr.ny };
			pr.down = false;
			pr.moved = false;
			pr.pointerId = -1;
			orbit.current.dragging = false;
			// The finger left the glass, so nothing hovers any more.
			if (e.pointerType !== "mouse") hover.current.inside = false;
			loop.start();
		};

		const onPointerLeave = (e: React.PointerEvent<HTMLDivElement>) => {
			if (press.current.down) return;
			if (e.pointerType === "mouse") hover.current.inside = false;
			loop.start();
		};

		// Copy rises in with a stagger; reduced motion renders the final state
		// at once. Inline styles keep the entrance inside the pasted file.
		const enter = (i: number): React.CSSProperties =>
			reducedMotion
				? {}
				: {
						opacity: entered ? 1 : 0,
						transform: entered ? "none" : "translateY(14px)",
						transition: `opacity 700ms cubic-bezier(0.22,1,0.36,1) ${i * 110}ms, transform 700ms cubic-bezier(0.22,1,0.36,1) ${i * 110}ms`,
					};

		// The button is a lit paper pill: a warm edge on a smoked fill that takes
		// the lantern's color on hover or focus.
		const overlay = (
			<div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-start justify-end bg-[linear-gradient(0deg,rgba(3,4,12,0.72),rgba(3,4,12,0)_58%)] px-[max(20px,5.5cqi)] pb-[max(20px,6cqi)] text-left [@container(orientation:landscape)]:justify-center [@container(orientation:landscape)]:bg-[linear-gradient(90deg,rgba(3,4,12,0.62),rgba(3,4,12,0)_56%)] [@container(orientation:landscape)]:pb-0">
				{title ? (
					<h1
						className="max-w-[max(260px,44cqi)] text-[max(28px,5.4cqi)] leading-[1.02] font-semibold tracking-tight text-white"
						style={enter(0)}
					>
						{title}
					</h1>
				) : null}
				{subtitle ? (
					<p
						className="mt-[max(10px,1.4cqi)] max-w-[max(220px,38cqi)] text-[max(12px,1.7cqi)] leading-snug text-white/70"
						style={enter(1)}
					>
						{subtitle}
					</p>
				) : null}
				{ctaLabel ? (
					<style>{`.__sg_sl_cta { transition: border-color 420ms ease, box-shadow 420ms ease, background-color 420ms ease, color 420ms ease; }
.__sg_sl_cta:hover, .__sg_sl_cta:focus-visible { border-color: var(--sky-lanterns-glow); background-color: color-mix(in srgb, var(--sky-lanterns-paper) 26%, rgba(8,7,18,0.5)); box-shadow: 0 0 30px -8px var(--sky-lanterns-paper), inset 0 -10px 18px -12px var(--sky-lanterns-glow); }`}</style>
				) : null}
				{ctaLabel ? (
					<div className="mt-[max(18px,2.6cqi)]" style={enter(2)}>
						<button
							type="button"
							onClick={onCtaClick}
							className="__sg_sl_cta pointer-events-auto cursor-pointer rounded-full border border-(--sky-lanterns-edge) bg-[rgba(8,7,18,0.4)] px-[max(26px,3.3cqi)] py-[max(10px,1.25cqi)] text-[max(11px,1.25cqi)] font-medium tracking-[0.22em] text-white uppercase shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-[3px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70"
							style={{
								["--sky-lanterns-edge" as string]: `color-mix(in srgb, ${glowColor} 55%, transparent)`,
								["--sky-lanterns-glow" as string]: glowColor,
								["--sky-lanterns-paper" as string]: lanternColor,
							}}
						>
							{ctaLabel}
						</button>
					</div>
				) : null}
			</div>
		);

		const rootClass = [
			"relative h-full w-full cursor-default overflow-hidden select-none @container-size [&_canvas]:touch-none",
			className,
		]
			.filter(Boolean)
			.join(" ");

		if (fallback) {
			// The poster: night falling to a warm horizon, the lake under it, and
			// a few lights hung in the sky.
			return (
				<div
					className={rootClass}
					style={{
						backgroundColor: skyColor,
						backgroundImage: `radial-gradient(circle at 70% 30%, ${glowColor} 0%, color-mix(in srgb, ${lanternColor} 55%, transparent) 0.9%, transparent 3%), radial-gradient(circle at 58% 44%, ${glowColor} 0%, color-mix(in srgb, ${lanternColor} 55%, transparent) 0.7%, transparent 2.4%), radial-gradient(circle at 82% 18%, ${glowColor} 0%, color-mix(in srgb, ${lanternColor} 55%, transparent) 0.5%, transparent 1.8%), radial-gradient(circle at 64% 14%, ${glowColor} 0%, color-mix(in srgb, ${lanternColor} 55%, transparent) 0.4%, transparent 1.5%), linear-gradient(180deg, ${skyColor} 0%, color-mix(in srgb, ${skyColor} 78%, ${lanternColor}) 62%, color-mix(in srgb, ${waterColor} 80%, ${lanternColor}) 66%, ${waterColor} 100%)`,
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
				// select-none because the drag surface holds text: a drag across the
				// copy would select it, and the next press would start a native
				// drag-and-drop instead of an orbit.
				className={rootClass}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={(e) => endPress(e, false)}
				onPointerCancel={(e) => endPress(e, true)}
				onPointerLeave={onPointerLeave}
			>
				{overlay}
			</div>
		);
	},
);

SkyLanterns.displayName = "SkyLanterns";

export default SkyLanterns;
