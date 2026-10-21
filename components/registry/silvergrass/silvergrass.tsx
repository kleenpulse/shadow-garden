"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Camera, Geometry, Mesh, Program, Renderer, Transform, Triangle } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A moonlit field of silver grass, seen from just above the plumes, with the
// wind rolling through it in bands you can watch travel. Every blade is one
// instance of a single tapered mesh; the whole field is three draw calls.
//
// The field is infinite but holds a fixed number of blades. Each blade owns an
// offset inside a square tile, and the vertex shader places it at the periodic
// image of that offset nearest a region centre that rides a little ahead of
// the camera. A blade only ever jumps by one tile width, and only at the tile
// edge, which sits behind the camera or deep in the mist; the last metres of
// the tile also shrink to nothing, so a wrap never pops even on an ultra-wide
// frame. The ground and the sky come from ONE fullscreen pass that rebuilds
// each pixel's view ray from the same camera basis and lens shift the blades
// project with, then hits the analytic plane y = 0. Blades, ground and sky all
// fog toward one shared mist() function, so the far field has no edge to find.
//
// Wind is the scene. A tileable value-noise fbm scrolls along a world-fixed
// wind direction, and its scroll offsets wrap on the CPU at the noise's exact
// period, so the field never decays however long it runs. A travelling sine
// band rides on top of it to give the eye clear wave fronts. Bend is one
// vector per blade (static lean, wind, flutter, the pointer, the downdraft and
// up to four gust rings), soft-clamped so a blade can lie down but never fold
// through the ground; the height drops as the bend grows so nothing stretches.
// Strongly bent blades twist to face the wind, which is what real grass does,
// and the gloss on their upturned faces is what makes a gust read as moving
// light.
//
// The moon and its light are anchored to the camera's YAW (the same reason as
// Monolith's sun: a world-fixed light swings behind the viewer for half of
// every orbit). The field is therefore always backlit, and the plumes always
// glow. Its height stays world-fixed, so looking down hides it the way it
// should. The wind direction stays world-fixed too, so turning the view
// visibly changes how the gusts cross the frame.
//
// The CAMERA orbits here (eye on a sphere around a point half a metre above
// the ground), so the vertical drag is negated relative to geometry-rotating
// heroes: drag down raises the eye and looks further down over the field.
// Elevation lives inside a hero band, from just over the tallest plumes to
// about 40 degrees. Hover, press and click all act on the ground point under
// the pointer, found with a CPU ray through exactly the projection the scene
// renders with.
export interface SilvergrassProps {
	/** Headline. An empty string removes the element. */
	title?: string;
	/** Supporting line under the headline. An empty string removes it. */
	subtitle?: string;
	/** Call-to-action label. An empty string removes the button. */
	ctaLabel?: string;
	/** Click handler for the call-to-action. */
	onCtaClick?: () => void;
	/** How many blades, in fixed steps. Each step rebuilds the blade buffer. */
	density?: "16000" | "32000" | "64000";
	/** Color of the moonlit blade tips. */
	tipColor?: string;
	/** Color of the blades near the ground. */
	bladeColor?: string;
	/** Light around the pointer and in each ring of wind. */
	glowColor?: string;
	/** Night sky, and the fog that hides the far field. */
	skyColor?: string;
	/** How fast the wind rolls across the field. */
	windSpeed?: number;
	/** How far the blades bend in the wind. */
	windStrength?: number;
	/** Blade height multiplier. */
	bladeHeight?: number;
	/** How wide the grass parts around the pointer, in meters. 0 turns it off. */
	partRadius?: number;
	/** A click or tap sends a ring of wind out through the field. */
	gust?: boolean;
	/** Show the moon. Off keeps only its light. */
	moon?: boolean;
	/** Small points of light drifting over the grass. */
	motes?: boolean;
	/** Camera distance multiplier. */
	zoom?: number;
	/** Slow camera drift while nothing is held. */
	autoSpin?: boolean;
	/** Halt the loop. The field freezes mid-gust. */
	paused?: boolean;
	/** Settles the field into a still pose: no wind, no drift, no rings. */
	reducedMotion?: boolean;
	/** Extra classes for the root element, appended to the base classes. */
	className?: string;
}

export type SilvergrassDensity = NonNullable<SilvergrassProps["density"]>;

const DENSITIES: Record<SilvergrassDensity, number> = {
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
// How far ahead of the camera the region centre rides: the tile edge then sits
// ~6 m behind the eye and ~26 m ahead of it, past full fog.
const REGION_LEAD = 0.3 * TILE;
// Wind noise: lattice cells per metre, and the lattice period the scroll wraps
// at. 16 cells of 6 m repeat every 96 m, far past anything the mist lets show.
const NOISE_FREQ = 1 / 6;
const NOISE_PERIOD = 16;
// The travelling band: one wave front every 9 m.
const BAND_K = TAU / 9;
// Metres per second at windSpeed 1. The preview's wind readout uses it too.
const WIND_MPS = 3.2;
// World-fixed wind heading. At the resting yaw the gusts cross the frame from
// the far left toward the near right.
const WIND_ANGLE = 0.62;
const WIND_DIR: [number, number] = [Math.cos(WIND_ANGLE), Math.sin(WIND_ANGLE)];

const RING_SPEED = 6.5;
const RING_LIFE = 3.6;
const RINGS = 4;
// Movement under this many CSS pixels is still a press (a click or a tap).
const DRAG_PX = 6;

const BASE_DIST = 5.5;
const TARGET_Y = 0.5;
// The tallest plumes stand ~1.45 m at bladeHeight 1. The lowest eye sits a
// little above them so no blade ever reaches the lens.
const CANOPY_TOP = 1.45;
const ELEV_MAX = 0.7;
const ELEV_REST = 0.25;
const IDLE_SPIN = 0.03;
// Mist density. Full by ~27 m, which is where the tile edge can first appear.
const FOG_K = 0.085;
// Moonlight is lifted a little above the disc so the canopy tops catch some
// of it. A light on the true, low moon would only ever rim the field.
const LIGHT_LIFT = 0.32;
const MOON_RADIUS = 0.021;

const MOTE_COUNT = 180;
const MOTE_BOX = 22;
// One full drift cycle of the motes, in seconds. Their laps are whole numbers
// per cycle, so the wrap of this phase is invisible.
const MOTE_CYCLE = 600;

const BLADE_LEVELS = [0, 0.2, 0.4, 0.57, 0.72, 0.86, 1];

const hexToRgb01 = (hex: string): [number, number, number] => {
	const h = hex.replace("#", "");
	const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
	const n = parseInt(full, 16);
	if (Number.isNaN(n) || full.length !== 6) return [1, 1, 1];
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const mixRgb = (
	a: [number, number, number],
	b: [number, number, number],
	t: number,
): [number, number, number] => [
	a[0] + (b[0] - a[0]) * t,
	a[1] + (b[1] - a[1]) * t,
	a[2] + (b[2] - a[2]) * t,
];

const luma = (c: [number, number, number]) =>
	0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

const smooth01 = (x: number) => {
	const t = Math.min(1, Math.max(0, x));
	return t * t * (3 - 2 * t);
};

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

// One blade: a strip of quads up a unit spine, closed by a single tip vertex.
// x is the side (-1 left edge, +1 right edge, 0 at the tip), y the height
// fraction. Levels crowd toward the top, where the plume needs the shape.
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
		// Counter-clockwise seen from the side the normal cross(width, spine)
		// points to, so gl_FrontFacing says which face the viewer sees.
		index.push(l0, r0, l1, r0, r1, l1);
	}
	const lt = quads * 2;
	index.push(lt, lt + 1, lt + 2);
	return { position: new Float32Array(position), index: new Uint16Array(index) };
}

