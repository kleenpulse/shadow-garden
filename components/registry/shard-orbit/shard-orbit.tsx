"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Geometry, Transform, Triangle } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// Crystal shards around a pulsing core that actually lights them — one
// giant stone by default, or a ring or helix of small ones. The whole system runs on the GPU: each shard owns two vec4
// seeds in instanced attributes, and its entire trajectory — orbital angle,
// vertical weave, tumble axes, stretch, scale — is a pure function of those
// seeds and two CPU-accumulated phases. The CPU uploads nothing per frame
// except a handful of uniforms, so the count is bounded by VRAM, not by JS.
//
// Five layers, ONE render call through one Transform (Renderer.render
// auto-clears, so sequential renders would wipe each other): a backdrop
// triangle at the far plane (renderOrder -1), the opaque instanced shards
// with a real depth buffer, then additive passes — a glitter field of
// points that fills the space between the stones, a small crystal at the
// core that shards can pass in front of, and a depth-test-off glow
// billboard that blooms over everything, which is where light belongs.
//
// Shading is what saves the stones from reading as paper: a view-pinned
// key light with a facet specular, a two-tone environment for the glassy
// grazing angles, and a point light AT the core — faces turned toward it
// catch its colour, faces turned away transmit a little of it, both
// attenuated by distance and driven by the same pulse as the glow. So the
// core breathes and every stone answers.
//
// Formation is a uniform, not a rebuild: one giant monolith on its axis,
// a rigid halo around it, or a rising double helix are all branches in the
// vertex shader on the same seeds, so switching is a single uniform write. Count is an enum, not a slider: each value
// reallocates the instance buffers and re-uploads them once. A slider would do that on every tick of
// a drag. The two motion phases wrap at 200π and every per-shard rate is a
// multiple of 0.01, so the wrap is invisible — the first draft wrapped a
// raw clock at 1000 and every shard snapped once per lap.
//
// The drag orbits the GEOMETRY (orbitize applies to vertices), so pointer
// deltas follow the non-negated convention — dragging down tips the scene's
// far side up toward you. The copy sits left of the scene in landscape (a
// lens shift on the projection, so perspective stays honest) and under it
// in portrait; a press that starts on the CTA never becomes a drag.
export interface ShardOrbitProps {
	/** Headline. An empty string removes the element. */
	title?: string;
	/** Supporting line under the headline. */
	subtitle?: string;
	/** Call-to-action label. An empty string removes the button. */
	ctaLabel?: string;
	/** Click handler for the call-to-action. */
	onCtaClick?: () => void;
	/** Shard count, as discrete steps. */
	count?: "16" | "32" | "48" | "96" | "192";
	/** How the shards are arranged. */
	formation?: "monolith" | "halo" | "helix";
	/** Lit face color of a shard. */
	shardColor?: string;
	/** Core glow at the centre — and the light every shard catches. */
	coreColor?: string;
	/** Scene backdrop. */
	backgroundColor?: string;
	/** Orbit radius, and the monolith's size. */
	orbitRadius?: number;
	/** Halo only: height of the ripple running through the ring. */
	spread?: number;
	/** Base angular speed of the orbiting shards. */
	beltSpeed?: number;
	/** Halo only: how fast the ring orbits, as a multiple of the base speed. */
	ringSpeed?: number;
	/** Per-shard tumbling rate. */
	tumbleSpeed?: number;
	/** Core pulse intensity. */
	corePulse?: number;
	/** Core glow brightness — the bloom around the core and its light on the backdrop. */
	glow?: number;
	/** Camera distance multiplier. */
	zoom?: number;
	/** Idle camera drift while nothing is held. */
	autoSpin?: boolean;
	/** Halt the loop. The scene freezes mid-tumble. */
	paused?: boolean;
	/** Settles the scene: no drift, no pulse, one painted frame. */
	reducedMotion?: boolean;
	className?: string;
}

export type ShardCount = NonNullable<ShardOrbitProps["count"]>;
export type ShardFormation = NonNullable<ShardOrbitProps["formation"]>;

const FORMATIONS: Record<string, number> = {
	monolith: 0,
	halo: 1,
	helix: 2,
};

const COUNTS: Record<string, number> = {
	"16": 16,
	"32": 32,
	"48": 48,
	"96": 96,
	"192": 192,
};

const PHASE_WRAP = 200 * Math.PI;
// Camera distance in landscape; a narrow frame backs it off (see measure).
const CAMERA = 3.4;

