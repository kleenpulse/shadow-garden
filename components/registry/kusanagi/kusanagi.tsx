"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Camera, Geometry, Mesh, Program, Renderer, Transform, Triangle } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A long sword planted in a field of tall grass on an overcast, foggy day, with
// an editorial frame and a wide serif title laid over it. Three draw calls: one
// fullscreen pass for the sky and the analytic ground, one instanced mesh for
// every blade of grass, one small mesh for the sword.
//
// The field is infinite but holds a fixed number of blades. Each blade owns an
// offset inside a square tile, and the vertex shader places it at the periodic
// image of that offset nearest a region centre that rides ahead of the camera.
// A blade only jumps by one tile width, at the tile edge, which sits behind
// the camera or deep in the fog, and the last metres of the tile shrink to
// nothing so a wrap never pops.
//
// Fog is analytic and shared by all three passes (fogAt): distance fog that
// only starts behind the sword, so the subject stays clear, plus a layer that
// pools near the ground far away. Everything fogs toward one mist() colour, so
// the far field has no edge.
//
// The sword sits at the world origin and its vertices are baked in world
// space. The grass knows where it is: blades lean out of a trampled clearing
// around it so the lower blade is not buried. A click sends a cut out from the
// sword: each cut is a sector (direction, reach, age), the front travels
// outward at CUT_SPEED, and a blade the front has passed is clipped to a
// stubble height, then grows back. The clip shortens the spine parameter, not
// the blade's scale, so a cut blade ends blunt instead of shrinking.
//
// The light is anchored to the camera's yaw (a world-fixed sun would swing
// behind the viewer for half of every orbit), so the field is always softly
// backlit. The wind stays world-fixed, so turning the view changes how the
// gusts cross the frame.
//
// The CAMERA orbits (eye on a sphere around a point on the sword), so drag
// down raises the eye and the top of the sword comes toward the viewer.
//
// The call-to-action draws the sword: it slides up out of the ground along its
// own axis, a band of light runs down the steel, the four cut slots fire as one
// ring so the whole field is mown at once, and then the sword drops back in.
export interface KusanagiProps {
	/** Headline, set in wide capitals in the system serif. An empty string removes it. */
	title?: string;
	/** Supporting line under the headline. An empty string removes it. */
	subtitle?: string;
	/** Call-to-action label. An empty string removes the button. */
	ctaLabel?: string;
	/** Click handler for the call-to-action. The sword is drawn on every click. */
	onCtaClick?: () => void;
	/** How far the camera stands from the sword, in metres. Lower is closer. */
	distance?: number;
	/** How many blades of grass, in fixed steps. Each step rebuilds the buffer. */
	density?: "16000" | "32000" | "64000";
	/** Color of the grass near the ground. */
	grassColor?: string;
	/** Color of the grass tips and seed heads. */
	tipColor?: string;
	/** Color of the fog. The sky is worked out from it. */
	fogColor?: string;
	/** Tint of the sword's steel. */
	steelColor?: string;
	/** How hard the wind blows. 0 leaves the field almost still. */
	wind?: number;
	/** How thick the fog is. */
	fog?: number;
	/** Grass height multiplier. */
	grassHeight?: number;
	/** Film grain and vignette over the scene. 0 turns both off. */
	grain?: number;
	/** Show the thin rules, the ruler and the crosshairs over the scene. */
	frame?: boolean;
	/** A click or tap sends a cut out from the sword. The grass grows back. */
	cut?: boolean;
	/** The camera turns slowly while nothing is held. */
	autoRotate?: boolean;
	/** The camera leans toward the pointer, easing back on leave. */
	parallax?: boolean;
	/** Halt the loop. The field freezes mid-gust. */
	paused?: boolean;
	/** Settles the field into a still pose: no wind, no drift. */
	reducedMotion?: boolean;
	/** Extra classes for the root element, appended to the base classes. */
	className?: string;
}

export type KusanagiDensity = NonNullable<KusanagiProps["density"]>;

const DENSITIES: Record<KusanagiDensity, number> = {
	"16000": 16000,
	"32000": 32000,
	"64000": 64000,
};

const TAU = Math.PI * 2;
// Phases that drive trig wrap here. Every rate that multiplies one inside a
// shader sits on the 0.01 grid, so the wrap lands on a whole number of cycles.
const PHASE_WRAP = 200 * Math.PI;

// Side of the square tile the blade offsets live in, in metres.
const TILE = 32;
const REGION_LEAD = 0.3 * TILE;
const NOISE_FREQ = 1 / 6;
const NOISE_PERIOD = 16;
const BAND_K = TAU / 9;
// Metres per second at wind 1. The preview's wind readout uses the same figure.
const WIND_MPS = 4.2;
const WIND_ANGLE = 0.62;
const WIND_DIR: [number, number] = [Math.cos(WIND_ANGLE), Math.sin(WIND_ANGLE)];
// Cloud noise repeats every CLOUD_PERIOD cells; the scroll wraps there.
const CLOUD_PERIOD = 32;

const CUTS = 4;
const CUT_SPEED = 16;
// Cosine of the half-angle of a cut's sector (about 45 degrees each side).
const CUT_COS = 0.7;
const CUT_HOLD = 2.4;
const CUT_REGROW = 3.6;
// Height the cut leaves standing, in metres.
const CUT_STUBBLE = 0.2;
// Movement under this many CSS pixels is still a press (a click or a tap).
const DRAG_PX = 6;

const BASE_DIST = 5.4;
const DIST_MIN = 3;
const DIST_MAX = 9;
const TARGET_Y = 1.25;
// The tallest seed heads stand about 1.25 m at grassHeight 1.
const CANOPY_TOP = 1.25;
const ELEV_MAX = 0.5;
const ELEV_REST = 0.07;
const IDLE_SPIN = 0.035;
// Fog starts this far from the eye, just behind the sword at the resting
// distance, so the subject is never greyed out.
const FOG_START = 4;

// The sword, in metres. It is longer than a real katana on purpose: it has to
// hold the middle of a wide frame from five metres away.
const SWORD_BLADE = 1.9;
const SWORD_GRIP = 0.7;
// How much of the point sits under the ground: a few inches.
const SWORD_BURY = 0.14;
const SWORD_SORI = 0.085;
const SWORD_WIDTH = 0.12;
const SWORD_THICK = 0.03;
// The sword's lean: a turn about z, then a smaller one about x. buildKatana
// bakes the same two angles, and the draw slides the sword along the axis
// they give.
const SWORD_LEAN_Z = 0.17;
const SWORD_LEAN_X = -0.07;
const SWORD_AXIS: [number, number, number] = [
	-Math.sin(SWORD_LEAN_Z),
	Math.cos(SWORD_LEAN_Z) * Math.cos(SWORD_LEAN_X),
	Math.cos(SWORD_LEAN_Z) * Math.sin(SWORD_LEAN_X),
];

// The draw, in seconds from the click: the sword rises, hangs, drops back.
const DRAW_LIFT = 0.5;
const DRAW_RISE = 0.5;
const DRAW_CUT_AT = 0.16;
const DRAW_DROP_AT = 1.5;
const DRAW_DROP = 0.3;
const DRAW_END = DRAW_DROP_AT + DRAW_DROP + 0.5;
const DRAW_REACH = 10;

const BLADE_LEVELS = [0, 0.2, 0.4, 0.57, 0.72, 0.86, 1];

type Rgb = [number, number, number];

const hexToRgb01 = (hex: string): Rgb => {
	const h = hex.replace("#", "");
	const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
	const n = parseInt(full, 16);
	if (Number.isNaN(n) || full.length !== 6) return [1, 1, 1];
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
	a[0] + (b[0] - a[0]) * t,
	a[1] + (b[1] - a[1]) * t,
	a[2] + (b[2] - a[2]) * t,
];

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// Rates that multiply a wrapped phase are snapped to the 0.01 grid.
const quant = (x: number) => Math.round(x * 100) / 100;