// The field, as clumps. Miscanthus grows in tufts, so blades come in fans of
// 6-12 leaning out from a shared root, one or two of them flowering stems
// that carry the silver plume. Clump roots sit on a jittered grid visited in a
// shuffled order, so the field is even without being regular and any shortfall
// lands as scattered gaps rather than a missing strip.
function buildField(count: number) {
	const rand = mulberry32(0x51a7e5 ^ count);
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
		plume: number,
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
		misc[i + 1] = plume;
		misc[i + 2] = quant(1.1 + rand() * 1.5);
		misc[i + 3] = stiffness;
		n++;
	};
	for (let k = 0; k < order.length && n < count; k++) {
		const c = order[k];
		const cx = ((c % grid) + 0.1 + rand() * 0.8) * cell;
		const cz = (Math.floor(c / grid) + 0.1 + rand() * 0.8) * cell;
		// A slow swell in canopy height, so the field has rises and hollows
		// rather than reading as a mown lawn. Whole-number frequencies over the
		// tile keep it seamless across the wrap.
		const u = cx / TILE;
		const v = cz / TILE;
		const swell =
			0.86 +
			0.1 * Math.sin(TAU * (2 * u + 0.17)) * Math.sin(TAU * (v + 0.4)) +
			0.06 * Math.sin(TAU * (3 * u + 2 * v));
		const size = 6 + Math.floor(rand() * 7);
		const spread = 0.05 + rand() * 0.12;
		const plumes = rand() < 0.8 ? 1 + Math.floor(rand() * 2.2) : 0;
		for (let j = 0; j < size && n < count; j++) {
			const isPlume = j < plumes;
			const a = rand() * TAU;
			const r = Math.sqrt(rand()) * spread;
			// Leaves arch out of the clump; flowering stems stand nearly upright
			// and let the plume's weight do the bending.
			const leanAngle = a + (rand() - 0.5) * 0.8;
			const lean = isPlume ? 0.03 + rand() * 0.1 : 0.16 + rand() * 0.34;
			const height = swell * (isPlume ? 1.12 + rand() * 0.3 : 0.5 + rand() * 0.52);
			const width = isPlume ? 0.024 + rand() * 0.012 : 0.011 + rand() * 0.008;
			// A leaf's width runs across its arch, so its face looks up the way it
			// leans: that is the surface the moon finds when a gust lays it down.
			const facing = leanAngle + Math.PI / 2 + (rand() - 0.5) * 0.5;
			put(
				cx + Math.cos(a) * r,
				cz + Math.sin(a) * r,
				height,
				width,
				facing,
				leanAngle,
				lean,
				isPlume ? 1 : 0,
				isPlume ? 1.15 + rand() * 0.25 : 0.8 + rand() * 0.4,
			);
		}
	}
	while (n < count) {
		const a = rand() * TAU;
		put(
			rand() * TILE,
			rand() * TILE,
			0.5 + rand() * 0.5,
			0.011 + rand() * 0.008,
			a + Math.PI / 2,
			a,
			0.16 + rand() * 0.3,
			0,
			0.8 + rand() * 0.4,
		);
	}
	return { base, shape, misc };
}

// Motes drift with whole-number laps of their box per drift cycle (so the
// cycle's wrap returns every mote exactly where it started), roughly with the
// wind, bobbing and wandering a little.
function buildMotes(count: number) {
	const rand = mulberry32(0x6d07e5);
	const seed = new Float32Array(count * 4);
	const laps = new Float32Array(count * 4);
	for (let i = 0; i < count; i++) {
		const j = i * 4;
		seed[j] = rand();
		seed[j + 1] = rand();
		seed[j + 2] = rand();
		seed[j + 3] = rand();
		const s = 2 + rand() * 4;
		laps[j] = Math.round(WIND_DIR[0] * s);
		laps[j + 1] = Math.round(WIND_DIR[1] * s);
		laps[j + 2] = 8 + Math.floor(rand() * 18);
		laps[j + 3] = 20 + Math.floor(rand() * 40);
	}
	return { seed, laps };
}

const glf = (x: number) => (Number.isInteger(x) ? x.toFixed(1) : String(x));

// Integer hashing for the lattice and the stars. A mixer of xor-shifts and odd
// multipliers is plenty for visual noise, and integers cannot drift the way
// a sin-based hash does at large inputs.
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
// wrapped with a float floor, never the integer remainder: GLSL leaves the
// remainder of a negative int undefined.
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