const hexToRgb01 = (hex: string): [number, number, number] => {
	const h = hex.replace("#", "");
	const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
	const n = parseInt(full, 16);
	if (Number.isNaN(n) || full.length !== 6) return [1, 1, 1];
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

// Rates that must wrap cleanly are snapped to the 0.01 grid.
const quant = (x: number) => Math.round(x * 100) / 100;

// Elongated octahedron, exploded into 8 independent triangles so every face
// can carry its own normal — indexed shared vertices would smooth the shading
// across edges and read as a blob, not a cut stone.
type V3 = [number, number, number];

function buildShard(): {
	position: Float32Array;
	normal: Float32Array;
} {
	const tip = 1.45;
	const apexTop: V3 = [0, tip, 0];
	const apexBottom: V3 = [0, -tip, 0];
	const ring: V3[] = [
		[1, 0, 0],
		[0, 0, 1],
		[-1, 0, 0],
		[0, 0, -1],
	];
	const faces: [V3, V3, V3][] = [];
	for (let i = 0; i < 4; i++) {
		const a = ring[i];
		const b = ring[(i + 1) % 4];
		faces.push([apexTop, a, b]);
		faces.push([apexBottom, b, a]);
	}
	const position = new Float32Array(faces.length * 9);
	const normal = new Float32Array(faces.length * 9);
	faces.forEach((face, f) => {
		const [p0, p1, p2] = face;
		const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
		const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
		let nx = uy * vz - uz * vy;
		let ny = uz * vx - ux * vz;
		let nz = ux * vy - uy * vx;
		const len = Math.hypot(nx, ny, nz) || 1;
		nx /= len; ny /= len; nz /= len;
		for (let v = 0; v < 3; v++) {
			const p = face[v];
			const i = (f * 3 + v) * 3;
			position[i] = p[0];
			position[i + 1] = p[1];
			position[i + 2] = p[2];
			normal[i] = nx;
			normal[i + 1] = ny;
			normal[i + 2] = nz;
		}
	});
	return { position, normal };
}

// Shared by every layer: the orbit, and a real perspective divide with a
// lens shift. x is divided by the aspect so the halo is a circle on every
// canvas (the first draft stretched it into an ellipse on wide stages), z
// lands in the depth buffer so overlapping stones resolve by distance.
const COMMON = `
uniform float uYaw;
uniform float uPitch;
uniform float uAspect;
uniform float uDist;
uniform float uZoom;
uniform vec2 uShift;
const float FOCAL = 2.2;
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 orbitize(vec3 p, float yaw, float pitch) {
  p.xz *= rot(yaw);
  p.yz *= rot(pitch);
  return p;
}
vec4 project(vec3 view) {
  float w = uDist * uZoom - view.z;
  return vec4(view.xy * FOCAL / vec2(uAspect, 1.0) + uShift * w, -view.z * 0.25 * w, w);
}
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}`;

const shardVert = `#version 300 es
in vec3 position;
in vec3 normal;
in vec4 aSeed;
in vec4 aRate;
uniform float uPhase;
uniform float uRing;
uniform float uTumble;
uniform float uSpread;
uniform float uRadius;
uniform float uMode;
uniform float uCount;
uniform vec3 uLight;
out vec3 vN;
out vec3 vV;
out vec3 vLc;
out float vDc;
out float vDepth;
out float vTip;
out float vCoreMix;
out vec3 vP;
out vec3 vAxis;

${COMMON}

// Every formation is a pure function of the seeds and the two phases, so
// switching one is a uniform write, not a rebuild. Rates stay on the 0.01
// grid (or an integer number of laps per 200π) so the wrap is invisible.
void main() {
  float stretch = mix(0.75, 1.6, fract(aSeed.x * 5.17));
  float scale = mix(0.05, 0.2, pow(fract(aSeed.w * 7.31), 2.2));
  float t1 = uTumble * aRate.x + aSeed.y * 7.0;
  float t2 = uTumble * aRate.y + aSeed.w * 6.28;
  vec3 center;
  // Basis the stone is expressed in: identity for free tumblers, a
  // radial/tangent/up frame for the halo.
  mat3 basis = mat3(1.0);

  if (uMode < 0.5) {
    // Monolith: one giant stone on its own axis, seated a little below
    // centre; the rest leave the frustum.
    if (gl_InstanceID != 0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
    center = vec3(0.0, -0.3, 0.0);
    stretch = 1.7;
    scale = 0.42 * uRadius / 1.15;
    t1 = uTumble * 0.3;
    t2 = 0.0;
  } else if (uMode < 1.5 && gl_InstanceID == 0) {
    // Halo keeps the monolith at its centre, seated a little below the
    // ring so the ring crosses its shoulders rather than its base.
    center = vec3(0.0, -0.32, 0.0);
    stretch = 1.7;
    scale = 0.42 * uRadius / 1.15;
    t1 = uTumble * 0.3;
    t2 = 0.0;
  } else if (uMode < 1.5) {
    // Halo: a rigid ring, every stone laid along the tangent, rolling in
    // lock-step, with a slow ripple through the ring. Spacing comes from
    // the instance id, not the jittered seed, in three concentric lanes so
    // neighbours never share a radius — and a stone can be no longer than
    // most of the gap to the next stone in its lane, so a higher count
    // means smaller stones, never stones passing through each other.
    // Lane count follows the shard count: a small ring files onto one
    // track like ducks in a row, a crowded one spreads across three.
    float k = float(gl_InstanceID) - 1.0;
    float m = max(uCount - 1.0, 1.0);
    float lanes = clamp(floor(uCount / 40.0), 0.0, 2.0) + 1.0;
    float lane = mod(k, lanes) - (lanes - 1.0) * 0.5;
    float angle = k / m * 6.28318 + uRing;
    float ringR = uRadius * (1.0 + lane * 0.14);
    vec3 rad = vec3(cos(angle), 0.0, sin(angle));
    vec3 tng = vec3(-sin(angle), 0.0, cos(angle));
    basis = mat3(rad, tng, vec3(0.0, 1.0, 0.0));
    float lift = lane * 0.06 + (aSeed.x - 0.5) * 0.04;
    center = rad * ringR + vec3(0.0, lift + sin(angle * 3.0 + uRing * 0.5) * uSpread * 0.3, 0.0);
    stretch = 1.4;
    float gap = 6.28318 * ringR / m * lanes;
    scale = min(mix(0.06, 0.095, aSeed.w), 0.8 * gap / (2.9 * stretch));
    t1 = uTumble * 0.3 + aSeed.w * 6.28;
    t2 = 0.0;
  } else {
    // Helix: two strands rising around the core. Height wraps 400 times per
    // 200π, so the wrap is exact; the ends fade out so no stone pops.
    float h = fract(aSeed.x + uPhase * 0.63662);
    float strand = step(0.5, aSeed.w) * 3.14159;
    float angle = h * 15.7 + strand + uPhase * 0.8 + (aSeed.y - 3.14) * 0.12;
    center = vec3(cos(angle) * uRadius * 0.55, (h - 0.5) * 2.8, sin(angle) * uRadius * 0.55);
    scale *= smoothstep(0.0, 0.12, h) * smoothstep(1.0, 0.88, h);
    t1 *= 0.5; t2 *= 0.5;
  }

  // Per-stone cut: a taller or squatter tip. A non-uniform scale bends the
  // normal the opposite way, so it is divided, not multiplied.
  vec3 p = position * vec3(1.0, stretch, 1.0);
  vec3 n = normalize(normal / vec3(1.0, stretch, 1.0));
  // Tumble: two stacked rotations whose axes come from the seed. Cheap, and
  // varied enough that no two shards visibly share a rhythm.
  p.xz *= rot(t1); n.xz *= rot(t1);
  p.yz *= rot(t2); n.yz *= rot(t2);
  p = basis * p; n = basis * n;
  vec3 world = center + p * scale;

  vec3 view = orbitize(world, uYaw, uPitch);
  vN = orbitize(n, uYaw, uPitch);
  vV = normalize(vec3(0.0, 0.0, uDist * uZoom) - view);
  // The point light: the core for every formation but the monolith, which
  // is lit from beside it instead of from inside it.
  vCoreMix = 1.0;
  vec3 toL = uLight - world;
  vDc = length(toL);
  vLc = orbitize(toL / max(vDc, 1e-3), uYaw, uPitch);
  // The giant takes its own lighting model in the fragment shader (see
  // there); this flag is what selects it.
  if (uMode < 1.5 && gl_InstanceID == 0) vCoreMix = 0.0;
  vTip = abs(position.y) / 1.45;
  // For the giant's finish: the fragment's offset from the stone's centre and
  // the stone's long axis, both in view space.
  vP = view - orbitize(center, uYaw, uPitch);
  vAxis = orbitize(basis * vec3(0.0, 1.0, 0.0), uYaw, uPitch);
  vec4 clip = project(view);
  vDepth = clip.w;
  gl_Position = clip;
}`;

const shardFrag = `#version 300 es
precision highp float;
in vec3 vN;
in vec3 vV;
in vec3 vLc;
in float vDc;
in float vDepth;
in float vTip;
in float vCoreMix;
in vec3 vP;
in vec3 vAxis;
out vec4 fragColor;
uniform vec3 uShard;
uniform vec3 uCore;
uniform vec3 uBg;
uniform float uGlow;
uniform float uCam;

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(vV);
  // Key light pinned in VIEW space: whichever way the scene is orbited, some
  // face is always lit, so the silhouette never collapses into black.
  vec3 kl = normalize(vec3(0.45, 0.8, 0.5));
  // Wrapped diffuse (half-Lambert, squared) so a face turned away is dim,
  // not black, plus a cool fill from the far side: flat facets need a
  // gradient of tones, not two.
  float kd = pow(dot(n, kl) * 0.5 + 0.5, 2.0);
  float fd = max(dot(n, normalize(vec3(-0.6, -0.35, 0.45))), 0.0);
  float ks = pow(max(dot(reflect(-kl, n), v), 0.0), 40.0);
  // Studio in the reflections: bright above, dark below, a long ramp, and
  // the whole room stained by the core so every face shares its hue —
  // without it the faces split into grey ones and painted ones.
  vec3 envc = mix(uBg * 2.0 + 0.06, vec3(0.5, 0.5, 0.58), smoothstep(-0.8, 0.9, n.y));
  envc = mix(envc, uCore * 0.9, 0.3);
  float fres = pow(1.0 - abs(dot(n, v)), 3.0);
  // Crystal thins toward its tips, so light gets through there: a
  // brightening along each face from base to point, the one gradient a
  // flat-shaded facet can carry.
  float tip = smoothstep(0.15, 1.0, vTip) * 0.3;
  // The core as a point light: lit faces, a facet flash, and a little
  // transmission through faces turned away — crystal, not painted stone.
  vec3 lc = normalize(vLc);
  float att = uGlow / (0.35 + vDc * vDc * 0.8);
  float cd = pow(dot(n, lc) * 0.5 + 0.5, 2.0);
  float cs = pow(max(dot(reflect(-lc, n), v), 0.0), 24.0);
  float cback = max(dot(n, -lc), 0.0) * 0.35;
  vec3 small = uShard * (envc * 0.5 + kd * 0.45 + fd * 0.18 + tip)
    + vec3(1.0) * ks * 0.5
    + uCore * att * (cd * 0.8 + cback + cs * 1.2)
    + mix(uShard, uCore, 0.5) * fres * 0.5;
  // The giant is lit by direction only. Every view-dependent term above —
  // fresnel, specular, tip glow — lands on one of its flat facets as a
  // coat rather than a glint, so none of them apply: a wrapped key from
  // the upper right, a soft fill from the lower left, a sky/ground ramp,
  // one hue, tones ordered by orientation.
  float gk = dot(n, kl) * 0.5 + 0.5;
  float gsky = smoothstep(-1.0, 1.0, n.y);
  vec3 giant = uShard * (0.2 + 0.12 * gsky + 0.48 * gk * gk + 0.14 * fd);
  // The finish. Three things make a flat facet read as oiled silk instead
  // of matte card, and all three vary WITHIN a face:
  // 1. a gentle dome — the normal bent toward the fragment's offset from
  //    the centre, so a broad specular slides across the facet as a
  //    gradient rather than sitting on it as one value;
  // 2. an anisotropic streak (Kajiya-Kay) along the stone's axis — the
  //    grain of silk — lit by the key and by the core's colour from the
  //    fill side;
  // 3. a thin-film fresnel at grazing angles that shifts between the
  //    stone's hue and the core's — the oil.
  vec3 np = normalize(n + normalize(vP) * 0.28);
  vec3 ax = normalize(vAxis);
  vec3 hk = normalize(kl + v);
  float dome = pow(max(dot(np, hk), 0.0), 10.0);
  float tk = dot(ax, hk);
  // Each streak is gated by the domed normal facing its half-vector, or the
  // grain fires evenly across the whole stone and reads as a coat again.
  float silkK = pow(sqrt(max(1.0 - tk * tk, 0.0)), 28.0) * pow(max(dot(np, hk), 0.0), 3.0);
  vec3 fl = normalize(vec3(-0.6, -0.35, 0.45));
  vec3 hf = normalize(fl + v);
  float tf = dot(ax, hf);
  float silkF = pow(sqrt(max(1.0 - tf * tf, 0.0)), 20.0) * pow(max(dot(np, hf), 0.0), 3.0);
  float nv = max(dot(np, v), 0.0);
  float film = pow(1.0 - nv, 4.0);
  vec3 oil = mix(uShard, uCore, 0.5 + 0.5 * sin(nv * 7.0 + 1.2));
  giant += vec3(1.0) * dome * 0.3
    + mix(vec3(1.0), uShard, 0.5) * silkK * 0.5
    + mix(uShard, uCore, 0.6) * silkF * 0.35
    + oil * film * 0.4;
  vec3 col = mix(giant, small, vCoreMix);
  // Depth fog toward the backdrop so the far side of the ring sits behind.
  float fog = clamp((vDepth - uCam) * 0.35 + 0.12, 0.0, 0.7);
  col = mix(aces(col), uBg * 1.2, fog);
  fragColor = vec4(col, 1.0);
}`;

const dustVert = `#version 300 es
in vec4 aSeed;
uniform float uPhase;
uniform float uSpread;
uniform float uRadius;
uniform float uDpr;
out float vSeed;
out float vFade;

${COMMON}

void main() {
  float radiusJit = mix(0.7, 1.35, aSeed.x);
  float angle = aSeed.y + uPhase * aSeed.z;
  float weave = sin(uPhase * (0.5 + aSeed.w) + aSeed.x * 6.28) * uSpread * 1.3;
  vec3 world = vec3(cos(angle) * radiusJit * uRadius, weave, sin(angle) * radiusJit * uRadius);
  vec3 view = orbitize(world, uYaw, uPitch);
  vec4 clip = project(view);
  gl_Position = clip;
  gl_PointSize = mix(1.5, 3.5, fract(aSeed.w * 3.7)) * uDpr * (uDist * uZoom) / clip.w;
  vSeed = aSeed.w;
  vFade = clamp(1.0 - (clip.w - uDist * uZoom) * 0.3, 0.3, 1.0);
}`;

const dustFrag = `#version 300 es
precision highp float;
in float vSeed;
in float vFade;
out vec4 fragColor;
uniform vec3 uShard;
uniform vec3 uCore;
uniform float uGlow;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.15, d) * vFade * (0.35 + 0.35 * uGlow);
  fragColor = vec4(mix(uShard, uCore, vSeed) * a, 1.0);
}`;

const coreVert = `#version 300 es
in vec3 position;
in vec3 normal;
uniform float uCoreScale;
uniform float uSpin;
out vec3 vN;
out vec3 vV;

${COMMON}

void main() {
  vec3 p = position * uCoreScale;
  vec3 n = normal;
  p.xz *= rot(uSpin); n.xz *= rot(uSpin);
  vec3 view = orbitize(p, uYaw, uPitch);
  vN = orbitize(n, uYaw, uPitch);
  vV = normalize(vec3(0.0, 0.0, uDist * uZoom) - view);
  gl_Position = project(view);
}`;

const coreFrag = `#version 300 es
precision highp float;
in vec3 vN;
in vec3 vV;
out vec4 fragColor;
uniform vec3 uCore;
uniform float uGlow;

void main() {
  // Inverted fresnel: hot centre falling off toward the rim, the opposite of
  // the shards' edge light, so core and shards never compete for the same
  // part of the eye.
  float inner = pow(abs(dot(normalize(vN), normalize(vV))), 1.4);
  vec3 col = mix(uCore, vec3(1.0), inner * 0.6) * inner * uGlow * 1.3;
  fragColor = vec4(col, 1.0);
}`;

const glowVert = `#version 300 es
in vec3 position;
uniform float uGlowSize;
uniform float uGlowZ;
out vec2 vUv;

${COMMON}

void main() {
  // A billboard built in view space, so it always faces the camera however
  // the scene is orbited. uGlowZ is its depth: zero (the core) when the
  // glow blooms over everything with the depth test off, but pushed BEHIND
  // the giant stone when the test is on — a billboard through the middle
  // of an opaque body paints its additive colour onto every facet pixel
  // that falls behind the plane, which reads as a second colour on
  // whichever faces happen to cross it at that angle. The size is
  // corrected for the extra distance so the bloom stays the same on screen.
  float w0 = uDist * uZoom;
  float w = w0 - uGlowZ;
  vUv = position.xy;
  gl_Position = vec4(position.xy * uGlowSize * FOCAL / vec2(uAspect, 1.0) * (w / w0) + uShift * w, -uGlowZ * 0.25 * w, w);
}`;

const glowFrag = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec3 uCore;
uniform float uGlow;

void main() {
  float r = length(vUv);
  vec3 col = uCore * (exp(-r * r * 14.0) * 1.1 + exp(-r * r * 3.0) * 0.5 + exp(-r * 2.5) * 0.1)
    + vec3(1.0) * exp(-r * r * 40.0) * 0.7;
  // The wide term is still a few levels above zero at the quad's edge, and
  // additive over a near-black void that reads as a square. Mask it out.
  col *= smoothstep(1.0, 0.55, r);
  fragColor = vec4(col * uGlow, 1.0);
}`;

const backVert = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 0.999, 1.0); }`;

const backFrag = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec3 uBg;
uniform vec3 uCore;
uniform float uAspect;
uniform vec2 uShift;
uniform float uGlow;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 q = (vUv * 2.0 - 1.0 - uShift) * vec2(uAspect, 1.0);
  float r = length(q);
  // The void: brighter behind the core, falling to the edges, with a
  // breath of the core colour and a hair of dither against banding.
  vec3 col = uBg * mix(1.5, 0.5, smoothstep(0.0, 1.7, r));
  col += uCore * exp(-r * r * 1.8) * 0.14 * uGlow;
  col += (hash(gl_FragCoord.xy) - 0.5) * (1.0 / 128.0);
  fragColor = vec4(col, 1.0);
}`;

const ShardOrbit = memo(
	({
		title = "Held in orbit",
		subtitle = "Every shard on its own path. None of them lost.",
		ctaLabel = "Enter the orbit",
		onCtaClick,
		count = "48",
		formation = "monolith",
		shardColor = "#e9d5ff",
		coreColor = "#a855f7",
		backgroundColor = "#04040a",
		orbitRadius = 1.15,
		spread = 0.35,
		beltSpeed = 0.18,
		ringSpeed = 1,
		tumbleSpeed = 1,
		corePulse = 1,
		glow = 1,
		zoom = 1,
		autoSpin = true,
		paused = false,
		reducedMotion = false,
		className,
	}: ShardOrbitProps) => {
		const containerRef = useRef<HTMLDivElement>(null);
		const drawRef = useRef<((dt: number) => void | false) | null>(null);
		const measureRef = useRef<((m: Metrics) => void) | null>(null);
		const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(
			null,
		);
		const orbit = useRef({
			yaw: 0,
			pitch: 0.32,
			vYaw: 0,
			vPitch: 0,
			dragging: false,
			pointerId: -1,
			lastX: 0,
			lastY: 0,
			lastT: 0,
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
			onResize: (metrics) => measureRef.current?.(metrics),
			onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
			gl: () => glRef.current,
		});

		const live = useRef({
			formation, shardColor, coreColor, backgroundColor, orbitRadius, spread,
			beltSpeed, ringSpeed, tumbleSpeed, corePulse, glow, zoom, autoSpin, reducedMotion,
		});
		live.current = {
			formation, shardColor, coreColor, backgroundColor, orbitRadius, spread,
			beltSpeed, ringSpeed, tumbleSpeed, corePulse, glow, zoom, autoSpin, reducedMotion,
		};

		useEffect(() => {
			const container = containerRef.current;
			if (fallback || !container) return;

			let renderer: Renderer;
			try {
				renderer = new Renderer({
					antialias: true,
					alpha: false,
					dpr: Math.min(window.devicePixelRatio || 1, 2),
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

			const n = COUNTS[count] ?? 48;
			const { position, normal } = buildShard();

			// Uniforms every layer shares — one object per program, written from
			// the same locals each frame.
			const shared = () => ({
				uYaw: { value: 0 },
				uPitch: { value: 0.32 },
				uAspect: { value: 1 },
				uDist: { value: CAMERA },
				uZoom: { value: zoom },
				uShift: { value: new Float32Array([0, 0]) },
			});

			// Two vec4 per shard. Everything else about its motion is derived.
			// Rates sit on the 0.01 grid so the 200π phase wrap is seamless.
			const seeds = new Float32Array(n * 4);
			const rates = new Float32Array(n * 4);
			for (let i = 0; i < n; i++) {
				seeds[i * 4] = Math.random();
				seeds[i * 4 + 1] = (i / n) * Math.PI * 2 + Math.random() * 0.5;
				seeds[i * 4 + 2] = quant(0.7 + Math.random() * 0.6);
				seeds[i * 4 + 3] = Math.random();
				rates[i * 4] = quant(0.6 + Math.random() * 0.8);
				rates[i * 4 + 1] = quant(0.4 + Math.random() * 0.7);
				rates[i * 4 + 2] = quant(0.5 + Math.random() * 1.0);
				rates[i * 4 + 3] = Math.random() * Math.PI * 2;
			}
			const shardGeometry = new Geometry(glc, {
				position: { size: 3, data: position },
				normal: { size: 3, data: normal },
				aSeed: { size: 4, data: seeds, instanced: 1 },
				aRate: { size: 4, data: rates, instanced: 1 },
			});
			const shardProgram = new Program(glc, {
				vertex: shardVert,
				fragment: shardFrag,
				cullFace: false,
				uniforms: {
					...shared(),
					uShard: { value: new Float32Array(hexToRgb01(shardColor)) },
					uCore: { value: new Float32Array(hexToRgb01(coreColor)) },
					uBg: { value: new Float32Array(hexToRgb01(backgroundColor)) },
					uPhase: { value: 0 },
					uRing: { value: 0 },
					uTumble: { value: 0 },
					uSpread: { value: spread * orbitRadius },
					uRadius: { value: orbitRadius },
					uGlow: { value: 1 },
					uCam: { value: CAMERA },
					uMode: { value: FORMATIONS[formation] ?? 0 },
					uCount: { value: n },
					uLight: { value: new Float32Array([0, 0, 0]) },
				},
			});
			const shards = new Mesh(glc, { geometry: shardGeometry, program: shardProgram });

			// Glitter between the stones: eight motes per shard, additive points.
			const dustN = Math.min(n * 8, 1536);
			const dustSeeds = new Float32Array(dustN * 4);
			for (let i = 0; i < dustN; i++) {
				dustSeeds[i * 4] = Math.random();
				dustSeeds[i * 4 + 1] = Math.random() * Math.PI * 2;
				dustSeeds[i * 4 + 2] = quant(0.6 + Math.random() * 0.8);
				dustSeeds[i * 4 + 3] = Math.random();
			}
			const dustGeometry = new Geometry(glc, {
				aSeed: { size: 4, data: dustSeeds },
			});
			const dustProgram = new Program(glc, {
				vertex: dustVert,
				fragment: dustFrag,
				transparent: true,
				depthWrite: false,
				uniforms: {
					...shared(),
					uShard: { value: new Float32Array(hexToRgb01(shardColor)) },
					uCore: { value: new Float32Array(hexToRgb01(coreColor)) },
					uPhase: { value: 0 },
					uSpread: { value: spread * orbitRadius },
					uRadius: { value: orbitRadius },
					uDpr: { value: 1 },
					uGlow: { value: 1 },
				},
			});
			dustProgram.setBlendFunc(glc.ONE, glc.ONE);
			const dust = new Mesh(glc, { geometry: dustGeometry, program: dustProgram, mode: glc.POINTS });

			// The crystal at the core keeps its depth test so a stone crossing in
			// front of it occludes it; the glow behind it does not, and blooms
			// over the stones the way light does.
			const coreGeometry = new Geometry(glc, {
				position: { size: 3, data: position },
				normal: { size: 3, data: normal },
			});
			const coreProgram = new Program(glc, {
				vertex: coreVert,
				fragment: coreFrag,
				transparent: true,
				cullFace: false,
				depthWrite: false,
				uniforms: {
					...shared(),
					uCore: { value: new Float32Array(hexToRgb01(coreColor)) },
					uCoreScale: { value: 0.16 },
					uSpin: { value: 0 },
					uGlow: { value: 1 },
				},
			});
			coreProgram.setBlendFunc(glc.ONE, glc.ONE);
			const core = new Mesh(glc, { geometry: coreGeometry, program: coreProgram });

			const glowGeometry = new Geometry(glc, {
				position: {
					size: 3,
					data: new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0]),
				},
			});
			const glowProgram = new Program(glc, {
				vertex: glowVert,
				fragment: glowFrag,
				transparent: true,
				cullFace: false,
				depthTest: false,
				depthWrite: false,
				uniforms: {
					...shared(),
					uCore: { value: new Float32Array(hexToRgb01(coreColor)) },
					uGlowSize: { value: 0.9 },
					uGlowZ: { value: 0 },
					uGlow: { value: 1 },
				},
			});
			glowProgram.setBlendFunc(glc.ONE, glc.ONE);
			const glow = new Mesh(glc, { geometry: glowGeometry, program: glowProgram });

			// Backdrop at the far plane, drawn first, never written to depth.
			const backProgram = new Program(glc, {
				vertex: backVert,
				fragment: backFrag,
				cullFace: false,
				depthWrite: false,
				uniforms: {
					uBg: { value: new Float32Array(hexToRgb01(backgroundColor)) },
					uCore: { value: new Float32Array(hexToRgb01(coreColor)) },
					uAspect: { value: 1 },
					uShift: { value: new Float32Array([0, 0]) },
					uGlow: { value: 1 },
				},
			});
			const back = new Mesh(glc, { geometry: new Triangle(glc), program: backProgram, renderOrder: -1 });

			const scene = new Transform();
			back.setParent(scene);
			shards.setParent(scene);
			dust.setParent(scene);
			core.setParent(scene);
			glow.setParent(scene);

			type U = Record<string, { value: unknown }>;
			const all = [shardProgram, dustProgram, coreProgram, glowProgram].map(
				(p) => p.uniforms as U,
			);
			const su = shardProgram.uniforms as U;
			const du = dustProgram.uniforms as U;
			const cu = coreProgram.uniforms as U;
			const gu = glowProgram.uniforms as U;
			const bu = backProgram.uniforms as U;
			const setVec = (u: U, key: string, v: number[]) =>
				(u[key].value as Float32Array).set(v);

			let phase = 0;
			let ring = 0;
			let tumble = 0;
			let pulse = 0;
			let aspect = 1;
			let dist = CAMERA;
			const shift: [number, number] = [0, 0];

			drawRef.current = (dt) => {
				const l = live.current;
				const o = orbit.current;
				const step = Math.min(dt, 1 / 30);
				const still = pausedRef.current || l.reducedMotion;

				if (!still) {
					phase = (phase + step * l.beltSpeed) % PHASE_WRAP;
					ring = (ring + step * l.beltSpeed * l.ringSpeed) % PHASE_WRAP;
					tumble = (tumble + step * l.tumbleSpeed) % PHASE_WRAP;
					pulse = (pulse + step) % PHASE_WRAP;
					if (!o.dragging && l.autoSpin) {
						o.yaw += 0.1 * step;
						o.pitch = Math.max(-0.9, Math.min(1.1, o.pitch + o.vPitch * step));
						const decay = Math.pow(0.92, step * 60);
						o.vYaw *= decay;
						o.vPitch *= decay;
					}
					o.yaw %= Math.PI * 2;
				}
				// Paused still redraws: colour and zoom tuning land immediately while
				// the simulation itself is frozen.

				const breathe =
					1 + Math.sin(pulse * 1.9) * 0.14 * (l.reducedMotion ? 0 : l.corePulse);
				const mode = FORMATIONS[l.formation] ?? 0;
				// Monolith and halo both carry the giant stone at the origin.
				const monolith = mode === 0 || mode === 1;
				const shard = hexToRgb01(l.shardColor);
				const coreC = hexToRgb01(l.coreColor);
				const bg = hexToRgb01(l.backgroundColor);

				for (const u of all) {
					(u.uYaw as { value: number }).value = o.yaw;
					(u.uPitch as { value: number }).value = o.pitch;
					(u.uAspect as { value: number }).value = aspect;
					(u.uDist as { value: number }).value = dist;
					(u.uZoom as { value: number }).value = l.zoom;
					(u.uShift.value as Float32Array).set(shift);
					(u.uGlow as { value: number }).value = breathe;
					setVec(u, "uCore", coreC);
				}
				setVec(su, "uShard", shard);
				setVec(su, "uBg", bg);
				(su.uPhase as { value: number }).value = phase;
				(su.uRing as { value: number }).value = ring;
				(su.uTumble as { value: number }).value = tumble;
				(su.uSpread as { value: number }).value = l.spread * l.orbitRadius;
				(su.uRadius as { value: number }).value = l.orbitRadius;
				(su.uCam as { value: number }).value = dist * l.zoom;
				(su.uMode as { value: number }).value = mode;
				// The halo ring is lit from beside the giant stone (the stone
				// itself takes a view-space fill in the vertex shader).
				setVec(su, "uLight", monolith ? [0.9, 0.6, 0.9] : [0, 0, 0]);
				// The monolith IS the core: its crystal leaves, the glow drops to a
				// subtle backlight and takes the depth test so it halos the
				// silhouette instead of blooming over the face.
				(cu.uCoreScale as { value: number }).value = monolith ? 0 : 0.16 * breathe;
				(cu.uGlow as { value: number }).value = breathe * l.glow;
				glowProgram.depthTest = monolith;
				(gu.uGlow as { value: number }).value = breathe * l.glow * (monolith ? 0.35 : 1);
				setVec(du, "uShard", shard);
				(du.uPhase as { value: number }).value = phase;
				(du.uSpread as { value: number }).value = l.spread * l.orbitRadius;
				(du.uRadius as { value: number }).value = l.orbitRadius;
				(cu.uSpin as { value: number }).value = tumble * 0.35;
				(gu.uGlowSize as { value: number }).value = 1.15 * breathe;
				// The giant tilts to ~1.05 units from its centre at full pitch; -1.3
				// keeps the glow plane clear of it at every angle.
				(gu.uGlowZ as { value: number }).value = monolith ? -1.3 : 0;
				setVec(bu, "uBg", bg);
				setVec(bu, "uCore", coreC);
				(bu.uAspect as { value: number }).value = aspect;
				(bu.uShift.value as Float32Array).set(shift);
				(bu.uGlow as { value: number }).value = breathe * l.glow;

				glc.clearColor(bg[0], bg[1], bg[2], 1);
				renderer.render({ scene });
			};

			measureRef.current = ({ width, height, dpr }: Metrics) => {
				renderer.dpr = dpr;
				renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
				aspect = Math.max(width, 1) / Math.max(height, 1);
				(du.uDpr as { value: number }).value = dpr;
				// Landscape parks the scene at 72% of the width beside the copy;
				// portrait lifts it above the copy and backs the camera off so the
				// scene keeps inside the frame. Same orientation split as the
				// container query on the copy, so the two never disagree.
				shift[0] = aspect > 1 ? 0.44 : 0;
				shift[1] = aspect > 1 ? 0.05 : 0.3;
				dist = CAMERA * Math.min(2, Math.max(1, 0.85 / aspect));
				drawRef.current?.(0.016);
			};

			loop.resize();
			loop.start();

			return () => {
				drawRef.current = null;
				measureRef.current = null;
				if (container.contains(canvas)) container.removeChild(canvas);
			};
			// Rebuilds on a count change only — the enum reallocates the instance
			// buffers; every other prop flows through uniforms above.
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [fallback, count]);

		useEffect(() => {
			loop.paint();
		}, [
			formation, shardColor, coreColor, backgroundColor, orbitRadius, spread,
			beltSpeed, ringSpeed, tumbleSpeed, corePulse, glow, zoom, autoSpin, loop,
		]);

		const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
			// A press on the CTA is a click, never the start of an orbit — with
			// capture taken here, the click would land on this element instead.
			if ((e.target as HTMLElement).closest("button, a")) return;
			const o = orbit.current;
			o.dragging = true;
			o.pointerId = e.pointerId;
			o.lastX = e.clientX;
			o.lastY = e.clientY;
			o.lastT = e.timeStamp;
			o.vYaw = 0;
			o.vPitch = 0;
			e.currentTarget.setPointerCapture(e.pointerId);
			loop.start();
		};

		const track = (e: React.PointerEvent<HTMLDivElement>) => {
			const o = orbit.current;
			if (!o.dragging || e.pointerId !== o.pointerId) return;
			const dx = e.clientX - o.lastX;
			const dy = e.clientY - o.lastY;
			const dt = (e.timeStamp - o.lastT) / 1000;
			// Geometry rotation: pitch delta NOT negated (see swarm for the full sign
			// derivation). Dragging down tips the far side of the scene upward.
			const dYaw = -dx * 0.008;
			const dPitch = dy * 0.006;
			o.yaw += dYaw;
			o.pitch = Math.max(-0.9, Math.min(1.1, o.pitch + dPitch));
			if (dt > 0.001) {
				o.vYaw = dYaw / dt;
				o.vPitch = dPitch / dt;
			}
			o.lastX = e.clientX;
			o.lastY = e.clientY;
			o.lastT = e.timeStamp;
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

		// The CTA is a cut stone in the core's colour: a chamfered hexagon with
		// two hard facet bands, and an inner light that pulses while hovered.
		// The clip lives on an inner layer so the focus ring survives it. The
		// copy sits left in landscape, under the scene in portrait — the same
		// orientation split the projection uses for its lens shift. White copy
		// is deliberate: the scene is dark at every tunable setting.
		const gemClip =
			"polygon(12px 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 12px 100%, 0 50%)";
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
					// Scoped to the button's own hover on purpose — group-hover would
					// fire from any ancestor that carries `group`.
					<style>{`@keyframes __sg_so_glow { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.9; } }