// Seeded so the field is the same field on every load, and pure so the React
// Compiler's purity rule never sees Math.random in a render path.
function mulberry32(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// One blade of grass: a strip of quads up a unit spine, closed by a single tip
// vertex. x is the side (-1, +1, 0 at the tip), y the height fraction.
function buildBladeMesh() {
	const position: number[] = [];
	for (let i = 0; i < BLADE_LEVELS.length - 1; i++) {
		position.push(-1, BLADE_LEVELS[i], 1, BLADE_LEVELS[i]);
	}
	position.push(0, 1);
	const index: number[] = [];
	const quads = BLADE_LEVELS.length - 2;
	for (let i = 0; i < quads; i++) {
		const l0 = i * 2;
		const r0 = l0 + 1;
		const l1 = l0 + 2;
		const r1 = l0 + 3;
		index.push(l0, r0, l1, r0, r1, l1);
	}
	const lt = quads * 2;
	index.push(lt, lt + 1, lt + 2);
	return { position: new Float32Array(position), index: new Uint16Array(index) };
}

// The field, as clumps: fans of leaves leaning out from a shared root, some
// with one or two upright stems that carry a seed head. Clump roots sit on a
// jittered grid visited in a shuffled order, so the field is even without
// being regular.
function buildField(count: number) {
	const rand = mulberry32(0x6b75a1 ^ count);
	const base = new Float32Array(count * 4);
	const shape = new Float32Array(count * 4);
	const misc = new Float32Array(count * 4);
	const grid = Math.ceil(Math.sqrt(count / 9));
	const cell = TILE / grid;
	const order = new Uint32Array(grid * grid);
	for (let i = 0; i < order.length; i++) order[i] = i;
	for (let i = order.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		const swap = order[i];
		order[i] = order[j];
		order[j] = swap;
	}
	const wrap = (v: number) => ((v % TILE) + TILE) % TILE;
	let n = 0;
	const put = (
		x: number,
		z: number,
		height: number,
		width: number,
		facing: number,
		leanAngle: number,
		lean: number,
		head: number,
		stiffness: number,
	) => {
		const i = n * 4;
		base[i] = wrap(x);
		base[i + 1] = wrap(z);
		base[i + 2] = height;
		base[i + 3] = width;
		shape[i] = facing;
		shape[i + 1] = Math.cos(leanAngle) * lean;
		shape[i + 2] = Math.sin(leanAngle) * lean;
		shape[i + 3] = rand() * TAU;
		misc[i] = rand();
		misc[i + 1] = head;
		misc[i + 2] = quant(1.1 + rand() * 1.5);
		misc[i + 3] = stiffness;
		n++;
	};
	for (let k = 0; k < order.length && n < count; k++) {
		const c = order[k];
		const cx = ((c % grid) + 0.1 + rand() * 0.8) * cell;
		const cz = (Math.floor(c / grid) + 0.1 + rand() * 0.8) * cell;
		// A slow swell in canopy height. Whole-number frequencies over the tile
		// keep it seamless across the wrap.
		const u = cx / TILE;
		const v = cz / TILE;
		const swell =
			0.86 +
			0.1 * Math.sin(TAU * (2 * u + 0.17)) * Math.sin(TAU * (v + 0.4)) +
			0.06 * Math.sin(TAU * (3 * u + 2 * v));
		const size = 6 + Math.floor(rand() * 7);
		const spread = 0.05 + rand() * 0.14;
		const heads = rand() < 0.55 ? 1 + Math.floor(rand() * 1.6) : 0;
		for (let j = 0; j < size && n < count; j++) {
			const isHead = j < heads;
			const a = rand() * TAU;
			const r = Math.sqrt(rand()) * spread;
			const leanAngle = a + (rand() - 0.5) * 0.8;
			const lean = isHead ? 0.04 + rand() * 0.12 : 0.16 + rand() * 0.4;
			const height = swell * (isHead ? 0.95 + rand() * 0.3 : 0.45 + rand() * 0.5);
			const width = isHead ? 0.02 + rand() * 0.01 : 0.011 + rand() * 0.009;
			const facing = leanAngle + Math.PI / 2 + (rand() - 0.5) * 0.5;
			put(
				cx + Math.cos(a) * r,
				cz + Math.sin(a) * r,
				height,
				width,
				facing,
				leanAngle,
				lean,
				isHead ? 1 : 0,
				isHead ? 1.1 + rand() * 0.25 : 0.8 + rand() * 0.4,
			);
		}
	}
	while (n < count) {
		const a = rand() * TAU;
		put(
			rand() * TILE,
			rand() * TILE,
			0.45 + rand() * 0.45,
			0.011 + rand() * 0.009,
			a + Math.PI / 2,
			a,
			0.16 + rand() * 0.3,
			0,
			0.8 + rand() * 0.4,
		);
	}
	return { base, shape, misc };
}

type V3 = [number, number, number];

// The sword, lofted along a shallow curve and baked straight into world space:
// point down in the ground at the origin, leaning a little. Flat-shaded where
// steel has edges (blade, collar, guard), smooth where it is wrapped (grip).
// aPart tells the fragment shader which material a triangle is:
// 0 blade, 1 guard, 2 grip, 3 fittings.
function buildKatana() {
	const position: number[] = [];
	const normal: number[] = [];
	const uv: number[] = [];
	const part: number[] = [];
	const L = SWORD_BLADE + SWORD_GRIP;
	const curve = (y: number) => -SWORD_SORI * 4 * (y / L) * (1 - y / L);
	const slope = (y: number) => (-SWORD_SORI * 4 * (1 - (2 * y) / L)) / L;

	const cy = Math.cos(1.2);
	const sy = Math.sin(1.2);
	const cz = Math.cos(SWORD_LEAN_Z);
	const sz = Math.sin(SWORD_LEAN_Z);
	const cx = Math.cos(SWORD_LEAN_X);
	const sx = Math.sin(SWORD_LEAN_X);
	const rotate = (p: V3): V3 => {
		// Turn about the vertical so the resting view meets the flat of the
		// blade, then lean.
		const x1 = p[0] * cy + p[2] * sy;
		const z1 = -p[0] * sy + p[2] * cy;
		const x2 = x1 * cz - p[1] * sz;
		const y2 = x1 * sz + p[1] * cz;
		const y3 = y2 * cx - z1 * sx;
		const z3 = y2 * sx + z1 * cx;
		return [x2, y3, z3];
	};
	// A point in the sword's own frame: y along it, e across the blade in the
	// plane of the curve (negative is the cutting edge), s through its thickness.
	const frame = (y: number) => {
		const dz = slope(y);
		const len = Math.hypot(1, dz);
		return { c: curve(y), ty: 1 / len, tz: dz / len };
	};
	const local = (y: number, e: number, s: number): V3 => {
		const f = frame(y);
		return [s, y - f.tz * e, f.c + f.ty * e];
	};
	const world = (p: V3): V3 => rotate([p[0], p[1] - SWORD_BURY, p[2]]);
	const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
	const cross = (a: V3, b: V3): V3 => [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	];
	const unit = (a: V3): V3 => {
		const l = Math.hypot(a[0], a[1], a[2]) || 1;
		return [a[0] / l, a[1] / l, a[2] / l];
	};
	type Vert = { p: V3; u: number; v: number; n?: V3 };
	const push = (vert: Vert, n: V3, k: number) => {
		const w = world(vert.p);
		position.push(w[0], w[1], w[2]);
		normal.push(n[0], n[1], n[2]);
		uv.push(vert.u, vert.v);
		part.push(k);
	};
	const tri = (a: Vert, b: Vert, c: Vert, k: number) => {
		const face = unit(cross(sub(world(b.p), world(a.p)), sub(world(c.p), world(a.p))));
		push(a, a.n ? unit(rotate(a.n)) : face, k);
		push(b, b.n ? unit(rotate(b.n)) : face, k);
		push(c, c.n ? unit(rotate(c.n)) : face, k);
	};
	const quad = (a: Vert, b: Vert, c: Vert, d: Vert, k: number) => {
		tri(a, b, c, k);
		tri(a, c, d, k);
	};
	const loft = (rings: Vert[][], k: number) => {
		for (let i = 0; i < rings.length - 1; i++) {
			const r0 = rings[i];
			const r1 = rings[i + 1];
			for (let j = 0; j < r0.length; j++) {
				const j1 = (j + 1) % r0.length;
				quad(r0[j], r0[j1], r1[j1], r1[j], k);
			}
		}
	};
	const cap = (ring: Vert[], y: number, k: number) => {
		const centre: Vert = { p: local(y, 0, 0), u: 0.5, v: 0.5 };
		for (let j = 0; j < ring.length; j++) {
			tri(centre, ring[j], ring[(j + 1) % ring.length], k);
		}
	};

	// The blade: a five-sided section (flat back, a ridge each side, the edge)
	// that closes to a point over the last stretch.
	const half = SWORD_WIDTH / 2;
	const section = (y: number, scale: number, thick: number): Vert[] => {
		const k = Math.min(1, y / 0.2);
		const f = 1 - (1 - k) * (1 - k);
		const pts: [number, number][] = [
			[half, thick * 0.3],
			[half * 0.3, thick * 0.5],
			[-half, 0],
			[half * 0.3, -thick * 0.5],
			[half, -thick * 0.3],
		];
		return pts.map(([e, s]) => ({
			p: local(y, (half - (half - e) * f) * scale, s * f * scale),
			u: (half - e) / SWORD_WIDTH,
			v: y,
		}));
	};
	const bladeRings: Vert[][] = [];
	const SEG = 40;
	for (let i = 0; i <= SEG; i++) {
		bladeRings.push(section((SWORD_BLADE * i) / SEG, 1, SWORD_THICK));
	}
	loft(bladeRings, 0);

	// The collar under the guard.
	loft(
		[
			section(SWORD_BLADE - 0.09, 1.16, SWORD_THICK * 1.7),
			section(SWORD_BLADE, 1.16, SWORD_THICK * 1.7),
		],
		3,
	);

	// The guard: a thin oval plate.
	const oval = (y: number, re: number, rs: number, sides: number, v: number, smooth: boolean): Vert[] => {
		const ring: Vert[] = [];
		const f = frame(y);
		for (let j = 0; j < sides; j++) {
			const a = (j / sides) * TAU;
			const e = Math.cos(a) * re;
			const s = Math.sin(a) * rs;
			const vert: Vert = { p: local(y, e, s), u: j / sides, v };
			if (smooth) {
				const ne = Math.cos(a) / re;
				const ns = Math.sin(a) / rs;
				vert.n = [ns, -f.tz * ne, f.ty * ne];
			}
			ring.push(vert);
		}
		return ring;
	};
	const g0 = SWORD_BLADE;
	const g1 = SWORD_BLADE + 0.03;
	const guardA = oval(g0, 0.19, 0.165, 28, 0, false);
	const guardB = oval(g1, 0.19, 0.165, 28, 1, false);
	loft([guardA, guardB], 1);
	cap(guardA, g0, 1);
	cap(guardB, g1, 1);

	// The grip: a wrapped oval with a slight waist.
	const t0 = g1;
	const t1 = L - 0.06;
	const gripRings: Vert[][] = [];
	const GRIP_SEG = 12;
	for (let i = 0; i <= GRIP_SEG; i++) {
		const v = i / GRIP_SEG;
		const waist = 1 - 0.1 * Math.sin(Math.PI * v);
		gripRings.push(oval(t0 + (t1 - t0) * v, 0.066 * waist, 0.047 * waist, 20, v, true));
	}
	loft(gripRings, 2);

	// The end cap.
	const capA = oval(t1, 0.072, 0.053, 20, 0, false);
	const capB = oval(L, 0.067, 0.049, 20, 1, false);
	loft([capA, capB], 3);
	cap(capB, L, 3);

	return {
		position: new Float32Array(position),
		normal: new Float32Array(normal),
		uv: new Float32Array(uv),
		part: new Float32Array(part),
	};
}

const glf = (x: number) => (Number.isInteger(x) ? x.toFixed(1) : String(x));

// Integer hashing for the noise lattice. Integers cannot drift the way a
// sin-based hash does at large inputs.
const HASH = `
uint scramble(uint x) {
  x ^= x >> 16u;
  x *= 0x2c9277b5u;
  x ^= x >> 15u;
  x *= 0x3d4d51cbu;
  x ^= x >> 16u;
  return x;
}
float hash2(uvec2 c) {
  return float(scramble(c.x * 0x9e3779b1u + scramble(c.y + 0x632be5abu))) * (1.0 / 4294967296.0);
}
// Value noise on a lattice that repeats every period cells. The cell index is
// wrapped with a float floor: GLSL leaves the remainder of a negative int
// undefined.
float lattice(vec2 c, float period) {
  vec2 w = c - period * floor(c / period);
  return hash2(uvec2(w));
}
float pnoise(vec2 p, float period) {
  vec2 i = floor(p);
  vec2 f = p - floor(p);
  vec2 s = f * f * (3.0 - 2.0 * f);
  float a = lattice(i, period);
  float b = lattice(i + vec2(1.0, 0.0), period);
  float c = lattice(i + vec2(0.0, 1.0), period);
  float d = lattice(i + vec2(1.0, 1.0), period);
  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}`;

// The one atmosphere every pass shares: the mist colour everything fogs
// toward, the sky above it, and how much fog lies between the eye and a point.
const ATMOS = `
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uSunCol;
uniform vec3 uSunDir;
uniform float uFogK;
uniform float uFogLow;
uniform float uFogStart;
vec3 mist(vec3 dir) {
  float m = max(dot(dir, uSunDir), 0.0);
  return uHorizon + uSunCol * (pow(m, 6.0) * 0.1 + pow(m, 40.0) * 0.1);
}
vec3 skyAt(vec3 dir) {
  float s = clamp(dir.y / 0.5, 0.0, 1.0);
  return mix(mist(dir), uZenith, s * (2.0 - s));
}
// Distance fog begins behind the sword. The second term is the fog that pools
// near the ground far away: thick at the roots, thin at head height.
float fogAt(vec3 w, vec3 cam) {
  float d = length(w.xz - cam.xz);
  float k = max(d - uFogStart, 0.0) * uFogK;
  float low = uFogLow * exp(-max(w.y, 0.0) * 1.3) * smoothstep(5.0, 18.0, d);
  return 1.0 - exp(-k * k - low);
}`;

const SKY_VERT = `#version 300 es
in vec2 position;
out vec2 vNdc;
void main() {
  vNdc = position;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const SKY_FRAG = `#version 300 es
precision highp float;
in vec2 vNdc;
out vec4 fragColor;
uniform vec3 uCamPos;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform float uTanHalf;
uniform float uAspect;
uniform vec2 uShift;
uniform vec3 uTipC;
uniform vec3 uGrassC;
uniform vec2 uCloud;
uniform vec4 uCuts[${CUTS}];
${HASH}
${ATMOS}

void main() {
  // The same ray the blades are projected along: camera basis, aspect, the
  // lens shift and the half-angle of the field of view.
  vec3 dir = normalize(
    uFwd
    + uRight * ((vNdc.x - uShift.x) * uAspect * uTanHalf)
    + uUp * ((vNdc.y - uShift.y) * uTanHalf)
  );
  vec3 col;
  if (dir.y < 0.0) {
    // The analytic ground. Capped so a grazing ray never multiplies a zero
    // component by infinity.
    float tHit = min(-uCamPos.y / dir.y, 4000.0);
    vec2 hit = uCamPos.xz + dir.xz * tHit;
    float d = length(hit - uCamPos.xz);
    // Dark soil up close; further out it takes the canopy's average colour,
    // so the gaps between distant blades never flicker against black.
    vec3 soil = uGrassC * 0.42;
    vec3 canopy = mix(uGrassC, uTipC, 0.36) * 0.95;
    vec3 ground = mix(soil, canopy, smoothstep(2.0, 12.0, d));
    // The earth is darker where the sword stands.
    float rs = dot(hit, hit);
    ground *= 1.0 - 0.5 * exp(-rs / 0.4);
    // Mown ground: where a cut has passed, the pale cut ends show through
    // until the grass grows back. Same sector test as the blades.
    float rb = sqrt(rs);
    vec2 nb = hit / max(rb, 1e-3);
    float mown = 0.0;
    float ragged = (pnoise(hit * 1.7, 64.0) - 0.5) * 0.16;
    for (int i = 0; i < ${CUTS}; i++) {
      vec4 c = uCuts[i];
      if (c.z <= 0.0) continue;
      float inside = smoothstep(${glf(CUT_COS)} - 0.12, ${glf(CUT_COS)} + 0.04, dot(nb, c.xy) + ragged)
        * (1.0 - smoothstep(c.z - 2.0, c.z, rb + ragged * 6.0))
        * smoothstep(0.2, 0.9, rb);
      float since = c.w - rb / ${glf(CUT_SPEED)};
      mown = max(mown, inside * smoothstep(0.0, 0.04, since)
        * (1.0 - smoothstep(${glf(CUT_HOLD)}, ${glf(CUT_HOLD + CUT_REGROW)}, since)));
    }
    ground = mix(ground, mix(uGrassC, uTipC, 0.45) * 0.8, mown * 0.5);
    col = mix(ground, mist(dir), fogAt(vec3(hit.x, 0.0, hit.y), uCamPos));
  } else {
    col = skyAt(dir);
    // Overcast: slow, low-contrast cloud. Two octaves on one wrapped scroll;
    // the second runs at exactly twice the rate, so the wrap is seamless.
    vec2 cp = dir.xz / (dir.y + 0.35) * 1.4;
    float c = pnoise(cp + uCloud, ${glf(CLOUD_PERIOD)}) * 0.6
      + pnoise(cp * 2.0 + uCloud * 2.0 + vec2(5.2, 1.3), ${glf(CLOUD_PERIOD)}) * 0.4;
    float up = smoothstep(0.0, 0.3, dir.y);
    col = mix(col, uZenith * 0.82, smoothstep(0.45, 0.85, c) * 0.55 * up);
    col += (c - 0.5) * 0.07 * up;
    // The sun never shows as a disc, only as a pale stain in the cloud.
    float m = max(dot(dir, uSunDir), 0.0);
    col += uSunCol * pow(m, 90.0) * 0.16;
  }
  col += (hash2(uvec2(gl_FragCoord.xy)) - 0.5) / 255.0;
  fragColor = vec4(col, 1.0);
}`;

const BLADE_VERT = `#version 300 es
precision highp float;
in vec2 position;
in vec4 aBase;
in vec4 aShape;
in vec4 aMisc;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform vec3 cameraPosition;
uniform vec2 uCenter;
uniform vec2 uWind;
uniform float uWindAmt;
uniform vec3 uScroll;
uniform float uBand;
uniform float uFlutter;
uniform float uHeight;
uniform vec4 uCuts[${CUTS}];
uniform float uFocal;
uniform float uFogK;
uniform float uFogStart;
out vec3 vWorld;
out vec3 vNormal;
out float vT;
out float vSide;
out float vTint;
out float vHead;
out float vSheen;
out float vCut;
out float vFlash;
out float vFar;
${HASH}

const float TILE = ${glf(TILE)};
const float NOISE_FREQ = ${glf(NOISE_FREQ)};
const float PERIOD = ${glf(NOISE_PERIOD)};
const float BAND_K = ${glf(BAND_K)};
const float CUT_SPEED = ${glf(CUT_SPEED)};
const float CUT_COS = ${glf(CUT_COS)};
const float CUT_HOLD = ${glf(CUT_HOLD)};
const float CUT_REGROW = ${glf(CUT_REGROW)};
const float CUT_STUBBLE = ${glf(CUT_STUBBLE)};

// A leaf: narrow at the sheath, widest a fifth of the way up, then a long
// taper to the point.
float leafWidth(float t) {
  return (0.68 + 0.32 * min(t * 4.0, 1.0)) * pow(max(1.0 - t, 0.0), 0.75);
}
// A flowering stem: a thin stalk, then the seed head as a spindle over the
// top part. max() keeps pow away from the tiny negative sin(pi) can return.
float headWidth(float t) {
  float s = clamp((t - 0.6) / 0.4, 0.0, 1.0);
  return 0.3 + 1.5 * pow(max(sin(3.14159265 * s), 0.0), 0.7);
}

void main() {
  // The periodic image of this blade's tile offset nearest the region centre.
  vec2 off = aBase.xy;
  vec2 base = off + TILE * floor((uCenter - off) / TILE + 0.5);
  vec2 rel = abs(base - uCenter);
  float edge = TILE * 0.5 - max(rel.x, rel.y);
  float dh = length(base - cameraPosition.xz);
  // Distance from the sword, which stands at the origin.
  float rb = length(base);
  vec2 nb = base / max(rb, 1e-3);
  // Blades shrink to nothing at the tile edge (so a wrap is invisible), right
  // in front of the lens (so none fills the frame or meets the near plane),
  // and they stand shorter in the trampled ring around the sword.
  float H = aBase.z * uHeight
    * smoothstep(0.0, 2.5, edge)
    * smoothstep(0.35, 1.1, dh)
    * mix(0.42, 1.0, smoothstep(0.25, 1.9, rb));
  float zView = (viewMatrix * vec4(base.x, 0.0, base.y, 1.0)).z;
  // Collapse whatever can never be seen. Every vertex lands on one point
  // outside the clip volume, so it costs no fill at all.
  if (H < 0.01 || (dh - uFogStart) * uFogK > 2.6 || zView > H + 0.6 || rb < 0.14) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }

  // Wind, sampled once per blade at its root. Three octaves of tileable noise
  // scroll downwind at different speeds (each wraps at its own period).
  vec2 across = vec2(-uWind.y, uWind.x);
  float along = dot(base, uWind);
  vec2 q = vec2(along, dot(base, across)) * NOISE_FREQ;
  float n1 = pnoise(q - vec2(uScroll.x, 0.0), PERIOD);
  float n2 = pnoise(q * 2.0 - vec2(uScroll.y * 2.0, 0.0) + vec2(7.3, 2.9), PERIOD * 2.0);
  float n3 = pnoise(q * 4.0 - vec2(uScroll.z * 4.0, 0.0) + vec2(1.7, 9.1), PERIOD * 4.0);
  float gust = n1 * 0.58 + n2 * 0.29 + n3 * 0.13;
  // The wave fronts: a sharpened travelling sine, bent by the noise so no
  // front is a ruled line.
  float front = 0.5 + 0.5 * sin(along * BAND_K - uBand + (n2 - 0.5) * 4.0);
  front = front * front * front;
  float push = uWindAmt * (0.14 + 0.5 * smoothstep(0.32, 0.86, gust) + 0.46 * front * mix(0.3, 1.0, smoothstep(0.25, 0.7, n1)));
  float veer = (n3 - 0.5) * 0.8;
  vec2 wdir = vec2(uWind.x * cos(veer) - uWind.y * sin(veer), uWind.x * sin(veer) + uWind.y * cos(veer));

  vec2 bend = aShape.yz + wdir * push * aMisc.w;

  // Flutter on the wrapped clock (per-blade rates on the 0.01 grid), and a
  // slow breath that survives even with the wind at zero.
  float ph = aShape.w;
  float rate = aMisc.z;
  float lively = (0.3 + uWindAmt * 0.7) * (0.6 + push);
  bend += (across * sin(uFlutter * rate + ph) * 0.055 + wdir * sin(uFlutter * rate * 3.0 + ph * 1.7) * 0.03) * lively;
  bend += across * sin(uFlutter * 0.37 + ph) * 0.025;

  // The clearing: the grass leans out and away from the sword.
  bend += nb * exp(-(rb * rb) / 2.2) * 0.85;

  // Cuts. 'since' is how long ago the front passed this blade. A passed blade
  // is clipped to a stubble height, holds, then grows back; the front itself
  // kicks it outward and leaves a short flash.
  float keep = 1.0;
  float cutMark = 0.0;
  float flash = 0.0;
  float stubble = clamp(CUT_STUBBLE * (0.75 + 0.5 * aMisc.x) / max(H, 0.01), 0.0, 1.0);
  for (int i = 0; i < ${CUTS}; i++) {
    vec4 c = uCuts[i];
    if (c.z <= 0.0) continue;
    float inside = smoothstep(CUT_COS - 0.12, CUT_COS + 0.04, dot(nb, c.xy))
      * (1.0 - smoothstep(c.z - 1.2, c.z, rb))
      * smoothstep(0.2, 0.5, rb);
    float since = c.w - rb / CUT_SPEED;
    float hit = smoothstep(0.0, 0.04, since);
    float grow = smoothstep(CUT_HOLD, CUT_HOLD + CUT_REGROW, since);
    float k = inside * hit * (1.0 - grow);
    keep = min(keep, mix(1.0, stubble, k));
    cutMark = max(cutMark, k);
    flash += inside * exp(-since * since * 500.0);
    bend += nb * inside * hit * exp(-max(since, 0.0) * 3.5) * 0.45;
  }

  // Soft clamp: a blade can lie nearly flat but never fold into the ground.
  float bl = length(bend);
  float soft = 0.9 * tanh(bl / 0.9);
  bend *= soft / max(bl, 1e-5);
  bl = soft;

  // The spine: displacement grows with t squared, and the height drops as
  // the bend grows, which keeps the blade's length within a few percent. A
  // cut scales t, not H, so the blade stops where the steel passed.
  float t = position.y * keep;
  float lift = sqrt(max(1.0 - bl * bl, 0.0));
  vec3 spine = vec3(base.x + bend.x * H * t * t, H * lift * t, base.y + bend.y * H * t * t);
  vec3 tangent = normalize(vec3(2.0 * bend.x * H * t, H * lift, 2.0 * bend.y * H * t));
  // A bent blade turns its flat face into the bend, the way grass does in a
  // wind; that turn is what flashes the light.
  vec2 a0 = vec2(cos(aShape.x), sin(aShape.x));
  vec2 bdir = bend / max(bl, 1e-5);
  vec2 a1 = vec2(-bdir.y, bdir.x);
  a1 *= dot(a1, a0) < 0.0 ? -1.0 : 1.0;
  vec2 ax = normalize(mix(a0, a1, smoothstep(0.08, 0.7, bl) * (0.25 + 0.75 * t)));
  vec3 A = vec3(ax.x, 0.0, ax.y);

  float head = aMisc.y;
  float prof = mix(leafWidth(t), headWidth(t), head);
  // Never thinner than most of a device pixel: a sub-pixel blade samples as
  // on-off noise and shimmers as the wind moves it.
  float dist = length(spine - cameraPosition);
  float px = aBase.w * uFocal / max(dist, 0.05);
  float widen = max(1.0, 0.85 / max(px, 1e-4));
  vec3 world = spine + A * position.x * aBase.w * 0.5 * prof * widen;

  vec3 N = normalize(cross(A, tangent));
  vNormal = normalize(N + A * position.x * 0.45);
  vWorld = world;
  vT = t;
  vSide = position.x;
  vTint = aMisc.x;
  vHead = head;
  vSheen = clamp(push * 0.9 + front * uWindAmt * 0.25, 0.0, 1.5);
  vCut = cutMark;
  vFlash = min(flash, 1.0);
  vFar = smoothstep(6.0, 18.0, dh);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const BLADE_FRAG = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
in float vT;
in float vSide;
in float vTint;
in float vHead;
in float vSheen;
in float vCut;
in float vFlash;
in float vFar;
out vec4 fragColor;
uniform vec3 cameraPosition;
uniform vec3 uTipC;
uniform vec3 uGrassC;
${ATMOS}

void main() {
  vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 V = normalize(cameraPosition - vWorld);
  float t = vT;
  float head = vHead * smoothstep(0.56, 0.7, t);
  // Per-blade variety fades out with distance: far away a field is one
  // surface, and blade-to-blade contrast at a pixel or two is what shimmers.
  float tint = mix(vTint, 0.5, vFar);
  vec3 straw = mix(uTipC, vec3(0.8, 0.8, 0.7), 0.25);
  vec3 body = mix(uGrassC, uTipC, pow(t, 1.3) * 0.85) * (0.75 + 0.5 * tint);
  body = mix(body, straw, head * 0.8);
  // A cut end is pale where the blade was opened.
  body = mix(body, straw, vCut * 0.85 * smoothstep(0.03, 0.14, t));
  float ao = mix(0.22, 1.0, smoothstep(0.0, 0.55, t));
  // Overcast light: most of it falls from the whole sky, a little from the
  // pale patch where the sun is, and some comes through the thin tips.
  float up = n.y * 0.5 + 0.5;
  float wrap = clamp(dot(n, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
  float toward = max(dot(-V, uSunDir), 0.0);
  float thin = mix(0.12, 1.0, t * t) + head * 0.8;
  vec3 light = vec3(0.62 + 0.42 * up) + uSunCol * (wrap * wrap * 0.3 + pow(toward, 5.0) * thin * 0.45);
  vec3 col = body * ao * light;
  // Gloss on faces turned up toward the half-vector. A gust lays blades over
  // and turns their faces up, so this light rolls across the field with it.
  vec3 hv = normalize(uSunDir + V);
  float gloss = pow(max(dot(n, hv), 0.0), 18.0);
  col += uHorizon * gloss * (0.06 + 0.4 * vSheen) * smoothstep(0.15, 0.7, t);
  col += uTipC * vSheen * 0.07 * smoothstep(0.25, 1.0, t);
  col += vec3(0.85, 0.9, 0.92) * vFlash * 0.5;
  col = mix(col, mist(-V), fogAt(vWorld, cameraPosition));
  // Feathered seed heads through alpha-to-coverage: order-independent, so no
  // sorting, and a plain opaque blade where multisampling is unavailable.
  float feather = 1.0 - head * smoothstep(0.35, 1.0, abs(vSide)) * 0.75;
  fragColor = vec4(col, feather);
}`;

const KATANA_VERT = `#version 300 es
precision highp float;
in vec3 position;
in vec3 normal;
in vec2 uv;
in float aPart;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform vec3 uLift;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vUv;
out float vPart;
void main() {
  vWorld = position + uLift;
  vNormal = normal;
  vUv = uv;
  vPart = aPart;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

const KATANA_FRAG = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
in float vPart;
out vec4 fragColor;
uniform vec3 cameraPosition;
uniform vec3 uSteel;
uniform vec3 uGrassC;
uniform float uFlash;
// The draw's band of light: where it sits along the blade (metres from the
// point) and how bright it is.
uniform vec2 uGlint;
${ATMOS}

// What the steel sees: the sky above, the field below.
vec3 envAt(vec3 d) {
  if (d.y > 0.0) return skyAt(d);
  return mix(uGrassC * 1.1, uHorizon, 0.12 + 0.5 * exp(d.y * 6.0));
}

void main() {
  // The ground is drawn by the sky pass and writes no depth, so the buried
  // point is cut away here. It comes back as the draw lifts the sword.
  if (vWorld.y < 0.0) discard;
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 n = normalize(vNormal);
  if (dot(n, V) < 0.0) n = -n;
  float ndv = max(dot(n, V), 0.0);
  float fres = pow(1.0 - ndv, 5.0);
  vec3 env = envAt(reflect(-V, n));
  float up = n.y * 0.5 + 0.5;
  float wrap = clamp(dot(n, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
  vec3 light = vec3(0.55 + 0.4 * up) + uSunCol * wrap * wrap * 0.3;
  vec3 col;
  if (vPart < 0.5) {
    // The blade: mirror polish above the ridge line, a paler, matte temper
    // line along the edge with a slow wave in it.
    float e = vUv.x;
    float wave = sin(vUv.y * 46.0) * 0.035 + sin(vUv.y * 113.0 + 1.3) * 0.02;
    float temper = smoothstep(0.62 + wave, 0.7 + wave, e);
    float ground = smoothstep(0.3, 0.36, e);
    vec3 polish = env * uSteel * (1.25 + 0.2 * fres) * mix(0.62, 1.0, ground);
    vec3 matte = uSteel * light * 1.25;
    col = mix(polish, matte, temper * 0.85);
    vec3 hv = normalize(uSunDir + V);
    col += uSunCol * pow(max(dot(n, hv), 0.0), 70.0) * 0.6;
    col += vec3(1.0) * uFlash * (0.2 + 0.5 * fres);
    float band = (vUv.y - uGlint.x) / 0.16;
    col += vec3(1.0, 1.0, 0.97) * uGlint.y * exp(-band * band);
  } else if (vPart < 1.5) {
    // The guard: dark iron. It and the grip stay dark so the sword keeps a
    // silhouette against the pale sky.
    col = vec3(0.045, 0.05, 0.055) * light + env * (0.04 + 0.3 * fres);
  } else if (vPart < 2.5) {
    // The grip: dark cord crossed over pale skin, leaving a row of diamonds.
    vec2 p = vec2(vUv.x * 4.0, vUv.y * 11.0);
    float a = abs(fract(p.x + p.y) - 0.5);
    float b = abs(fract(p.x - p.y) - 0.5);
    float open = smoothstep(0.2, 0.25, min(a, b));
    col = mix(vec3(0.035, 0.04, 0.05), vec3(0.5, 0.48, 0.43), open) * light;
  } else {
    col = vec3(0.2, 0.15, 0.08) * light + env * (0.06 + 0.35 * fres);
  }
  col = mix(col, mist(-V), fogAt(vWorld, cameraPosition));
  fragColor = vec4(col, 1.0);
}`;

// Film grain: one small tile of fractal noise, laid over the scene.
const GRAIN_URL =
	"url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 0 1'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")";

type U = Record<string, { value: unknown }>;

const Kusanagi = memo(
	({
		title = "Kusanagi",
		subtitle = "The field bows to one blade.",
		ctaLabel = "Draw the blade",
		onCtaClick,
		distance = 5.4,
		density = "32000",
		grassColor = "#263a2c",
		tipColor = "#93a37f",
		fogColor = "#5d6b73",
		steelColor = "#cfd6dc",
		wind = 1,
		fog = 0.6,
		grassHeight = 1.15,
		grain = 0.35,
		frame = true,
		cut = true,
		autoRotate = true,
		parallax = true,
		paused = false,
		reducedMotion = false,
		className,
	}: KusanagiProps) => {
		const containerRef = useRef<HTMLDivElement>(null);
		const drawRef = useRef<((dt: number) => void | false) | null>(null);
		const measureRef = useRef<((m: Metrics) => void) | null>(null);
		const rebuildRef = useRef<((next: KusanagiDensity) => void) | null>(null);
		const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(null);
		// Orbit, hover and press all live in refs written from the handlers and
		// read by the loop. React state here would re-render per pointer tick.
		const orbit = useRef({
			yaw: -0.3,
			elev: ELEV_REST,
			vYaw: 0,
			vElev: 0,
			dragging: false,
			lastX: 0,
			lastY: 0,
			lastT: 0,
		});
		// The live elevation band, written by the loop (it depends on
		// grassHeight) and read by the drag handler.
		const elevBand = useRef<[number, number]>([0, ELEV_MAX]);
		const hover = useRef({ inside: false, nx: 0, ny: 0, px: 0, py: 0 });
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
		// Set by the call-to-action, taken by the loop on its next frame.
		const drawRequest = useRef(false);
		const ctaRingRef = useRef<HTMLSpanElement>(null);
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
			grassColor, tipColor, fogColor, steelColor, wind, fog, grassHeight,
			distance, cut, autoRotate, parallax, reducedMotion,
		});
		live.current = {
			grassColor, tipColor, fogColor, steelColor, wind, fog, grassHeight,
			distance, cut, autoRotate, parallax, reducedMotion,
		};

		useEffect(() => {
			const container = containerRef.current;
			if (fallback || !container) return;

			let renderer: Renderer;
			try {
				renderer = new Renderer({
					webgl: 2,
					// The sword is a few hard, thin edges: without multisampling
					// they crawl through every frame of the orbit.
					antialias: true,
					alpha: false,
					powerPreference: "high-performance",
					dpr: Math.min(window.devicePixelRatio || 1, 2),
				});
				if (!renderer.isWebgl2) {
					// The shaders are GLSL 3.00; a WebGL1 context cannot run them.
					renderer.gl.getExtension("WEBGL_lose_context")?.loseContext();
					throw new Error("Kusanagi needs WebGL2");
				}
			} catch {
				setFallback(true);
				return;
			}
			const glc = renderer.gl;

			const atmos = () => ({
				uHorizon: { value: new Float32Array(3) },
				uZenith: { value: new Float32Array(3) },
				uSunCol: { value: new Float32Array(3) },
				uSunDir: { value: new Float32Array([0, 0.2, -1]) },
				uFogK: { value: 0.1 },
				uFogLow: { value: 0.5 },
				uFogStart: { value: FOG_START },
			});
			const skyProgram = new Program(glc, {
				vertex: SKY_VERT,
				fragment: SKY_FRAG,
				cullFace: false,
				depthTest: false,
				depthWrite: false,
				uniforms: {
					...atmos(),
					uCamPos: { value: new Float32Array(3) },
					uRight: { value: new Float32Array([1, 0, 0]) },
					uUp: { value: new Float32Array([0, 1, 0]) },
					uFwd: { value: new Float32Array([0, 0, -1]) },
					uTanHalf: { value: 0.4 },
					uAspect: { value: 1 },
					uShift: { value: new Float32Array(2) },
					uTipC: { value: new Float32Array(3) },
					uGrassC: { value: new Float32Array(3) },
					uCloud: { value: new Float32Array(2) },
					uCuts: { value: new Array<number>(CUTS * 4).fill(0) },
				},
			});
			const bladeProgram = new Program(glc, {
				vertex: BLADE_VERT,
				fragment: BLADE_FRAG,
				// Grass is seen from both sides; the fragment shader flips the
				// normal toward the viewer with gl_FrontFacing.
				cullFace: false,
				uniforms: {
					...atmos(),
					uCenter: { value: new Float32Array(2) },
					uWind: { value: new Float32Array(WIND_DIR) },
					uWindAmt: { value: 1 },
					uScroll: { value: new Float32Array(3) },
					uBand: { value: 0 },
					uFlutter: { value: 0 },
					uHeight: { value: 1 },
					// ogl drops a typed array on an array uniform; it must be plain.
					uCuts: { value: new Array<number>(CUTS * 4).fill(0) },
					uFocal: { value: 1000 },
					uTipC: { value: new Float32Array(3) },
					uGrassC: { value: new Float32Array(3) },
				},
			});
			const katanaProgram = new Program(glc, {
				vertex: KATANA_VERT,
				fragment: KATANA_FRAG,
				// The shader turns every normal toward the eye, so winding does
				// not matter and thin parts never vanish edge-on.
				cullFace: false,
				uniforms: {
					...atmos(),
					uSteel: { value: new Float32Array(3) },
					uGrassC: { value: new Float32Array(3) },
					uFlash: { value: 0 },
					uLift: { value: new Float32Array(3) },
					uGlint: { value: new Float32Array(2) },
				},
			});

			const programs = [skyProgram, bladeProgram, katanaProgram];
			// ogl only logs a failed link. A broken program would draw nothing on
			// a blank canvas, so a failed link goes to the poster instead.
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

			const camera = new Camera(glc, { fov: 44, near: 0.05, far: 120 });
			const scene = new Transform();

			const sky = new Mesh(glc, {
				geometry: new Triangle(glc),
				program: skyProgram,
				renderOrder: -1,
				frustumCulled: false,
			});
			sky.setParent(scene);

			const bladeMesh = buildBladeMesh();
			// Fresh attribute objects every time: ogl writes the GL buffer onto
			// the object it is given, so sharing one between two geometries would
			// let the old one's remove() delete the new one's buffer.
			const makeBlades = (count: number) => {
				const field = buildField(count);
				return new Geometry(glc, {
					position: { size: 2, data: bladeMesh.position },
					index: { data: bladeMesh.index },
					aBase: { size: 4, data: field.base, instanced: 1 },
					aShape: { size: 4, data: field.shape, instanced: 1 },
					aMisc: { size: 4, data: field.misc, instanced: 1 },
				});
			};
			let built = density;
			const blades = new Mesh(glc, {
				geometry: makeBlades(DENSITIES[built] ?? 32000),
				program: bladeProgram,
				frustumCulled: false,
			});
			blades.onBeforeRender(() => glc.enable(glc.SAMPLE_ALPHA_TO_COVERAGE));
			blades.onAfterRender(() => glc.disable(glc.SAMPLE_ALPHA_TO_COVERAGE));
			blades.setParent(scene);

			// Density swaps the instance buffers only. The renderer, the context
			// and every program survive, so the change lands on the next frame.
			rebuildRef.current = (next) => {
				if (next === built) return;
				built = next;
				const old = blades.geometry;
				blades.geometry = makeBlades(DENSITIES[next] ?? 32000);
				old.remove();
			};

			const katanaData = buildKatana();
			const katanaGeometry = new Geometry(glc, {
				position: { size: 3, data: katanaData.position },
				normal: { size: 3, data: katanaData.normal },
				uv: { size: 2, data: katanaData.uv },
				aPart: { size: 1, data: katanaData.part },
			});
			const katana = new Mesh(glc, {
				geometry: katanaGeometry,
				program: katanaProgram,
				frustumCulled: false,
			});
			katana.setParent(scene);

			const su = skyProgram.uniforms as U;
			const bu = bladeProgram.uniforms as U;
			const ku = katanaProgram.uniforms as U;
			const vec = (u: U, key: string) => u[key].value as Float32Array;
			const num = (u: U, key: string, v: number) => {
				(u[key] as { value: number }).value = v;
			};
			const cutUniform = bu.uCuts.value as number[];
			const skyCutUniform = su.uCuts.value as number[];

			// Wrapped phases. Each one is bounded, so nothing drifts in float32.
			const scroll = [0, 0, 0];
			const cloud = [0, 0];
			let band = 0;
			let flutter = 0;
			let flash = 0;
			// The eased camera distance, and the draw's clock (-1 while idle).
			let dist = clamp(live.current.distance, DIST_MIN, DIST_MAX);
			let drawT = -1;
			let drawCut = false;
			let drawLanded = false;

			// Projection state, written by measure and shared with the ray caster.
			let aspect = 1;
			let tanHalf = Math.tan((44 * Math.PI) / 360);
			let focal = 1000;
			const shift: [number, number] = [0, 0];

			// This frame's camera, kept for the pointer rays.
			const eye = [0, 2, 5];
			const right = [1, 0, 0];
			const up = [0, 1, 0];
			const fwd = [0, 0, -1];
			const center = [0, 0];
			const sunDir = [0, 0.2, -1];

			const cuts = Array.from({ length: CUTS }, () => ({ x: 1, z: 0, reach: 0, age: 0 }));
			const cutLife = (reach: number) => reach / CUT_SPEED + CUT_HOLD + CUT_REGROW;

			// Where a pointer ray points, with the exact projection the scene
			// renders with: the ground point it hits, or just its heading when
			// it runs into the sky.
			const aim = (nx: number, ny: number): { x: number; z: number; reach: number } => {
				const dx = (nx - shift[0]) * aspect * tanHalf;
				const dy = (ny - shift[1]) * tanHalf;
				const rx = fwd[0] + right[0] * dx + up[0] * dy;
				const ry = fwd[1] + right[1] * dx + up[1] * dy;
				const rz = fwd[2] + right[2] * dx + up[2] * dy;
				let hx = rx;
				let hz = rz;
				let reach = 9;
				if (ry < -1e-4) {
					const t = -eye[1] / ry;
					const gx = eye[0] + rx * t;
					const gz = eye[2] + rz * t;
					const gl = Math.hypot(gx, gz);
					// A click on the sword's own foot has no direction: it falls
					// through to the ray's heading instead.
					if (gl > 0.4 && gl < 40) {
						hx = gx;
						hz = gz;
						reach = clamp(gl * 1.25 + 1.5, 3.5, 10);
					}
				}
				const hl = Math.hypot(hx, hz) || 1;
				return { x: hx / hl, z: hz / hl, reach };
			};

			drawRef.current = (dt) => {
				const l = live.current;
				const o = orbit.current;
				const hv = hover.current;
				const pr = press.current;
				const step = Math.min(dt, 1 / 30);
				const frozen = pausedRef.current;
				// Still: no wind, no drift, no idle turn. Paused freezes the cuts
				// too; reduced motion lets them finish, since they answer the
				// visitor's own hand.
				const still = frozen || l.reducedMotion;
				const ease = frozen ? 0 : step;

				if (!still) {
					const speed = WIND_MPS * l.wind;
					scroll[0] = (scroll[0] + step * speed * NOISE_FREQ) % NOISE_PERIOD;
					scroll[1] = (scroll[1] + step * speed * NOISE_FREQ * 1.37) % NOISE_PERIOD;
					scroll[2] = (scroll[2] + step * speed * NOISE_FREQ * 0.71) % NOISE_PERIOD;
					band = (band + step * speed * BAND_K) % PHASE_WRAP;
					flutter = (flutter + step * (1 + 1.2 * l.wind)) % PHASE_WRAP;
					const drift = step * (0.012 + 0.02 * l.wind);
					cloud[0] = (cloud[0] + drift * WIND_DIR[0]) % CLOUD_PERIOD;
					cloud[1] = (cloud[1] + drift * WIND_DIR[1]) % CLOUD_PERIOD;
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
				// The draw: taken from the button on this frame. Reduced motion
				// skips the sword's travel and only mows the ring.
				let ring = false;
				if (drawRequest.current) {
					drawRequest.current = false;
					if (l.reducedMotion) ring = true;
					else if (drawT < 0) {
						drawT = 0;
						drawCut = false;
						drawLanded = false;
					}
				}
				let lift = 0;
				let glintAt = 0;
				let glintAmt = 0;
				let push = 0;
				if (drawT >= 0) {
					drawT += ease;
					if (!drawCut && drawT >= DRAW_CUT_AT) {
						drawCut = true;
						ring = true;
						flash = 1;
					}
					const lifted = clamp(drawT / DRAW_RISE, 0, 1);
					const drop = clamp((drawT - DRAW_DROP_AT) / DRAW_DROP, 0, 1);
					// Out with a small overshoot, back in faster than it came.
					const out = 1 + 2.2 * Math.pow(lifted - 1, 3) + 1.2 * Math.pow(lifted - 1, 2);
					lift = DRAW_LIFT * out * (1 - drop * drop * drop);
					const run = clamp((drawT - 0.08) / 0.7, 0, 1);
					glintAt = SWORD_BLADE * (1 - run) - 0.1;
					glintAmt = 1.6 * Math.sin(Math.PI * run);
					// The camera steps back with the sword, so the hilt stays in
					// frame at the top of the draw.
					push = lift / DRAW_LIFT;
					if (drawT >= DRAW_DROP_AT + DRAW_DROP && !drawLanded) {
						// It lands: one more, smaller flash.
						drawLanded = true;
						flash = Math.max(flash, 0.5);
					}
					if (drawT >= DRAW_END) drawT = -1;
				}
				if (ring && l.cut) {
					for (let i = 0; i < CUTS; i++) {
						const a = (i / CUTS) * TAU + 0.4;
						const c = cuts[i];
						c.x = Math.cos(a);
						c.z = Math.sin(a);
						c.reach = DRAW_REACH;
						c.age = l.reducedMotion ? DRAW_REACH / CUT_SPEED : 0;
					}
				}

				// The camera distance follows its control with a short ease, and
				// lands at once when nothing is allowed to move.
				const wantDist = clamp(l.distance, DIST_MIN, DIST_MAX);
				dist = still ? wantDist : dist + (wantDist - dist) * (1 - Math.exp(-step * 7));
				const reach = dist * (1 + 0.46 * push);

				// The band: the lowest eye clears the tallest seed heads, the
				// highest looks down at about 30 degrees.
				const top = CANOPY_TOP * l.grassHeight + 0.12;
				const elevMin = Math.asin(
					clamp((top - TARGET_Y) / reach, -0.02, Math.sin(ELEV_MAX - 0.06)),
				);
				elevBand.current = [elevMin, ELEV_MAX];
				o.elev = clamp(o.elev, elevMin, ELEV_MAX);

				// Parallax: a small lean toward the pointer, on top of the orbit,
				// and only while nothing is held.
				const leaning = l.parallax && !l.reducedMotion && hv.inside && !o.dragging;
				const wantX = leaning ? hv.nx : 0;
				const wantY = leaning ? hv.ny : 0;
				const leanEase = 1 - Math.exp(-ease * 3.5);
				hv.px += (wantX - hv.px) * leanEase;
				hv.py += (wantY - hv.py) * leanEase;
				const yaw = o.yaw + hv.px * 0.07;
				const elev = clamp(o.elev - hv.py * 0.035, elevMin, ELEV_MAX);

				const ce = Math.cos(elev);
				const sinYaw = Math.sin(yaw);
				const cosYaw = Math.cos(yaw);
				eye[0] = reach * ce * sinYaw;
				eye[1] = TARGET_Y + reach * Math.sin(elev);
				eye[2] = reach * ce * cosYaw;
				camera.position.set(eye[0], eye[1], eye[2]);
				camera.lookAt([0, TARGET_Y, 0]);
				camera.updateMatrixWorld();
				const m = camera.worldMatrix;
				right[0] = m[0]; right[1] = m[1]; right[2] = m[2];
				up[0] = m[4]; up[1] = m[5]; up[2] = m[6];
				fwd[0] = -m[8]; fwd[1] = -m[9]; fwd[2] = -m[10];
				const flat = Math.hypot(fwd[0], fwd[2]) || 1;
				center[0] = eye[0] + (fwd[0] / flat) * REGION_LEAD;
				center[1] = eye[2] + (fwd[2] / flat) * REGION_LEAD;

				// The pale patch of sun: low, ahead of the camera and off to one
				// side, following every turn.
				{
					const a = yaw + 0.5;
					const el = 0.2;
					sunDir[0] = -Math.sin(a) * Math.cos(el);
					sunDir[1] = Math.sin(el);
					sunDir[2] = -Math.cos(a) * Math.cos(el);
				}

				// A release that never became a drag: a cut, out from the sword
				// toward the point that was pressed.
				if (pr.tap) {
					const tap = pr.tap;
					pr.tap = null;
					if (l.cut) {
						const at = aim(tap.nx, tap.ny);
						let slot = 0;
						for (let i = 1; i < CUTS; i++) {
							const a = cuts[i];
							const b = cuts[slot];
							if (b.reach > 0 && (a.reach <= 0 || a.age > b.age)) slot = i;
						}
						const c = cuts[slot];
						c.x = at.x;
						c.z = at.z;
						c.reach = at.reach;
						// Reduced motion skips the travelling front: the grass in
						// the sector is simply short, then grows back.
						c.age = l.reducedMotion ? at.reach / CUT_SPEED : 0;
						if (!l.reducedMotion) flash = 1;
					}
				}
				let cutsLive = false;
				for (let i = 0; i < CUTS; i++) {
					const c = cuts[i];
					if (c.reach > 0) {
						c.age += ease;
						if (c.age > cutLife(c.reach)) c.reach = 0;
					}
					cutsLive = cutsLive || c.reach > 0;
					const j = i * 4;
					cutUniform[j] = skyCutUniform[j] = c.x;
					cutUniform[j + 1] = skyCutUniform[j + 1] = c.z;
					cutUniform[j + 2] = skyCutUniform[j + 2] = c.reach;
					cutUniform[j + 3] = skyCutUniform[j + 3] = c.age;
				}
				flash *= Math.exp(-ease * 5);

				const tipC = hexToRgb01(l.tipColor);
				const grassC = hexToRgb01(l.grassColor);
				const fogC = hexToRgb01(l.fogColor);
				// The mist is the fog colour lifted toward white; the sky overhead
				// is the same colour, a little deeper.
				const horizon = mixRgb(fogC, [1, 1, 1], 0.22);
				const zenith = mixRgb(fogC, [0, 0, 0], 0.3);
				const sunCol = mixRgb(horizon, [1, 1, 1], 0.6);
				const fogK = 0.05 + 0.07 * clamp(l.fog, 0, 1);
				const fogLow = 0.8 * clamp(l.fog, 0, 1);

				for (const u of [su, bu, ku]) {
					vec(u, "uHorizon").set(horizon);
					vec(u, "uZenith").set(zenith);
					vec(u, "uSunCol").set(sunCol);
					vec(u, "uSunDir").set(sunDir);
					vec(u, "uGrassC").set(grassC);
					num(u, "uFogK", fogK);
					num(u, "uFogLow", fogLow);
					// The clear stretch scales with the camera distance, so the
					// sword stays out of the fog however far back the eye stands.
					num(u, "uFogStart", (FOG_START * dist) / BASE_DIST);
				}
				vec(su, "uTipC").set(tipC);
				vec(bu, "uTipC").set(tipC);
				vec(su, "uCamPos").set(eye);
				vec(su, "uRight").set(right);
				vec(su, "uUp").set(up);
				vec(su, "uFwd").set(fwd);
				vec(su, "uShift").set(shift);
				vec(su, "uCloud").set(cloud);
				num(su, "uTanHalf", tanHalf);
				num(su, "uAspect", aspect);

				vec(bu, "uCenter").set(center);
				vec(bu, "uScroll").set(scroll);
				// Past 1 the wind keeps speeding up but bends the grass only half
				// as much more, so a gale still leaves blades standing.
				num(bu, "uWindAmt", l.wind <= 1 ? l.wind : 1 + (l.wind - 1) * 0.5);
				num(bu, "uBand", band);
				num(bu, "uFlutter", flutter);
				num(bu, "uHeight", l.grassHeight);
				num(bu, "uFocal", focal);

				vec(ku, "uSteel").set(hexToRgb01(l.steelColor));
				num(ku, "uFlash", flash);
				const liftU = vec(ku, "uLift");
				liftU[0] = SWORD_AXIS[0] * lift;
				liftU[1] = SWORD_AXIS[1] * lift;
				liftU[2] = SWORD_AXIS[2] * lift;
				const glintU = vec(ku, "uGlint");
				glintU[0] = glintAt;
				glintU[1] = glintAmt;

				glc.clearColor(horizon[0], horizon[1], horizon[2], 1);
				renderer.render({ scene, camera, frustumCull: false });

				// Reduced motion settles to one painted pose, then halts until a
				// hand arrives (every handler restarts the loop).
				if (l.reducedMotion && !frozen) {
					const busy =
						pr.down ||
						o.dragging ||
						cutsLive ||
						drawT >= 0 ||
						flash > 0.002 ||
						Math.abs(wantX - hv.px) > 0.002 ||
						Math.abs(wantY - hv.py) > 0.002;
					if (!busy) return false;
				}
			};

			measureRef.current = ({ width, height, dpr }: Metrics) => {
				const w = Math.max(1, Math.floor(width));
				const h = Math.max(1, Math.floor(height));
				renderer.dpr = dpr;
				renderer.setSize(w, h);
				aspect = w / h;
				// The lens shift lifts the whole image instead of tilting the
				// camera, so the sword stays upright on screen: the horizon lands
				// about a third of the way down and the sword's foot clears the
				// title at the bottom. Portrait widens the lens, since a narrow
				// frame otherwise sees a sliver of field.
				const landscape = aspect >= 1;
				const fov = landscape ? 44 : Math.min(62, 44 + (1 - aspect) * 34);
				tanHalf = Math.tan((fov * Math.PI) / 360);
				shift[0] = landscape ? -0.05 : 0;
				shift[1] = landscape ? 0.42 : 0.44;
				camera.perspective({ fov, aspect, near: 0.05, far: 120 });
				// An off-axis frustum, so perspective stays honest while the
				// composition moves. ogl rebuilds the matrix in perspective(), so
				// the shift is reapplied after it.
				camera.projectionMatrix[8] = -shift[0];
				camera.projectionMatrix[9] = -shift[1];
				focal = (h * dpr * 0.5) / tanHalf;
				drawRef.current?.(0.016);
			};

			loop.resize();
			loop.start();

			return () => {
				drawRef.current = null;
				measureRef.current = null;
				rebuildRef.current = null;
				blades.geometry.remove();
				katanaGeometry.remove();
				sky.geometry.remove();
				programs.forEach((p) => p.remove());
				if (container.contains(canvas)) container.removeChild(canvas);
			};
			// Built once. Density swaps buffers through rebuildRef; every other
			// prop reaches the shaders as a uniform through the live ref.
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [fallback]);

		useEffect(() => {
			rebuildRef.current?.(density);
			loop.paint();
		}, [density, loop]);

		useEffect(() => {
			loop.paint();
		}, [
			grassColor, tipColor, fogColor, steelColor, wind, fog, grassHeight,
			distance, cut, autoRotate, parallax, loop,
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
			// A press on the CTA is a click, never a cut or an orbit: with capture
			// taken here, the click would land on this element instead.
			if ((e.target as HTMLElement).closest("button, a")) return;
			if (e.pointerType === "mouse" && e.button !== 0) return;
			const [nx, ny] = toNdc(e);
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
			// Only a mouse hovers; a finger on the glass is a press or a drag.
			if (e.pointerType === "mouse") {
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
					// The camera moves, so drag down raises the eye and the top
					// of the sword tips toward the viewer.
					const dYaw = -dx * 0.0055;
					const dElev = dy * 0.0032;
					const [lo, hi] = elevBand.current;
					o.yaw += dYaw;
					o.elev = clamp(o.elev + dElev, lo, hi);
					// Velocity from the last segment only: an average over the
					// whole drag would fling a slow, careful release.
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
			if (!cancelled && pr.down && !pr.moved) {
				pr.tap = { nx: pr.nx, ny: pr.ny };
			}
			const o = orbit.current;
			// A pointer that rested before it let go throws nothing.
			if (e.timeStamp - o.lastT > 90) {
				o.vYaw = 0;
				o.vElev = 0;
			}
			pr.down = false;
			pr.moved = false;
			pr.pointerId = -1;
			o.dragging = false;
			loop.start();
		};

		const onPointerLeave = (e: React.PointerEvent<HTMLDivElement>) => {
			if (press.current.down) return;
			if (e.pointerType === "mouse") hover.current.inside = false;
			loop.start();
		};

		// The call-to-action draws the sword, then hands off to the caller. A
		// halted loop takes no request: it would fire late, on resume.
		const onCta = () => {
			if (!pausedRef.current) {
				drawRequest.current = true;
				loop.start();
			}
			if (!reducedMotion) {
				ctaRingRef.current?.animate(
					[
						{ opacity: 0.9, transform: "scale(1)" },
						{ opacity: 0, transform: "scale(1.3, 2.1)" },
					],
					{ duration: 750, easing: "cubic-bezier(0.22,1,0.36,1)" },
				);
			}
			onCtaClick?.();
		};

		// Copy rises in with a stagger; reduced motion renders the final state
		// immediately. Inline styles keep the entrance inside the pasted file.
		const rise = (i: number): React.CSSProperties =>
			reducedMotion
				? {}
				: {
						opacity: entered ? 1 : 0,
						transform: entered ? "none" : "translateY(14px)",
						transition: `opacity 800ms cubic-bezier(0.22,1,0.36,1) ${i * 120}ms, transform 800ms cubic-bezier(0.22,1,0.36,1) ${i * 120}ms`,
					};

		const grainAmount = clamp(grain, 0, 1);
		const inset = "max(14px,3.2cqi)";

		const cross = (
			<svg
				viewBox="0 0 24 24"
				width={24}
				height={24}
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
				className="size-[max(10px,1.5cqi)]"
			>
				<path d="M12 2v20M2 12h20" />
			</svg>
		);

		const overlay = (
			<>
				{grainAmount > 0 ? (
					<div aria-hidden className="pointer-events-none absolute inset-0 z-10">
						<div
							className="absolute inset-0 mix-blend-overlay"
							style={{ backgroundImage: GRAIN_URL, opacity: grainAmount * 0.9 }}
						/>
						<div
							className="absolute inset-0"
							style={{
								backgroundImage: `radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 48%, rgba(4,8,9,${(grainAmount * 0.75).toFixed(2)}) 100%)`,
							}}
						/>
					</div>
				) : null}

				{frame ? (
					<div aria-hidden className="pointer-events-none absolute inset-0 z-10 text-white/60">
						<div
							className="absolute flex items-center gap-[max(6px,0.9cqi)]"
							style={{ left: inset, top: inset }}
						>
							<span className="block h-px w-[max(56px,15cqi)] bg-current" />
							<span
								className="block h-[max(3px,0.42cqi)] w-[max(24px,4.4cqi)]"
								style={{
									backgroundImage:
										"radial-gradient(circle, currentColor 0 46%, transparent 52%)",
									backgroundSize: "20% 100%",
								}}
							/>
						</div>
						<span
							className="absolute hidden h-px w-[34%] opacity-70 [@container(orientation:landscape)]:block"
							style={{
								left: inset,
								top: "23%",
								backgroundImage:
									"repeating-linear-gradient(90deg, currentColor 0 2px, transparent 2px 5px)",
							}}
						/>
						<div
							className="absolute top-[46%] hidden w-[max(140px,33cqi)] [@container(orientation:landscape)]:block"
							style={{ right: inset }}
						>
							<span className="block h-px w-full bg-current opacity-70" />
							<span
								className="mt-[max(4px,0.6cqi)] block h-[max(5px,0.7cqi)] w-full"
								style={{
									backgroundImage:
										"repeating-linear-gradient(90deg, currentColor 0 1px, transparent 1px 5%)",
								}}
							/>
							<span
								className="mt-[max(4px,0.6cqi)] block h-px w-full opacity-70"
								style={{
									backgroundImage:
										"repeating-linear-gradient(90deg, currentColor 0 2px, transparent 2px 5px)",
								}}
							/>
						</div>
						<span className="absolute bottom-[14%]" style={{ left: inset }}>
							{cross}
						</span>
						<span className="absolute top-[24%]" style={{ right: inset }}>
							{cross}
						</span>
						<span
							className="absolute block h-px w-[max(48px,13cqi)] bg-current"
							style={{ left: inset, bottom: inset }}
						/>
					</div>
				) : null}

				<div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-end bg-[linear-gradient(0deg,rgba(6,10,10,0.5),rgba(6,10,10,0)_44%)] px-[max(20px,5cqi)] pb-[max(20px,4.2cqi)] text-center">
					{title ? (
						<h1
							className="font-serif text-[max(22px,4.1cqi)] leading-none font-normal tracking-[0.5em] text-white/90 uppercase indent-[0.5em]"
							style={rise(0)}
						>
							{title}
						</h1>
					) : null}
					{subtitle ? (
						<p
							className="mt-[max(10px,1.5cqi)] max-w-[max(240px,46cqi)] text-[max(9px,1.05cqi)] leading-relaxed tracking-[0.32em] text-white/65 uppercase indent-[0.32em]"
							style={rise(1)}
						>
							{subtitle}
						</p>
					) : null}
					{ctaLabel ? (
						<div className="relative mt-[max(14px,2.2cqi)]" style={rise(2)}>
							<span
								ref={ctaRingRef}
								aria-hidden
								className="pointer-events-none absolute inset-0 border border-white opacity-0"
							/>
							<button
								type="button"
								onClick={onCta}
								className="pointer-events-auto relative cursor-pointer border border-white/55 bg-black/15 px-[max(20px,2.8cqi)] py-[max(8px,1cqi)] text-[max(9px,1.05cqi)] font-medium tracking-[0.3em] text-white uppercase indent-[0.3em] transition-colors duration-300 hover:border-white hover:bg-white hover:text-black active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/80"
							>
								{ctaLabel}
							</button>
						</div>
					) : null}
				</div>
			</>
		);

		const rootClass = [
			"relative h-full w-full cursor-default overflow-hidden select-none @container-size [&_canvas]:touch-none",
			className,
		]
			.filter(Boolean)
			.join(" ");

		if (fallback) {
			// The poster: pale mist over a dark band of field, and a single thin
			// stroke where the sword stands.
			return (
				<div
					className={rootClass}
					style={{
						backgroundColor: fogColor,
						backgroundImage: `linear-gradient(98deg, transparent 49.4%, color-mix(in srgb, ${steelColor} 80%, transparent) 49.6%, color-mix(in srgb, ${steelColor} 80%, transparent) 50.2%, transparent 50.4%), linear-gradient(180deg, color-mix(in srgb, ${fogColor} 88%, black) 0%, color-mix(in srgb, ${fogColor} 70%, white) 34%, color-mix(in srgb, ${tipColor} 45%, ${fogColor}) 46%, ${grassColor} 100%)`,
						backgroundSize: "100% 62%, 100% 100%",
						backgroundPosition: "0 8%, 0 0",
						backgroundRepeat: "no-repeat",
					}}
				>
					{overlay}
				</div>
			);
		}

		return (
			<div
				ref={containerRef}
				// A size container, not the default inline-size one: the frame's
				// orientation query needs the block axis, and cqi still resolves.
				// select-none because the drag surface holds text: a drag across
				// the copy would select it, and the next press would start a
				// native drag-and-drop instead of an orbit.
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

Kusanagi.displayName = "Kusanagi";

export default Kusanagi;