// The one mist every pass fogs toward, and the one tone curve every pass ends
// on: a fogged blade, the ground behind it and the sky above the horizon all
// land on the same colour, so the far field melts away with no seam.
const MIST = `
uniform vec3 uHorizon;
uniform vec3 uMoonCol;
uniform vec3 uMoonDir;
uniform float uFogK;
uniform float uMoonOn;
// The moon's halo lives in the air, so it belongs to the mist: a fogged blade
// or a far stretch of ground under the moon carries it too. Kept only in the
// sky, it would stop dead at the horizon and draw a hard line under the moon.
vec3 halo(vec3 dir) {
  float ang = length(dir - uMoonDir);
  return uMoonCol * uMoonOn * (exp(-ang * 26.0) * 0.3 + exp(-ang * 8.0) * 0.08);
}
vec3 mist(vec3 dir) {
  float m = max(dot(dir, uMoonDir), 0.0);
  return uHorizon + uMoonCol * (pow(m, 5.0) * 0.14 + pow(m, 36.0) * 0.2) + halo(dir);
}
float fogAmount(float d) {
  float k = d * uFogK;
  return 1.0 - exp(-k * k);
}
vec3 tone(vec3 c) {
  return 1.0 - exp(-c * 1.15);
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
uniform vec3 uSky;
uniform vec3 uTip;
uniform vec3 uBladeC;
uniform vec3 uGlowC;
uniform float uPixel;
uniform float uTwinkle;
uniform vec4 uPointer;
uniform vec4 uRings[${RINGS}];
${HASH}
${MIST}

const float RING_SPEED = ${glf(RING_SPEED)};

// Sparse stars on an azimuth/elevation grid. One star at most per cell, sized
// in pixels rather than degrees so it stays a point at any resolution. The
// azimuth cell count divides the circle exactly, so the seam behind the
// viewer has no half cell.
float starfield(vec3 dir) {
  float el = asin(clamp(dir.y, 0.0, 1.0));
  float az = atan(dir.z, dir.x) + 3.14159265;
  const float AZ = 900.0;
  const float EL = 220.0;
  vec2 g = vec2(az / 6.2831853 * AZ, el / 1.5707963 * EL);
  vec2 cell = floor(g);
  vec2 f = g - floor(g);
  cell.x = cell.x - AZ * floor(cell.x / AZ);
  uvec2 id = uvec2(cell);
  float h = hash2(id);
  if (h < 0.972) return 0.0;
  vec2 at = vec2(hash2(id + uvec2(71u, 13u)), hash2(id + uvec2(5u, 97u))) * 0.6 + 0.2;
  vec2 rad = (f - at) * vec2(6.2831853 / AZ * cos(el), 1.5707963 / EL);
  float r = length(rad) / uPixel;
  float mag = pow((h - 0.972) / 0.028, 3.0);
  // Twinkle rates on the 0.01 grid, so the wrapped clock never skips.
  float rate = 1.0 + floor(hash2(id + uvec2(3u, 211u)) * 200.0) * 0.01;
  float tw = 0.72 + 0.28 * sin(uTwinkle * rate + h * 40.0);
  return exp(-r * r * 0.8) * (0.22 + 1.3 * mag) * tw;
}

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
    // component by infinity (that NaN would print as a black pixel).
    float tHit = min(-uCamPos.y / dir.y, 4000.0);
    vec2 hit = uCamPos.xz + dir.xz * tHit;
    float d = length(hit - uCamPos.xz);
    // Bare soil up close; further out it takes the canopy's average colour,
    // so the gaps between distant blades never flicker against black.
    vec3 soil = uBladeC * 0.16;
    vec3 canopy = mix(uBladeC, uTip, 0.32) * (uHorizon * 0.5 + uSky * 0.7 + uMoonCol * 0.18);
    vec3 ground = mix(soil, canopy, smoothstep(3.0, 14.0, d));
    // A faint pool of the glow colour where the grass parts, and a thin line
    // of it under each ring of wind.
    vec2 dp = hit - uPointer.xy;
    float R = max(uPointer.z, 1e-3);
    float lit = uPointer.w * exp(-dot(dp, dp) / (R * R)) * 0.16;
    for (int i = 0; i < ${RINGS}; i++) {
      vec4 g = uRings[i];
      if (g.w <= 0.0) continue;
      float since = g.z - length(hit - g.xy) / RING_SPEED;
      lit += exp(-since * since * 60.0) * g.w * exp(-g.z * 0.55) * 0.14;
    }
    ground += uGlowC * lit;
    col = mix(ground, mist(dir), fogAmount(d));
  } else {
    float h = dir.y;
    // Mist at the horizon easing up into the night. The ramp leaves the
    // horizon with a finite slope; a steeper one reads as a second edge.
    // The halo rides on both ends so it keeps its full strength up here.
    float s = clamp(h / 0.45, 0.0, 1.0);
    col = mix(mist(dir), uSky + halo(dir), s * (2.0 - s));
    float ang = length(dir - uMoonDir);
    float stars = starfield(dir) * smoothstep(0.02, 0.16, h) * smoothstep(0.04, 0.22, ang);
    col += mix(vec3(1.0), uTip, 0.35) * stars;
    if (uMoonOn > 0.5) {
      // The disc over the halo: a hard limb one pixel and a half wide, a
      // darker sea or two, and a rim brighter than the centre.
      float cover = 1.0 - smoothstep(${glf(MOON_RADIUS)} - uPixel * 1.5, ${glf(MOON_RADIUS)}, ang);
      if (cover > 0.0) {
        vec3 mr = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
        vec3 mu = cross(mr, uMoonDir);
        vec2 p = vec2(dot(dir - uMoonDir, mr), dot(dir - uMoonDir, mu)) / ${glf(MOON_RADIUS)};
        float rim = sqrt(max(1.0 - dot(p, p), 0.0));
        float seas = pnoise(p * 2.2 + 4.0, 64.0) * 0.6 + pnoise(p * 4.6 + 9.0, 64.0) * 0.4;
        float shade = 0.8 + 0.2 * rim - 0.2 * smoothstep(0.42, 0.72, seas);
        col = mix(col, uMoonCol * 2.4 * shade, cover);
      }
    }
  }
  col = tone(col);
  // A hair of dither: the night gradient is dark enough to band otherwise.
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
uniform vec4 uPointer;
uniform vec4 uDown;
uniform vec4 uRings[${RINGS}];
uniform float uFocal;
uniform float uFogK;
out vec3 vWorld;
out vec3 vNormal;
out float vT;
out float vSide;
out float vTint;
out float vPlume;
out float vSheen;
out float vGlow;
out float vFar;
${HASH}

const float TILE = ${glf(TILE)};
const float NOISE_FREQ = ${glf(NOISE_FREQ)};
const float PERIOD = ${glf(NOISE_PERIOD)};
const float BAND_K = ${glf(BAND_K)};
const float RING_SPEED = ${glf(RING_SPEED)};

// A leaf: narrow at the sheath, widest a fifth of the way up, then a long
// taper to the point.
float leafWidth(float t) {
  return (0.68 + 0.32 * min(t * 4.0, 1.0)) * pow(1.0 - t, 0.75);
}
// A flowering stem: a thin culm, then the plume as a spindle over the top
// part. max() keeps pow away from the tiny negative sin(pi) can return.
float plumeWidth(float t) {
  float s = clamp((t - 0.55) / 0.45, 0.0, 1.0);
  return 0.26 + 1.9 * pow(max(sin(3.14159265 * s), 0.0), 0.7);
}

void main() {
  // The periodic image of this blade's tile offset nearest the region centre.
  vec2 off = aBase.xy;
  vec2 base = off + TILE * floor((uCenter - off) / TILE + 0.5);
  // Blades shrink to nothing over the last metres of the tile, so the one
  // that wraps is invisible on both sides of its jump.
  vec2 rel = abs(base - uCenter);
  float edge = TILE * 0.5 - max(rel.x, rel.y);
  float H = aBase.z * uHeight * smoothstep(0.0, 2.5, edge);
  float dh = length(base - cameraPosition.xz);
  float zView = (viewMatrix * vec4(base.x, 0.0, base.y, 1.0)).z;
  // Collapse whatever can never be seen: shrunk at the edge, past full fog,
  // behind the eye by more than its own length, or right under the camera.
  // Every vertex of the blade lands on the same point outside the clip
  // volume, so it costs no fill at all.
  if (H < 0.01 || dh * uFogK > 2.6 || zView > H + 0.6 || dh < 0.35) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }

  // Wind, sampled once per blade at its root. Three octaves of tileable noise
  // scroll downwind at different speeds (each wraps at its own period), so
  // the gust pattern changes shape as it travels instead of sliding past as a
  // rigid texture.
  vec2 across = vec2(-uWind.y, uWind.x);
  float along = dot(base, uWind);
  vec2 q = vec2(along, dot(base, across)) * NOISE_FREQ;
  float n1 = pnoise(q - vec2(uScroll.x, 0.0), PERIOD);
  float n2 = pnoise(q * 2.0 - vec2(uScroll.y * 2.0, 0.0) + vec2(7.3, 2.9), PERIOD * 2.0);
  float n3 = pnoise(q * 4.0 - vec2(uScroll.z * 4.0, 0.0) + vec2(1.7, 9.1), PERIOD * 4.0);
  float gust = n1 * 0.58 + n2 * 0.29 + n3 * 0.13;
  // The wave fronts: a sharpened travelling sine, bent by the noise so no
  // front is a ruled line, and strongest where the gust field is up.
  float front = 0.5 + 0.5 * sin(along * BAND_K - uBand + (n2 - 0.5) * 4.0);
  front = front * front * front;
  float push = uWindAmt * (0.1 + 0.5 * smoothstep(0.32, 0.86, gust) + 0.46 * front * mix(0.3, 1.0, smoothstep(0.25, 0.7, n1)));
  float veer = (n3 - 0.5) * 0.8;
  vec2 wdir = vec2(uWind.x * cos(veer) - uWind.y * sin(veer), uWind.x * sin(veer) + uWind.y * cos(veer));

  vec2 bend = aShape.yz + wdir * push * aMisc.w;

  // Flutter on the wrapped clock (per-blade rates on the 0.01 grid), livelier
  // in a gust, and a slow breath that survives even with the wind at zero.
  float ph = aShape.w;
  float rate = aMisc.z;
  float lively = (0.3 + uWindAmt * 0.7) * (0.6 + push);
  bend += (across * sin(uFlutter * rate + ph) * 0.055 + wdir * sin(uFlutter * rate * 3.0 + ph * 1.7) * 0.03) * lively;
  bend += across * sin(uFlutter * 0.37 + ph) * 0.025;

  // The pointer parts the grass: a gaussian push straight away from the
  // ground point, strong enough at the centre to lay the blades down. The
  // push fades to zero right at the point, where away has no direction.
  vec2 dp = base - uPointer.xy;
  float rp = length(dp);
  float R = max(uPointer.z, 1e-3);
  float part = uPointer.w * exp(-(rp * rp) / (R * R));
  bend += dp / max(rp, 0.12 * R + 0.03) * part * 1.25;

  // The downdraft: a held press bows the blades out of a disc that widens
  // with the hold, and shakes them a little while it blows.
  vec2 dd = base - uDown.xy;
  float rd = length(dd);
  float draft = uDown.w * (1.0 - smoothstep(uDown.z * 0.55, uDown.z, rd));
  bend += dd / max(rd, 0.1) * draft * 0.95;
  bend += across * sin(uFlutter * 7.0 + ph * 3.0) * draft * 0.07;

  // Gust rings. 'since' is how long ago the front passed this blade: before
  // it arrives a narrow leading edge, after it a damped spring that swings
  // back past upright once and settles.
  float ringGlow = 0.0;
  for (int i = 0; i < ${RINGS}; i++) {
    vec4 g = uRings[i];
    if (g.w <= 0.0) continue;
    vec2 d = base - g.xy;
    float r = length(d);
    float since = g.z - r / RING_SPEED;
    float env = g.w * exp(-g.z * 0.55);
    float resp = since < 0.0
      ? exp(-since * since * 140.0)
      : exp(-since * 2.6) * cos(since * 7.2);
    bend += d / max(r, 0.3) * resp * env * 1.35;
    ringGlow += exp(-since * since * 80.0) * env;
  }

  // Soft clamp: a blade can lie nearly flat but never fold into the ground.
  float bl = length(bend);
  float soft = 0.9 * tanh(bl / 0.9);
  bend *= soft / max(bl, 1e-5);
  bl = soft;

  // The spine: displacement grows with t squared, and the height drops as
  // the bend grows, which keeps the blade's length within a few percent.
  float t = position.y;
  float lift = sqrt(max(1.0 - bl * bl, 0.0));
  vec3 spine = vec3(base.x + bend.x * H * t * t, H * lift * t, base.y + bend.y * H * t * t);
  vec3 tangent = normalize(vec3(2.0 * bend.x * H * t, H * lift, 2.0 * bend.y * H * t));
  // A bent blade turns its flat face into the bend, the way grass does in a
  // wind; that turn, more than the bend itself, is what flashes the light.
  vec2 a0 = vec2(cos(aShape.x), sin(aShape.x));
  vec2 bdir = bend / max(bl, 1e-5);
  vec2 a1 = vec2(-bdir.y, bdir.x);
  a1 *= dot(a1, a0) < 0.0 ? -1.0 : 1.0;
  vec2 ax = normalize(mix(a0, a1, smoothstep(0.08, 0.7, bl) * (0.25 + 0.75 * t)));
  vec3 A = vec3(ax.x, 0.0, ax.y);

  float plume = aMisc.y;
  float prof = mix(leafWidth(t), plumeWidth(t), plume);
  // Never thinner than most of a device pixel: a sub-pixel blade samples as
  // on-off noise and shimmers as the wind moves it.
  float dist = length(spine - cameraPosition);
  float px = aBase.w * uFocal / max(dist, 0.05);
  float widen = max(1.0, 0.85 / max(px, 1e-4));
  vec3 world = spine + A * position.x * aBase.w * 0.5 * prof * widen;

  // A gentle crease down the midrib, so the two halves of a blade take the
  // light differently and it reads as a leaf, not a ribbon.
  vec3 N = normalize(cross(A, tangent));
  vNormal = normalize(N + A * position.x * 0.45);
  vWorld = world;
  vT = t;
  vSide = position.x;
  vTint = aMisc.x;
  vPlume = plume;
  vSheen = clamp(push * 0.9 + front * uWindAmt * 0.25, 0.0, 1.5);
  vGlow = part * 0.4 * t * t + ringGlow * 0.55 * (0.25 + 0.75 * t);
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
in float vPlume;
in float vSheen;
in float vGlow;
in float vFar;
out vec4 fragColor;
uniform vec3 cameraPosition;
uniform vec3 uTip;
uniform vec3 uBladeC;
uniform vec3 uGlowC;
uniform vec3 uSky;
uniform vec3 uLightDir;
${MIST}

void main() {
  vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = uLightDir;
  float t = vT;
  float plume = vPlume * smoothstep(0.5, 0.64, t);
  // Per-blade variety fades out with distance: far away a field is one
  // surface, and blade-to-blade contrast at a pixel or two is what shimmers.
  float tint = mix(vTint, 0.5, vFar);
  vec3 body = mix(uBladeC, uTip, pow(t, 1.4) * 0.8) * (0.8 + 0.4 * tint);
  body = mix(body, uTip, plume * 0.85);
  float ao = mix(0.16, 1.0, smoothstep(0.0, 0.62, t));
  float ndl = dot(n, L);
  float diffuse = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
  diffuse *= diffuse;
  // Backlight through the blade: strongest looking straight at the moon,
  // and through the thin tips and the plumes rather than the thick roots.
  float toward = max(dot(-V, L), 0.0);
  float thin = mix(0.12, 1.0, t * t) + plume * 1.4;
  float trans = (pow(toward, 7.0) * 1.2 + pow(toward, 2.0) * 0.25) * thin;
  // Gloss on faces turned up toward the half-vector. A gust lays blades over
  // and turns their faces up, so this is the light that rolls across the
  // field with each wave.
  vec3 hv = normalize(L + V);
  float gloss = pow(max(dot(n, hv), 0.0), 18.0);
  vec3 amb = uHorizon * 0.5 + uSky * 0.7;
  vec3 col = body * ao * (amb + uMoonCol * diffuse * 0.42);
  col += uTip * uMoonCol * trans * 0.9;
  col += uMoonCol * gloss * (0.12 + 0.55 * vSheen) * smoothstep(0.15, 0.7, t);
  col += uTip * vSheen * 0.1 * smoothstep(0.25, 1.0, t);
  col += uGlowC * vGlow;
  float d = length(vWorld.xz - cameraPosition.xz);
  col = mix(col, mist(-V), fogAmount(d));
  col = tone(col);
  // Feathered plume edges through alpha-to-coverage: order-independent, so
  // no sorting, and a plain opaque blade where multisampling is unavailable.
  float feather = 1.0 - plume * smoothstep(0.35, 1.0, abs(vSide)) * 0.75;
  fragColor = vec4(col, feather);
}`;