.__sg_so_cta:hover .__sg_so_glow, .__sg_so_cta:focus-visible .__sg_so_glow { animation: __sg_so_glow 1.4s ease-in-out infinite; }`}</style>
				) : null}
				{ctaLabel ? (
					<button
						type="button"
						onClick={onCtaClick}
						className="__sg_so_cta pointer-events-auto relative mt-[max(18px,2.6cqi)] cursor-pointer px-[max(26px,3.4cqi)] py-[max(11px,1.4cqi)] text-[max(11px,1.3cqi)] font-bold tracking-[0.2em] text-white uppercase transition-[transform,filter] duration-150 hover:brightness-115 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70 active:scale-95"
						style={rise(2)}
					>
						<span
							aria-hidden
							className="pointer-events-none absolute inset-0 overflow-hidden"
							style={{
								clipPath: gemClip,
								backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${coreColor} 55%, white) 0%, ${coreColor} 45%, color-mix(in srgb, ${coreColor} 55%, black) 100%)`,
							}}
						>
							<span
								className="absolute inset-0"
								style={{
									backgroundImage:
										"linear-gradient(115deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.28) 30.5%, rgba(255,255,255,0.28) 44%, rgba(255,255,255,0) 44.5%), linear-gradient(115deg, rgba(255,255,255,0) 62%, rgba(255,255,255,0.14) 62.5%, rgba(255,255,255,0.14) 78%, rgba(255,255,255,0) 78.5%)",
								}}
							/>
							<span
								className="__sg_so_glow absolute inset-0"
								style={{
									opacity: 0,
									backgroundImage:
										"radial-gradient(60% 130% at 50% 50%, rgba(255,255,255,0.6), rgba(255,255,255,0) 70%)",
								}}
							/>
						</span>
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
						backgroundImage: `radial-gradient(circle at 72% 50%, ${coreColor}55 0%, ${shardColor}22 30%, transparent 60%)`,
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
				// select-none because the drag surface holds text: a drag across
				// the copy would select it and the next press would start a
				// native drag-and-drop instead of an orbit.
				className={
					className ??
					"relative h-full w-full cursor-default overflow-hidden select-none @container-size [&_canvas]:touch-none"
				}
				onPointerDown={onPointerDown}
				onPointerMove={track}
				onPointerUp={endDrag}
				onPointerCancel={endDrag}
			>
				{overlay}
			</div>
		);
	},
);

ShardOrbit.displayName = "ShardOrbit";

export default ShardOrbit;