const MOTE_VERT = `#version 300 es
precision highp float;
in vec4 aSeed;
in vec4 aLaps;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform vec3 cameraPosition;
uniform vec2 uCenter;
uniform float uDrift;
uniform float uTwinkle;
uniform float uFocal;
uniform float uFogK;
out float vAlpha;
out float vMix;

const float BOX = ${glf(MOTE_BOX)};

void main() {
  // Whole laps of the box per drift cycle, then the periodic image nearest
  // the region centre, the same trick the blades use.
  vec2 o = fract(aSeed.xy + aLaps.xy * uDrift) * BOX;
  o += vec2(sin(6.2831853 * (aSeed.w + aLaps.z * uDrift)), cos(6.2831853 * (aSeed.z + aLaps.z * uDrift))) * 0.45;
  vec2 p = o + BOX * floor((uCenter - o) / BOX + 0.5);
  float y = 0.55 + aSeed.z * 1.7 + sin(6.2831853 * (aSeed.x + aLaps.w * uDrift)) * 0.18;
  vec4 view = viewMatrix * vec4(p.x, y, p.y, 1.0);
  float dist = -view.z;
  vec2 rel = abs(p - uCenter);
  float edge = smoothstep(0.0, 2.5, BOX * 0.5 - max(rel.x, rel.y));
  float near = smoothstep(0.5, 1.8, dist);
  float dh = length(p - cameraPosition.xz);
  float k = dh * uFogK;
  float rate = 1.0 + floor(fract(aSeed.x * 13.1) * 150.0) * 0.01;
  float tw = 0.5 + 0.5 * sin(uTwinkle * rate + aSeed.y * 6.2831853);
  vAlpha = edge * near * exp(-k * k) * (0.35 + 0.65 * tw);
  vMix = fract(aSeed.z * 3.7);
  float size = 0.05 + fract(aSeed.w * 7.13) * 0.07;
  gl_Position = projectionMatrix * view;
  gl_PointSize = clamp(size * uFocal / max(dist, 0.1), 1.5, 34.0);
  if (vAlpha < 0.003 || dist < 0.2) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
}`;

const MOTE_FRAG = `#version 300 es
precision highp float;
in float vAlpha;
in float vMix;
out vec4 fragColor;
uniform vec3 uGlowC;
uniform vec3 uTip;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d) * 4.0;
  float a = (exp(-r2 * 6.0) + exp(-r2 * 30.0) * 0.6) * (1.0 - smoothstep(0.6, 1.0, r2));
  vec3 c = mix(uGlowC, uTip, vMix);
  fragColor = vec4(c * a * vAlpha * 0.55, 1.0);
}`;

type U = Record<string, { value: unknown }>;

const Silvergrass = memo(
	({
		title = "Part the field",
		subtitle = "Every blade bends to the wind. Move, and they bend to you.",
		ctaLabel = "Walk in",
		onCtaClick,
		density = "32000",
		tipColor = "#d8d1f0",
		bladeColor = "#2b2540",
		glowColor = "#a855f7",
		skyColor = "#0a0916",
		windSpeed = 1,
		windStrength = 1,
		bladeHeight = 1,
		partRadius = 1.2,
		gust = true,
		moon = true,
		motes = true,
		zoom = 1,
		autoSpin = true,
		paused = false,
		reducedMotion = false,
		className,
	}: SilvergrassProps) => {
		const containerRef = useRef<HTMLDivElement>(null);
		const drawRef = useRef<((dt: number) => void | false) | null>(null);
		const measureRef = useRef<((m: Metrics) => void) | null>(null);
		const rebuildRef = useRef<((next: SilvergrassDensity) => void) | null>(null);
		const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(null);
		// Orbit, hover and press all live in refs written from the handlers and
		// read by the loop. React state here would re-render per pointer tick.
		const orbit = useRef({
			yaw: 0,
			elev: ELEV_REST,
			vYaw: 0,
			vElev: 0,
			dragging: false,
			lastX: 0,
			lastY: 0,
			lastT: 0,
		});
		// The live elevation band, written by the loop (it depends on zoom and
		// bladeHeight) and read by the drag handler.
		const elevBand = useRef<[number, number]>([0.2, ELEV_MAX]);
		const hover = useRef({ inside: false, nx: 0, ny: 0, x: 0, z: 0, tx: 0, tz: 0, amount: 0 });
		const press = useRef({
			down: false,
			moved: false,
			pointerId: -1,
			startX: 0,
			startY: 0,
			nx: 0,
			ny: 0,
			hold: 0,
			x: 0,
			z: 0,
			valid: false,
			amount: 0,
			radius: 0.4,
			tap: null as null | { nx: number; ny: number; hold: number },
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
			tipColor, bladeColor, glowColor, skyColor, windSpeed, windStrength, bladeHeight,
			partRadius, gust, moon, motes, zoom, autoSpin, reducedMotion,
		});
		live.current = {
			tipColor, bladeColor, glowColor, skyColor, windSpeed, windStrength, bladeHeight,
			partRadius, gust, moon, motes, zoom, autoSpin, reducedMotion,
		};

		useEffect(() => {
			const container = containerRef.current;
			if (fallback || !container) return;

			let renderer: Renderer;
			try {
				renderer = new Renderer({
					webgl: 2,
					antialias: true,
					alpha: false,
					powerPreference: "high-performance",
					dpr: Math.min(window.devicePixelRatio || 1, 2),
				});
				if (!renderer.isWebgl2) {
					// The shaders are GLSL 3.00; a WebGL1 context cannot run them.
					renderer.gl.getExtension("WEBGL_lose_context")?.loseContext();
					throw new Error("Silvergrass needs WebGL2");
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
					uTip: { value: new Float32Array(3) },
					uBladeC: { value: new Float32Array(3) },
					uGlowC: { value: new Float32Array(3) },
					uHorizon: { value: new Float32Array(3) },
					uMoonCol: { value: new Float32Array(3) },
					uMoonDir: { value: new Float32Array([0, 0.1, -1]) },
					uFogK: { value: FOG_K },
					uMoonOn: { value: 1 },
					uPixel: { value: 0.001 },
					uTwinkle: { value: 0 },
					uPointer: { value: new Float32Array(4) },
					// ogl drops a typed array on an array uniform; it must be plain.
					uRings: { value: new Array<number>(RINGS * 4).fill(0) },
				},
			});
			const bladeProgram = new Program(glc, {
				vertex: BLADE_VERT,
				fragment: BLADE_FRAG,
				// Grass is seen from both sides; the fragment shader flips the
				// normal toward the viewer with gl_FrontFacing.
				cullFace: false,
				uniforms: {
					uCenter: { value: new Float32Array(2) },
					uWind: { value: new Float32Array(WIND_DIR) },
					uWindAmt: { value: 1 },
					uScroll: { value: new Float32Array(3) },
					uBand: { value: 0 },
					uFlutter: { value: 0 },
					uHeight: { value: 1 },
					uPointer: { value: new Float32Array(4) },
					uDown: { value: new Float32Array(4) },
					uRings: { value: new Array<number>(RINGS * 4).fill(0) },
					uFocal: { value: 1000 },
					uFogK: { value: FOG_K },
					uTip: { value: new Float32Array(3) },
					uBladeC: { value: new Float32Array(3) },
					uGlowC: { value: new Float32Array(3) },
					uSky: { value: new Float32Array(3) },
					uLightDir: { value: new Float32Array([0, 0.3, -1]) },
					uHorizon: { value: new Float32Array(3) },
					uMoonCol: { value: new Float32Array(3) },
					uMoonDir: { value: new Float32Array([0, 0.1, -1]) },
					uMoonOn: { value: 1 },
				},
			});
			const moteProgram = new Program(glc, {
				vertex: MOTE_VERT,
				fragment: MOTE_FRAG,
				transparent: true,
				// Blades occlude the motes; the motes never occlude each other.
				depthWrite: false,
				uniforms: {
					uCenter: { value: new Float32Array(2) },
					uDrift: { value: 0 },
					uTwinkle: { value: 0 },
					uFocal: { value: 1000 },
					uFogK: { value: FOG_K },
					uGlowC: { value: new Float32Array(3) },
					uTip: { value: new Float32Array(3) },
				},
			});
			// Light only adds: a mote can brighten the field, never stain it.
			moteProgram.setBlendFunc(glc.ONE, glc.ONE);

			const programs = [skyProgram, bladeProgram, moteProgram];
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
			// and every program survive, so the change lands on the next frame
			// with no blank one in between.
			rebuildRef.current = (next) => {
				if (next === built) return;
				built = next;
				const old = blades.geometry;
				blades.geometry = makeBlades(DENSITIES[next] ?? 32000);
				old.remove();
			};

			const moteData = buildMotes(MOTE_COUNT);
			const moteGeometry = new Geometry(glc, {
				aSeed: { size: 4, data: moteData.seed },
				aLaps: { size: 4, data: moteData.laps },
			});
			const moteMesh = new Mesh(glc, {
				geometry: moteGeometry,
				program: moteProgram,
				mode: glc.POINTS,
				frustumCulled: false,
			});
			moteMesh.setParent(scene);

			const su = skyProgram.uniforms as U;
			const bu = bladeProgram.uniforms as U;
			const mu = moteProgram.uniforms as U;
			const vec = (u: U, key: string) => u[key].value as Float32Array;
			const num = (u: U, key: string, v: number) => {
				(u[key] as { value: number }).value = v;
			};
			const skyRings = su.uRings.value as number[];
			const bladeRings = bu.uRings.value as number[];

			// Wrapped phases. Each one is bounded, so nothing drifts in float32.
			const scroll = [0, 0, 0];
			let band = 0;
			let flutter = 0;
			let drift = 0;
			let twinkle = 0;

			// Projection state, written by measure and shared with the ray caster.
			let aspect = 1;
			let tanHalf = Math.tan((44 * Math.PI) / 360);
			let focal = 1000;
			const shift: [number, number] = [0, 0];
			const moonAt: [number, number] = [0.6, 0.6];

			// This frame's camera, kept for the pointer rays.
			const eye = [0, 2, 5];
			const right = [1, 0, 0];
			const up = [0, 1, 0];
			const fwd = [0, 0, -1];
			const center = [0, 0];
			const moonDir = [0, 0.1, -1];
			const lightDir = [0, 0.3, -1];

			const rings = Array.from({ length: RINGS }, () => ({ x: 0, z: 0, age: 0, s: 0 }));

			// A ray through the pointer's NDC with the exact projection the scene
			// renders with (basis, aspect, field of view, lens shift), hit on y = 0.
			const groundHit = (nx: number, ny: number): [number, number] | null => {
				const dx = (nx - shift[0]) * aspect * tanHalf;
				const dy = (ny - shift[1]) * tanHalf;
				const rx = fwd[0] + right[0] * dx + up[0] * dy;
				const ry = fwd[1] + right[1] * dx + up[1] * dy;
				const rz = fwd[2] + right[2] * dx + up[2] * dy;
				if (ry > -1e-4) return null;
				const t = -eye[1] / ry;
				const hx = eye[0] + rx * t;
				const hz = eye[2] + rz * t;
				if (Math.hypot(hx - eye[0], hz - eye[2]) > 40) return null;
				return [hx, hz];
			};

			drawRef.current = (dt) => {
				const l = live.current;
				const o = orbit.current;
				const hv = hover.current;
				const pr = press.current;
				const step = Math.min(dt, 1 / 30);
				const frozen = pausedRef.current;
				// Still: no wind, no drift, no idle phase. Paused freezes the
				// interactions too; reduced motion lets them ease, since they
				// answer the visitor's own hand.
				const still = frozen || l.reducedMotion;
				const ease = frozen ? 0 : step;

				if (!still) {
					const speed = WIND_MPS * l.windSpeed;
					scroll[0] = (scroll[0] + step * speed * NOISE_FREQ) % NOISE_PERIOD;
					scroll[1] = (scroll[1] + step * speed * NOISE_FREQ * 1.37) % NOISE_PERIOD;
					scroll[2] = (scroll[2] + step * speed * NOISE_FREQ * 0.71) % NOISE_PERIOD;
					band = (band + step * speed * BAND_K) % PHASE_WRAP;
					flutter = (flutter + step * (1 + 1.2 * l.windSpeed)) % PHASE_WRAP;
					drift = (drift + step / MOTE_CYCLE) % 1;
					twinkle = (twinkle + step) % PHASE_WRAP;
				}

				// Orbit: the fling coasts first, then the idle drift takes over as
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
					if (l.autoSpin && !pr.down) {
						o.yaw += IDLE_SPIN * step * (1 - Math.min(1, Math.abs(o.vYaw) / 0.06));
					}
					o.yaw %= TAU;
				}
				// The band: the lowest eye clears the tallest plumes, the highest
				// looks down at about 40 degrees. Never under the ground, never
				// top-down.
				const dist = BASE_DIST * l.zoom;
				const top = CANOPY_TOP * l.bladeHeight + 0.3;
				const elevMin = Math.asin(
					Math.min(Math.max((top - TARGET_Y) / dist, 0.04), Math.sin(ELEV_MAX - 0.06)),
				);
				elevBand.current = [elevMin, ELEV_MAX];
				o.elev = Math.min(ELEV_MAX, Math.max(elevMin, o.elev));

				const ce = Math.cos(o.elev);
				const sinYaw = Math.sin(o.yaw);
				const cosYaw = Math.cos(o.yaw);
				eye[0] = dist * ce * sinYaw;
				eye[1] = TARGET_Y + dist * Math.sin(o.elev);
				eye[2] = dist * ce * cosYaw;
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

				// The moon: the direction of a fixed point of the frame for a camera
				// at the lowest resting elevation the band allows and the CURRENT
				// yaw. It follows every turn, sits upper right at rest, and slides
				// out of the top of the frame as the eye rises, like a real moon.
				{
					const restElev = Math.max(ELEV_REST, elevMin);
					const cr = Math.cos(restElev);
					const sr = Math.sin(restElev);
					const bx = cr * sinYaw;
					const bz = cr * cosYaw;
					const rx = cosYaw;
					const rz = -sinYaw;
					const ux = sr * rz;
					const uy = bz * rx - bx * rz;
					const uz = -sr * rx;
					const dx = (moonAt[0] - shift[0]) * aspect * tanHalf;
					const dy = (moonAt[1] - shift[1]) * tanHalf;
					let mx = -bx + rx * dx + ux * dy;
					let my = -sr + uy * dy;
					let mz = -bz + rz * dx + uz * dy;
					const ml = Math.hypot(mx, my, mz) || 1;
					mx /= ml; my /= ml; mz /= ml;
					moonDir[0] = mx; moonDir[1] = my; moonDir[2] = mz;
					const ly = my + LIGHT_LIFT;
					const ll = Math.hypot(mx, ly, mz) || 1;
					lightDir[0] = mx / ll; lightDir[1] = ly / ll; lightDir[2] = mz / ll;
				}

				// Hover: the parting eases in on enter, out on leave, and follows
				// the pointer's ground point a beat behind it. A fresh entry starts
				// where the pointer is rather than sliding over from the last exit.
				let want = 0;
				if (hv.inside && l.partRadius > 0) {
					const hit = groundHit(hv.nx, hv.ny);
					if (hit) {
						hv.tx = hit[0];
						hv.tz = hit[1];
						want = 1;
					}
				}
				if (hv.amount < 0.01 && want > 0) {
					hv.x = hv.tx;
					hv.z = hv.tz;
				}
				hv.amount += (want - hv.amount) * (1 - Math.exp(-ease * (want > hv.amount ? 5.5 : 2.6)));
				const follow = 1 - Math.exp(-ease * 12);
				hv.x += (hv.tx - hv.x) * follow;
				hv.z += (hv.tz - hv.z) * follow;

				// Downdraft: a held press widens its disc for about a second.
				const holding = pr.down && !pr.moved;
				if (holding) {
					pr.hold = Math.min(pr.hold + ease, 3);
					const hit = groundHit(pr.nx, pr.ny);
					if (hit) {
						pr.x = hit[0];
						pr.z = hit[1];
						pr.valid = true;
					}
					pr.radius = 0.45 + 1.9 * smooth01(pr.hold);
				}
				const dWant = holding && pr.valid ? 1 : 0;
				pr.amount += (dWant - pr.amount) * (1 - Math.exp(-ease * (dWant > pr.amount ? 5 : 2.4)));

				// A release that never became a drag: a ring of wind. A quick
				// click still makes a clear one; a long hold makes a stronger one.
				if (pr.tap) {
					const tap = pr.tap;
					pr.tap = null;
					if (l.gust && !l.reducedMotion) {
						const hit = groundHit(tap.nx, tap.ny);
						if (hit) {
							let slot = 0;
							for (let i = 1; i < RINGS; i++) {
								const a = rings[i];
								const b = rings[slot];
								if (b.s > 0 && (a.s <= 0 || a.age > b.age)) slot = i;
							}
							const r = rings[slot];
							r.x = hit[0];
							r.z = hit[1];
							r.age = 0;
							r.s = 0.7 + 0.55 * smooth01(tap.hold);
						}
					}
				}
				let ringsLive = false;
				for (let i = 0; i < RINGS; i++) {
					const r = rings[i];
					if (r.s > 0) {
						r.age += ease;
						if (r.age > RING_LIFE) r.s = 0;
					}
					const fade = r.s > 0 ? 1 - smooth01((r.age - RING_LIFE * 0.7) / (RING_LIFE * 0.3)) : 0;
					ringsLive = ringsLive || r.s > 0;
					const j = i * 4;
					skyRings[j] = bladeRings[j] = r.x;
					skyRings[j + 1] = bladeRings[j + 1] = r.z;
					skyRings[j + 2] = bladeRings[j + 2] = r.age;
					skyRings[j + 3] = bladeRings[j + 3] = r.s * fade;
				}

				const tip = hexToRgb01(l.tipColor);
				const bladeC = hexToRgb01(l.bladeColor);
				const glowC = hexToRgb01(l.glowColor);
				const skyC = hexToRgb01(l.skyColor);
				// The horizon: the sky lifted toward the moonlit tips, a breath of
				// the glow in it. Everything fogs toward this.
				const horizon = mixRgb(mixRgb(skyC, tip, 0.24), glowC, 0.04);
				const moonCol = mixRgb([1, 1, 1], tip, 0.3);
				const pointer = [hv.x, hv.z, Math.max(l.partRadius, 0.001), l.partRadius > 0 ? hv.amount : 0];

				for (const u of [su, bu]) {
					vec(u, "uTip").set(tip);
					vec(u, "uBladeC").set(bladeC);
					vec(u, "uGlowC").set(glowC);
					vec(u, "uSky").set(skyC);
					vec(u, "uHorizon").set(horizon);
					vec(u, "uMoonCol").set(moonCol);
					vec(u, "uMoonDir").set(moonDir);
					vec(u, "uPointer").set(pointer);
					num(u, "uMoonOn", l.moon ? 1 : 0);
				}
				vec(su, "uCamPos").set(eye);
				vec(su, "uRight").set(right);
				vec(su, "uUp").set(up);
				vec(su, "uFwd").set(fwd);
				vec(su, "uShift").set(shift);
				num(su, "uTanHalf", tanHalf);
				num(su, "uAspect", aspect);
				num(su, "uPixel", 1 / focal);
				num(su, "uTwinkle", twinkle);

				vec(bu, "uCenter").set(center);
				vec(bu, "uScroll").set(scroll);
				vec(bu, "uLightDir").set(lightDir);
				vec(bu, "uDown").set([pr.x, pr.z, pr.radius, pr.amount]);
				num(bu, "uWindAmt", l.windStrength);
				num(bu, "uBand", band);
				num(bu, "uFlutter", flutter);
				num(bu, "uHeight", l.bladeHeight);
				num(bu, "uFocal", focal);

				moteMesh.visible = l.motes;
				vec(mu, "uCenter").set(center);
				vec(mu, "uGlowC").set(glowC);
				vec(mu, "uTip").set(tip);
				num(mu, "uDrift", drift);
				num(mu, "uTwinkle", twinkle);
				num(mu, "uFocal", focal);

				glc.clearColor(horizon[0], horizon[1], horizon[2], 1);
				renderer.render({ scene, camera, frustumCull: false });

				// Reduced motion settles to one painted pose, then halts until a
				// hand arrives (every handler restarts the loop).
				if (l.reducedMotion && !frozen) {
					const busy =
						pr.down ||
						o.dragging ||
						ringsLive ||
						pr.amount > 0.002 ||
						Math.abs(want - hv.amount) > 0.002 ||
						Math.hypot(hv.tx - hv.x, hv.tz - hv.z) > 0.002;
					if (!busy) return false;
				}
			};

			measureRef.current = ({ width, height, dpr }: Metrics) => {
				const w = Math.max(1, Math.floor(width));
				const h = Math.max(1, Math.floor(height));
				renderer.dpr = dpr;
				renderer.setSize(w, h);
				aspect = w / h;
				// The eye looks DOWN at a point half a metre off the ground, which on
				// its own parks the horizon near the top edge. The lens shift drops
				// the whole image instead of tilting the camera, so blades stay
				// upright on screen: landscape lands the horizon about a third of the
				// way down with the orbit point right of the copy; portrait widens
				// the lens (a narrow frame otherwise sees a sliver of field) and keeps
				// the horizon high, above the copy. Same orientation split as the
				// container query on the copy, so the two never disagree.
				const landscape = aspect >= 1;
				const fov = landscape ? 44 : Math.min(66, 44 + (1 - aspect) * 40);
				tanHalf = Math.tan((fov * Math.PI) / 360);
				shift[0] = landscape ? 0.2 : 0;
				shift[1] = landscape ? -0.3 : 0.08;
				moonAt[0] = landscape ? 0.54 : 0.38;
				moonAt[1] = landscape ? 0.62 : 0.72;
				camera.perspective({ fov, aspect, near: 0.05, far: 120 });
				// The lens shift: an off-axis frustum, so perspective stays honest
				// while the composition moves. ogl rebuilds the matrix in
				// perspective(), so the shift is reapplied after it.
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
				moteGeometry.remove();
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
			tipColor, bladeColor, glowColor, skyColor, windSpeed, windStrength, bladeHeight,
			partRadius, gust, moon, motes, zoom, autoSpin, loop,
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
			// A press on the CTA is a click, never a hold or an orbit: with capture
			// taken here, the click would land on this element instead.
			if ((e.target as HTMLElement).closest("button, a")) return;
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
			pr.hold = 0;
			pr.valid = false;
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
					// Past the slop: the hold is cancelled and the press becomes an
					// orbit, starting from this point so the view does not jump.
					pr.moved = true;
					o.dragging = true;
				}
				if (o.dragging) {
					const dx = e.clientX - o.lastX;
					const dy = e.clientY - o.lastY;
					const dt = (e.timeStamp - o.lastT) / 1000;
					// The camera moves, so the vertical is negated relative to a
					// geometry rotation: drag down raises the eye and looks down.
					const dYaw = -dx * 0.0055;
					const dElev = dy * 0.0032;
					const [lo, hi] = elevBand.current;
					o.yaw += dYaw;
					o.elev = Math.min(hi, Math.max(lo, o.elev + dElev));
					// Velocity from the last segment only: an average over the whole
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
			if (!cancelled && pr.down && !pr.moved) {
				pr.tap = { nx: pr.nx, ny: pr.ny, hold: pr.hold };
			}
			pr.down = false;
			pr.moved = false;
			pr.pointerId = -1;
			orbit.current.dragging = false;
			// The finger left the glass, so the parting goes with it.
			if (e.pointerType !== "mouse") hover.current.inside = false;
			loop.start();
		};

		const onPointerLeave = (e: React.PointerEvent<HTMLDivElement>) => {
			if (press.current.down) return;
			if (e.pointerType === "mouse") hover.current.inside = false;
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

		// The wash under the copy deepens as the mist brightens, so white type
		// keeps its contrast whatever sky and tip colours are dialled in.
		const mistLuma = luma(mixRgb(hexToRgb01(skyColor), hexToRgb01(tipColor), 0.24));
		const wash = (0.38 + 0.42 * smooth01((mistLuma - 0.18) / 0.5)).toFixed(2);

		// The CTA is a silver pill: a thin tip-coloured edge on a smoked fill.
		// Hover or focus sweeps one soft diagonal sheen across it and warms the
		// edge toward the glow; both live in the scoped style below, which
		// reduced motion leaves out.
		const overlay = (
			<div
				className="pointer-events-none absolute inset-0 z-10 flex flex-col items-start justify-end bg-[linear-gradient(0deg,rgba(4,3,10,var(--silvergrass-wash)),rgba(4,3,10,0)_58%)] px-[max(20px,5.5cqi)] pb-[max(20px,6cqi)] text-left [@container(orientation:landscape)]:justify-center [@container(orientation:landscape)]:bg-[linear-gradient(90deg,rgba(4,3,10,var(--silvergrass-wash)),rgba(4,3,10,0)_58%)] [@container(orientation:landscape)]:pb-0"
				style={{ ["--silvergrass-wash" as string]: wash }}
			>
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
					<style>{`@keyframes __sg_sv_sweep { 0% { transform: translateX(-130%) skewX(-20deg); opacity: 0; } 18% { opacity: 1; } 82% { opacity: 1; } 100% { transform: translateX(330%) skewX(-20deg); opacity: 0; } }
.__sg_sv_cta { transition: border-color 420ms ease, box-shadow 420ms ease, background-color 420ms ease; }
.__sg_sv_cta:hover, .__sg_sv_cta:focus-visible { border-color: var(--silvergrass-warm); background-color: rgba(14,10,28,0.55); box-shadow: 0 0 26px -8px var(--silvergrass-glow), inset 0 1px 0 rgba(255,255,255,0.14); }
.__sg_sv_cta:hover .__sg_sv_sheen, .__sg_sv_cta:focus-visible .__sg_sv_sheen { animation: __sg_sv_sweep 1100ms cubic-bezier(0.22,1,0.36,1) 1 both; }`}</style>
				) : null}
				{ctaLabel ? (
					<div className="mt-[max(18px,2.6cqi)]" style={rise(2)}>
						<button
							type="button"
							onClick={onCtaClick}
							className="__sg_sv_cta pointer-events-auto relative isolate cursor-pointer overflow-hidden rounded-full border border-(--silvergrass-edge) bg-[rgba(8,7,18,0.4)] px-[max(26px,3.3cqi)] py-[max(10px,1.25cqi)] text-[max(11px,1.25cqi)] font-medium tracking-[0.22em] text-white uppercase shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-[3px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70"
							style={{
								["--silvergrass-edge" as string]: `color-mix(in srgb, ${tipColor} 62%, transparent)`,
								["--silvergrass-warm" as string]: `color-mix(in srgb, ${glowColor} 70%, ${tipColor})`,
								["--silvergrass-glow" as string]: glowColor,
							}}
						>
							<span
								aria-hidden
								className="__sg_sv_sheen pointer-events-none absolute inset-y-0 left-0 w-[42%] opacity-0"
								style={{
									backgroundImage:
										"linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.34) 50%, rgba(255,255,255,0) 100%)",
									transform: "translateX(-130%) skewX(-20deg)",
								}}
							/>
							<span className="relative">{ctaLabel}</span>
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
			// The poster: the night falling to a misty horizon, the moon's glow
			// upper right, and a dark band of field along the bottom.
			return (
				<div
					className={rootClass}
					style={{
						backgroundColor: skyColor,
						backgroundImage: `radial-gradient(circle at 76% 24%, color-mix(in srgb, ${tipColor} 70%, white) 0%, color-mix(in srgb, ${tipColor} 30%, transparent) 2.2%, color-mix(in srgb, ${tipColor} 12%, transparent) 10%, transparent 34%), linear-gradient(180deg, ${skyColor} 0%, color-mix(in srgb, ${skyColor} 72%, ${tipColor}) 46%, color-mix(in srgb, ${bladeColor} 70%, ${skyColor}) 54%, color-mix(in srgb, ${bladeColor} 45%, black) 100%)`,
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

Silvergrass.displayName = "Silvergrass";

export default Silvergrass;
