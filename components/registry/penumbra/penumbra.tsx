"use client";

import { memo, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A cloud of dark shards hangs in a spotlight beam in front of a wall. Every
// shard sits on a ray that runs from the light to one point inside a word
// drawn on the wall, at its own depth along that ray, and is scaled by that
// depth so its shadow lands the same size whatever the depth. From the light,
// the shards therefore tile the word exactly; from anywhere else they are a
// scattered cloud. Turn the cloud and each shard slides off its ray by an
// amount that grows with its depth, so the shadow breaks into noise; bring it
// back to the true angle and the word snaps out of the noise.
//
// The shadow is a projected occupancy mask, not a three.js shadow map. The
// shards are drawn once per frame from the light's own camera, white on black,
// into a small render target; two blur passes give the penumbra its width;
// the wall shader projects each wall point through the same camera and reads
// how much of the light is blocked there. That gives direct control of the
// edge ("softness") and lets the beam's pool be a shaped ellipse rather than a
// cone of a fixed angle. The pool, the beam and the dust all share one
// projector (the light camera), so they always agree about where the light is.
//
// Idle drift moves each shard ALONG its own ray only. Its shadow does not move
// when it does, so the cloud floats and the word holds.
//
// The drag turns the cloud itself (the geometry, not the camera), so the
// vertical drag is NOT negated: drag down and the top of the cloud comes
// toward you. Pitch is clamped short of the poles. On release the cloud keeps
// its momentum and, with snapBack on, a spring pulls it back to the true
// angle. With snapBack off it stays where it is left, except for a small
// detent near the true angle that catches it once you get close.
export interface PenumbraProps {
	/** Headline. An empty string removes the element. */
	title?: string;
	/** Supporting line under the headline. An empty string removes it. */
	subtitle?: string;
	/** Call-to-action label. An empty string removes the button. */
	ctaLabel?: string;
	/** Click handler for the call-to-action. */
	onCtaClick?: () => void;
	/** The word the shadow spells at the true angle. Short words read best. */
	word?: string;
	/** How many shards, in fixed steps. More shards draw a sharper word. */
	shardCount?: "400" | "800" | "1600";
	/** Spotlight color, and the pool of light it throws on the wall. */
	lightColor?: string;
	/** Edge light on the shards. */
	rimColor?: string;
	/** Base color of the shards. */
	shardColor?: string;
	/** Color of the back wall. */
	wallColor?: string;
	/** Shard size. Small shards leave gaps in the letters. */
	shardSize?: number;
	/** How far the shards spread along the light, 0 to 1. */
	scatter?: number;
	/** How soft the shadow's edge is. 0 is a hard edge. */
	softness?: number;
	/** Spotlight strength. */
	lightIntensity?: number;
	/** Dust in the light beam. 0 hides the beam. */
	haze?: number;
	/** How far the shards float while idle, along the light. */
	drift?: number;
	/** Turn back to the true angle after you let go. */
	snapBack?: boolean;
	/** The camera leans toward the pointer, easing back on leave. */
	parallax?: boolean;
	/** Halt the loop. The cloud freezes where it is. */
	paused?: boolean;
	/** Starts at the true angle, with no drift and no entrance turn. */
	reducedMotion?: boolean;
	/** Extra classes for the root element, appended to the base classes. */
	className?: string;
}

export type PenumbraShardCount = NonNullable<PenumbraProps["shardCount"]>;

const COUNTS: Record<PenumbraShardCount, number> = {
	"400": 400,
	"800": 800,
	"1600": 1600,
};

const TAU = Math.PI * 2;

// The light, the wall (the plane z = 0) and the word on it.
const LIGHT = new THREE.Vector3(3.4, 3.1, 8.2);
const WORD_CENTER = new THREE.Vector3(0, 0.25, 0);
const WORD_H = 1.35;
const WORD_MAX_W = 5.8;

// Shard depth along its ray, as a fraction of the way from the light to the
// wall. The cloud centre sits at T0; scatter spreads the shards T_SPAN either
// side of it. Drift adds up to DRIFT_T on top, and T_MIN/T_MAX keep a shard
// from touching the lamp or the wall.
const T0 = 0.56;
const T_SPAN = 0.26;
const DRIFT_T = 0.055;
const T_MIN = 0.1;
const T_MAX = 0.9;
const CLOUD_CENTER = LIGHT.clone().lerp(WORD_CENTER, T0);

// Shadow area of one shard is ~1.47 r^2, so this size covers each sample
// cell about 1.6 times over at shardSize 1. Below ~0.75 the letters open up.
const SHARD_COVER = 1.04;

// Projector margins: the pool reaches past the word so a turned cloud still
// throws its shadow inside the light, and it never gets thinner than POOL_ASPECT.
const MASK_MARGIN = 1.38;
const POOL_ASPECT = 2.3;
const MASK_W = 1024;

// Camera rig. The eye sits left of the light and a little low, so the cloud is
// seen across the beam, where its depth spread reads as noise.
const CAM_DIST = 13.2;
const CAM_YAW = -0.36;
const CAM_PITCH = 0.04;
const CAM_TARGET = new THREE.Vector3(1.05, 1.0, 2.2);

const PITCH_LIMIT = 1.25;
const SPRING_K = 15;
const SPRING_DAMP = 0.6;
const DETENT = 0.11;

// Dust and beam shimmer phases wrap on this period; every rate on them is a
// whole number of cycles per period, so the wrap is invisible.
const PERIOD = 600;
const DUST_COUNT = 280;
const BEAM_SEGMENTS = 96;

const FONT = '900 200px "Arial Black", "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif';

// Seeded so the cloud is the same cloud on every load.
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

function hashWord(word: string) {
	let h = 0x811c9dc5;
	for (let i = 0; i < word.length; i++) {
		h ^= word.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

interface Cloud {
	count: number;
	/** Wall target of each shard, xy on the plane z = 0. */
	target: Float32Array;
	/** Depth offset in -1..1, scaled by scatter each frame. */
	depth: Float32Array;
	/** Drift phase, drift rate, roll phase. */
	motion: Float32Array;
	/** Base orientation: shard face square to its ray, plus a random roll. */
	orient: Float32Array;
	/** In-plane stretch, x and y. */
	stretch: Float32Array;
	/** Shadow size of one shard on the wall at shardSize 1, in world units. */
	cell: number;
	/** Half extents of the word on the wall. */
	halfW: number;
	halfH: number;
}

// The word is drawn once on a 2D canvas and sampled on a jittered grid whose
// spacing is chosen from the ink area, so the shards spread evenly through the
// letters whatever the word. Any shortfall is topped up from random ink pixels.
function buildCloud(word: string, count: number): Cloud {
	const rand = mulberry32(0x9e3779b9 ^ hashWord(word) ^ count);
	const text = word.trim() || " ";
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	let halfW = 1;
	let halfH = WORD_H / 2;
	const points: number[] = [];
	let cell = 0.1;
	if (ctx) {
		ctx.font = FONT;
		const w = Math.ceil(ctx.measureText(text).width) + 80;
		canvas.width = Math.max(64, w);
		canvas.height = 300;
		ctx.font = FONT;
		ctx.fillStyle = "#fff";
		ctx.textBaseline = "middle";
		ctx.textAlign = "center";
		ctx.fillText(text, canvas.width / 2, canvas.height / 2);
		const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
		const W = canvas.width;
		const H = canvas.height;
		const ink = (x: number, y: number) => {
			const xi = Math.min(W - 1, Math.max(0, Math.floor(x)));
			const yi = Math.min(H - 1, Math.max(0, Math.floor(y)));
			return data[(yi * W + xi) * 4 + 3] > 127;
		};
		let x0 = W;
		let x1 = 0;
		let y0 = H;
		let y1 = 0;
		let area = 0;
		for (let y = 0; y < H; y++) {
			for (let x = 0; x < W; x++) {
				if (data[(y * W + x) * 4 + 3] > 127) {
					area++;
					if (x < x0) x0 = x;
					if (x > x1) x1 = x;
					if (y < y0) y0 = y;
					if (y > y1) y1 = y;
				}
			}
		}
		if (area > 0) {
			const pxW = x1 - x0 + 1;
			const pxH = y1 - y0 + 1;
			const scale = Math.min(WORD_H / pxH, WORD_MAX_W / pxW);
			halfW = (pxW * scale) / 2;
			halfH = (pxH * scale) / 2;
			const cx = (x0 + x1 + 1) / 2;
			const cy = (y0 + y1 + 1) / 2;
			const spacing = Math.sqrt(area / count);
			const picked: Array<[number, number]> = [];
			for (let gy = y0; gy <= y1; gy += spacing) {
				for (let gx = x0; gx <= x1; gx += spacing) {
					const sx = gx + (0.5 + (rand() - 0.5) * 0.8) * spacing;
					const sy = gy + (0.5 + (rand() - 0.5) * 0.8) * spacing;
					if (ink(sx, sy)) picked.push([sx, sy]);
				}
			}
			for (let i = picked.length - 1; i > 0; i--) {
				const j = Math.floor(rand() * (i + 1));
				const swap = picked[i];
				picked[i] = picked[j];
				picked[j] = swap;
			}
			picked.length = Math.min(picked.length, count);
			let guard = 0;
			while (picked.length < count && guard++ < count * 400) {
				const sx = x0 + rand() * pxW;
				const sy = y0 + rand() * pxH;
				if (ink(sx, sy)) picked.push([sx, sy]);
			}
			for (const [sx, sy] of picked) {
				points.push(
					WORD_CENTER.x + (sx - cx) * scale,
					WORD_CENTER.y - (sy - cy) * scale,
				);
			}
			cell = spacing * scale;
		}
	}
	while (points.length < count * 2) {
		points.push(
			WORD_CENTER.x + (rand() - 0.5) * 2 * halfW,
			WORD_CENTER.y + (rand() - 0.5) * 2 * halfH,
		);
	}

	const target = new Float32Array(points.slice(0, count * 2));
	const depth = new Float32Array(count);
	const motion = new Float32Array(count * 3);
	const orient = new Float32Array(count * 4);
	const stretch = new Float32Array(count * 2);
	const z = new THREE.Vector3(0, 0, 1);
	const dir = new THREE.Vector3();
	const q = new THREE.Quaternion();
	const roll = new THREE.Quaternion();
	for (let i = 0; i < count; i++) {
		// Sum of two uniforms: shards crowd the cloud's middle depth and thin
		// out toward the lamp and the wall.
		depth[i] = rand() + rand() - 1;
		motion[i * 3] = rand() * TAU;
		motion[i * 3 + 1] = 0.25 + rand() * 0.35;
		motion[i * 3 + 2] = rand() * TAU;
		dir.set(target[i * 2] - LIGHT.x, target[i * 2 + 1] - LIGHT.y, -LIGHT.z).normalize();
		q.setFromUnitVectors(z, dir);
		roll.setFromAxisAngle(z, rand() * TAU);
		q.multiply(roll);
		orient[i * 4] = q.x;
		orient[i * 4 + 1] = q.y;
		orient[i * 4 + 2] = q.z;
		orient[i * 4 + 3] = q.w;
		const s = 0.8 + rand() * 0.4;
		stretch[i * 2] = s * (0.8 + rand() * 0.4);
		stretch[i * 2 + 1] = s / Math.sqrt(stretch[i * 2] / s);
	}
	return { count, target, depth, motion, orient, stretch, cell, halfW, halfH };
}

// One shard: a scalene triangle with a little thickness, so its edges can
// catch the rim light. Flat shading comes from screen derivatives in the
// shader, so the geometry carries no normals.
function buildShardGeometry() {
	const tri: Array<[number, number]> = [
		[0, 1.15],
		[-0.9, -0.55],
		[0.75, -0.7],
	];
	const h = 0.07;
	const pos: number[] = [];
	const v = (i: number, z: number) => [tri[i][0], tri[i][1], z];
	pos.push(...v(0, h), ...v(1, h), ...v(2, h));
	pos.push(...v(0, -h), ...v(2, -h), ...v(1, -h));
	for (let i = 0; i < 3; i++) {
		const j = (i + 1) % 3;
		pos.push(...v(i, h), ...v(i, -h), ...v(j, h));
		pos.push(...v(j, h), ...v(i, -h), ...v(j, -h));
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
	return g;
}

// The pool of light on the wall: a superellipse in projector space, soft at
// its rim and a little brighter in the middle. Shared by every shader.
const POOL_GLSL = /* glsl */ `
float poolMask(vec2 n) {
	vec2 a = abs(n);
	float r = pow(a.x * a.x * a.x + a.y * a.y * a.y, 1.0 / 3.0);
	return (1.0 - smoothstep(0.76, 1.0, r)) * (0.8 + 0.2 * (1.0 - r * r));
}
`;

const SHARD_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
	vec4 p = vec4(position, 1.0);
	#ifdef USE_INSTANCING
	p = instanceMatrix * p;
	#endif
	vec4 w = modelMatrix * p;
	vWorld = w.xyz;
	gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const SHARD_FRAG = /* glsl */ `
precision highp float;
varying vec3 vWorld;
uniform vec3 uShard;
uniform vec3 uRim;
uniform vec3 uLight;
uniform vec3 uLightPos;
uniform float uIntensity;
uniform mat4 uMaskVP;
${POOL_GLSL}
void main() {
	vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
	vec3 v = normalize(cameraPosition - vWorld);
	if (dot(n, v) < 0.0) n = -n;
	vec3 l = normalize(uLightPos - vWorld);
	vec4 c = uMaskVP * vec4(vWorld, 1.0);
	float beam = c.w > 0.0 ? poolMask(c.xy / c.w) : 0.0;
	beam = 0.25 + 0.75 * beam;
	float diff = max(dot(n, l), 0.0);
	vec3 h = normalize(l + v);
	float spec = pow(max(dot(n, h), 0.0), 48.0);
	float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
	vec3 rimDir = normalize(vec3(-0.45, 0.55, -0.7));
	float back = pow(max(dot(n, rimDir), 0.0), 2.0);
	vec3 col = uShard * (0.35 + diff * beam * uIntensity * 1.6 * uLight);
	col += uLight * spec * beam * uIntensity * 0.9;
	col += uRim * (fres * 0.22 + back * 0.28);
	gl_FragColor = vec4(col, 1.0);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;

const WALL_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
	vec4 w = modelMatrix * vec4(position, 1.0);
	vWorld = w.xyz;
	gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const WALL_FRAG = /* glsl */ `
precision highp float;
varying vec3 vWorld;
uniform sampler2D uMask;
uniform mat4 uMaskVP;
uniform vec3 uWall;
uniform vec3 uLight;
uniform vec3 uRim;
uniform vec3 uLightPos;
uniform float uIntensity;
uniform float uAlign;
${POOL_GLSL}
float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
	vec4 c = uMaskVP * vec4(vWorld, 1.0);
	vec2 n = c.xy / max(c.w, 1e-4);
	float front = step(0.0, c.w);
	vec2 uv = n * 0.5 + 0.5;
	float inside = front * step(abs(n.x), 1.0) * step(abs(n.y), 1.0);
	float occ = texture2D(uMask, uv).r * inside;
	float pool = poolMask(n) * front;
	vec3 l = normalize(uLightPos - vWorld);
	float lambert = max(l.z, 0.0);
	float lit = pool * lambert * (1.0 - occ * 0.93);
	float spill = front * exp(-dot(n, n) * 0.55) * 0.07;
	float plaster = 0.9 + 0.07 * vnoise(vWorld.xy * 7.0) + 0.03 * vnoise(vWorld.xy * 31.0);
	vec3 col = uWall * plaster * (0.045 + spill * uLight * uIntensity + uLight * uIntensity * lit * 1.1);
	float fringe = occ * (1.0 - occ) * 4.0;
	col += uRim * fringe * pool * uIntensity * (0.03 + 0.07 * uAlign);
	gl_FragColor = vec4(col, 1.0);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;

// Beam and dust: each vertex names a point by projector coordinates plus a
// depth fraction t, and the shader walks out from the lamp to find it. Both
// therefore follow the projector when the word (and so the pool) changes.
const PROJECT_GLSL = /* glsl */ `
uniform vec3 uLightPos;
uniform mat3 uLightRot;
uniform vec2 uTan;
vec3 beamPoint(vec2 n, float t) {
	vec3 d = uLightRot * vec3(n.x * uTan.x, n.y * uTan.y, -1.0);
	float s = -uLightPos.z / d.z;
	return uLightPos + d * s * t;
}
`;

const BEAM_VERT = /* glsl */ `
attribute vec3 aBeam;
varying vec3 vWorld;
varying float vT;
${PROJECT_GLSL}
void main() {
	vec3 w = beamPoint(aBeam.xy, aBeam.z);
	vWorld = w;
	vT = aBeam.z;
	gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`;

const BEAM_FRAG = /* glsl */ `
precision highp float;
varying vec3 vWorld;
varying float vT;
uniform vec3 uLight;
uniform float uHaze;
uniform float uIntensity;
uniform float uPhase;
void main() {
	vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
	vec3 v = normalize(cameraPosition - vWorld);
	float face = pow(abs(dot(n, v)), 1.6);
	float along = smoothstep(0.0, 0.35, vT) * (1.0 - 0.55 * vT) * (1.0 - 0.6 * smoothstep(0.85, 1.0, vT));
	float shimmer = 0.85 + 0.15 * sin(6.2831853 * uPhase * 3.0 + vWorld.x * 2.1 + vWorld.y * 1.3)
		* sin(6.2831853 * uPhase * 2.0 - vWorld.z * 1.7);
	float a = face * along * shimmer * uHaze * 0.16;
	gl_FragColor = vec4(uLight * uIntensity * a, 1.0);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;

const DUST_VERT = /* glsl */ `
attribute vec4 aSeed;
attribute vec4 aRate;
uniform float uPhase;
uniform float uFocal;
varying float vAlpha;
${PROJECT_GLSL}
${POOL_GLSL}
void main() {
	float tau = 6.2831853;
	vec2 n = aSeed.xy + 0.05 * vec2(sin(tau * (aRate.x * uPhase) + aSeed.w * tau), cos(tau * (aRate.y * uPhase) + aSeed.z * tau));
	float t = 0.12 + 0.84 * fract(aSeed.z + aRate.z * uPhase);
	vec3 w = beamPoint(n, t);
	vec4 view = viewMatrix * vec4(w, 1.0);
	float dist = -view.z;
	float tw = 0.5 + 0.5 * sin(tau * aRate.w * uPhase + aSeed.w * tau);
	float ends = smoothstep(0.12, 0.25, t) * (1.0 - smoothstep(0.85, 0.96, t));
	vAlpha = poolMask(n) * ends * (0.3 + 0.7 * tw);
	gl_Position = projectionMatrix * view;
	gl_PointSize = clamp((0.02 + aSeed.w * 0.03) * uFocal / max(dist, 0.1), 1.0, 12.0);
}
`;

const DUST_FRAG = /* glsl */ `
precision highp float;
varying float vAlpha;
uniform vec3 uLight;
uniform float uHaze;
uniform float uIntensity;
void main() {
	vec2 d = gl_PointCoord - 0.5;
	float r2 = dot(d, d) * 4.0;
	float a = exp(-r2 * 5.0) * (1.0 - smoothstep(0.7, 1.0, r2));
	gl_FragColor = vec4(uLight * uIntensity * a * vAlpha * uHaze * 0.9, 1.0);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Nine taps either side of the centre, gaussian weights. The tap spacing
// scales with softness, so the edge widens without the cost changing.
const BLUR_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uStep;
void main() {
	float sum = texture2D(uTex, vUv).r * 0.1585;
	sum += (texture2D(uTex, vUv + uStep * 1.0).r + texture2D(uTex, vUv - uStep * 1.0).r) * 0.1465;
	sum += (texture2D(uTex, vUv + uStep * 2.0).r + texture2D(uTex, vUv - uStep * 2.0).r) * 0.1156;
	sum += (texture2D(uTex, vUv + uStep * 3.0).r + texture2D(uTex, vUv - uStep * 3.0).r) * 0.0778;
	sum += (texture2D(uTex, vUv + uStep * 4.0).r + texture2D(uTex, vUv - uStep * 4.0).r) * 0.0447;
	gl_FragColor = vec4(vec3(sum / 0.9277), 1.0);
}
`;

const hexLuma = (hex: string) => {
	const h = hex.replace("#", "");
	const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
	const n = parseInt(full, 16);
	if (Number.isNaN(n) || full.length !== 6) return 0.5;
	return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};

const wrapAngle = (a: number) => {
	const r = ((a + Math.PI) % TAU + TAU) % TAU;
	return r - Math.PI;
};

const Penumbra = memo(
	({
		title = "Find the angle",
		subtitle = "From most sides it is only noise. Turn it until the shadow says something.",
		ctaLabel = "Step into the light",
		onCtaClick,
		word = "SHADE",
		shardCount = "800",
		lightColor = "#f3eeff",
		rimColor = "#a855f7",
		shardColor = "#17141f",
		wallColor = "#77728a",
		shardSize = 1,
		scatter = 0.6,
		softness = 0.35,
		lightIntensity = 1.2,
		haze = 0.35,
		drift = 0.5,
		snapBack = true,
		parallax = true,
		paused = false,
		reducedMotion = false,
		className,
	}: PenumbraProps) => {
		const containerRef = useRef<HTMLDivElement>(null);
		const drawRef = useRef<((dt: number) => void | false) | null>(null);
		const measureRef = useRef<((m: Metrics) => void) | null>(null);
		const rebuildRef = useRef<((count: PenumbraShardCount, word: string) => void) | null>(null);
		const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(null);
		// Turn state lives in a ref written by the handlers and read by the loop.
		// The cloud starts turned away and springs to its true angle: the
		// entrance IS the reveal. Reduced motion starts it home.
		const turn = useRef({
			yaw: reducedMotion ? 0 : 0.95,
			pitch: reducedMotion ? 0 : -0.32,
			vYaw: 0,
			vPitch: 0,
			dragging: false,
			touched: false,
			pointerId: -1,
			lastX: 0,
			lastY: 0,
			lastT: 0,
		});
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
			onResize: (m) => measureRef.current?.(m),
			onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
			gl: () => glRef.current,
		});

		const live = useRef({
			lightColor, rimColor, shardColor, wallColor, shardSize, scatter, softness,
			lightIntensity, haze, drift, snapBack, parallax, reducedMotion,
		});
		live.current = {
			lightColor, rimColor, shardColor, wallColor, shardSize, scatter, softness,
			lightIntensity, haze, drift, snapBack, parallax, reducedMotion,
		};

		useEffect(() => {
			const container = containerRef.current;
			if (fallback || !container) return;

			let renderer: THREE.WebGLRenderer;
			try {
				renderer = new THREE.WebGLRenderer({
					antialias: true,
					alpha: false,
					powerPreference: "high-performance",
				});
			} catch {
				setFallback(true);
				return;
			}
			glRef.current = renderer.getContext();
			renderer.toneMapping = THREE.ACESFilmicToneMapping;
			renderer.toneMappingExposure = 1.05;
			const canvas = renderer.domElement;
			canvas.style.display = "block";
			canvas.style.position = "absolute";
			canvas.style.inset = "0";
			container.prepend(canvas);

			const scene = new THREE.Scene();
			scene.background = new THREE.Color("#050408");
			const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 90);
			let shift = [0, 0];
			let landscape = true;
			let distMul = 1;
			let focal = 600;

			// ── The projector: a camera at the lamp, looking at the word. ─────
			const lightCam = new THREE.PerspectiveCamera(30, 2, 0.5, 40);
			lightCam.layers.set(1);
			const maskVP = new THREE.Matrix4();
			const lightRot = new THREE.Matrix3();
			const tan = new THREE.Vector2(0.3, 0.15);
			const rtOpts = {
				type: THREE.UnsignedByteType,
				format: THREE.RGBAFormat,
				depthBuffer: false,
				minFilter: THREE.LinearFilter,
				magFilter: THREE.LinearFilter,
			};
			const maskRT = new THREE.WebGLRenderTarget(MASK_W, 400, rtOpts);
			const blurA = new THREE.WebGLRenderTarget(MASK_W / 2, 200, rtOpts);
			const blurB = new THREE.WebGLRenderTarget(MASK_W / 2, 200, rtOpts);
			const maskMaterial = new THREE.MeshBasicMaterial({
				color: 0xffffff,
				side: THREE.DoubleSide,
			});

			const fitProjector = (cloud: Cloud) => {
				lightCam.position.copy(LIGHT);
				lightCam.up.set(0, 1, 0);
				lightCam.lookAt(WORD_CENTER);
				lightCam.updateMatrixWorld(true);
				const inv = lightCam.matrixWorldInverse;
				let tx = 0;
				let ty = 0;
				const corner = new THREE.Vector3();
				for (const sx of [-1, 1]) {
					for (const sy of [-1, 1]) {
						corner
							.set(WORD_CENTER.x + sx * cloud.halfW, WORD_CENTER.y + sy * cloud.halfH, 0)
							.applyMatrix4(inv);
						tx = Math.max(tx, Math.abs(corner.x / corner.z));
						ty = Math.max(ty, Math.abs(corner.y / corner.z));
					}
				}
				tx *= MASK_MARGIN;
				ty = Math.max(ty * MASK_MARGIN, tx / POOL_ASPECT);
				tan.set(tx, ty);
				lightCam.fov = (2 * Math.atan(ty) * 180) / Math.PI;
				lightCam.aspect = tx / ty;
				lightCam.updateProjectionMatrix();
				maskVP.multiplyMatrices(lightCam.projectionMatrix, inv);
				lightRot.setFromMatrix4(lightCam.matrixWorld);
				const h = Math.max(64, Math.round(MASK_W / lightCam.aspect));
				maskRT.setSize(MASK_W, h);
				blurA.setSize(MASK_W / 2, Math.round(h / 2));
				blurB.setSize(MASK_W / 2, Math.round(h / 2));
			};

			// ── Wall ────────────────────────────────────────────────────────
			const wallMaterial = new THREE.ShaderMaterial({
				uniforms: {
					uMask: { value: blurB.texture },
					uMaskVP: { value: maskVP },
					uWall: { value: new THREE.Color(wallColor) },
					uLight: { value: new THREE.Color(lightColor) },
					uRim: { value: new THREE.Color(rimColor) },
					uLightPos: { value: LIGHT },
					uIntensity: { value: lightIntensity },
					uAlign: { value: 0 },
				},
				vertexShader: WALL_VERT,
				fragmentShader: WALL_FRAG,
			});
			const wall = new THREE.Mesh(new THREE.PlaneGeometry(70, 46), wallMaterial);
			scene.add(wall);

			// ── Shards ──────────────────────────────────────────────────────
			const shardGeometry = buildShardGeometry();
			const shardMaterial = new THREE.ShaderMaterial({
				uniforms: {
					uShard: { value: new THREE.Color(shardColor) },
					uRim: { value: new THREE.Color(rimColor) },
					uLight: { value: new THREE.Color(lightColor) },
					uLightPos: { value: LIGHT },
					uIntensity: { value: lightIntensity },
					uMaskVP: { value: maskVP },
				},
				vertexShader: SHARD_VERT,
				fragmentShader: SHARD_FRAG,
				side: THREE.DoubleSide,
			});
			const cloudGroup = new THREE.Group();
			cloudGroup.position.copy(CLOUD_CENTER);
			cloudGroup.rotation.order = "XYZ";
			scene.add(cloudGroup);
			let cloud: Cloud | null = null;
			let shards: THREE.InstancedMesh | null = null;
			let builtKey = "";

			const rebuild = (count: PenumbraShardCount, nextWord: string) => {
				const key = `${count}|${nextWord}`;
				if (key === builtKey) return;
				builtKey = key;
				if (shards) {
					cloudGroup.remove(shards);
					shards.dispose();
				}
				cloud = buildCloud(nextWord, COUNTS[count]);
				fitProjector(cloud);
				shards = new THREE.InstancedMesh(shardGeometry, shardMaterial, cloud.count);
				shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
				shards.frustumCulled = false;
				shards.layers.enable(1);
				cloudGroup.add(shards);
				loop.paint();
			};

			// ── Beam and dust ───────────────────────────────────────────────
			const projectUniforms = {
				uLightPos: { value: LIGHT },
				uLightRot: { value: lightRot },
				uTan: { value: tan },
			};
			const shared = {
				uLight: { value: new THREE.Color(lightColor) },
				uHaze: { value: haze },
				uIntensity: { value: lightIntensity },
				uPhase: { value: 0 },
			};
			const beamAttr: number[] = [];
			const beamIndex: number[] = [];
			// Rings at the pool's edge; a superellipse to match poolMask.
			for (let i = 0; i <= BEAM_SEGMENTS; i++) {
				const a = (i / BEAM_SEGMENTS) * TAU;
				const c = Math.cos(a);
				const s = Math.sin(a);
				const x = Math.sign(c) * Math.pow(Math.abs(c), 2 / 3) * 0.93;
				const y = Math.sign(s) * Math.pow(Math.abs(s), 2 / 3) * 0.93;
				beamAttr.push(x, y, 0.02, x, y, 1);
				if (i < BEAM_SEGMENTS) {
					const k = i * 2;
					beamIndex.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
				}
			}
			const beamGeometry = new THREE.BufferGeometry();
			beamGeometry.setAttribute("aBeam", new THREE.Float32BufferAttribute(beamAttr, 3));
			beamGeometry.setAttribute(
				"position",
				new THREE.Float32BufferAttribute(new Array(beamAttr.length).fill(0), 3),
			);
			beamGeometry.setIndex(beamIndex);
			const beamMaterial = new THREE.ShaderMaterial({
				uniforms: { ...projectUniforms, ...shared },
				vertexShader: BEAM_VERT,
				fragmentShader: BEAM_FRAG,
				side: THREE.DoubleSide,
				transparent: true,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
			});
			const beam = new THREE.Mesh(beamGeometry, beamMaterial);
			beam.frustumCulled = false;
			beam.renderOrder = 2;
			scene.add(beam);

			const dustRand = mulberry32(0xd057);
			const seeds = new Float32Array(DUST_COUNT * 4);
			const rates = new Float32Array(DUST_COUNT * 4);
			for (let i = 0; i < DUST_COUNT; i++) {
				const a = dustRand() * TAU;
				const r = Math.sqrt(dustRand()) * 0.9;
				seeds[i * 4] = Math.cos(a) * r;
				seeds[i * 4 + 1] = Math.sin(a) * r;
				seeds[i * 4 + 2] = dustRand();
				seeds[i * 4 + 3] = dustRand();
				rates[i * 4] = 2 + Math.floor(dustRand() * 6);
				rates[i * 4 + 1] = 2 + Math.floor(dustRand() * 6);
				rates[i * 4 + 2] = 1 + Math.floor(dustRand() * 3);
				rates[i * 4 + 3] = 40 + Math.floor(dustRand() * 120);
			}
			const dustGeometry = new THREE.BufferGeometry();
			dustGeometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
			dustGeometry.setAttribute("aRate", new THREE.BufferAttribute(rates, 4));
			dustGeometry.setAttribute(
				"position",
				new THREE.BufferAttribute(new Float32Array(DUST_COUNT * 3), 3),
			);
			const dustMaterial = new THREE.ShaderMaterial({
				uniforms: { ...projectUniforms, ...shared, uFocal: { value: focal } },
				vertexShader: DUST_VERT,
				fragmentShader: DUST_FRAG,
				transparent: true,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
			});
			const dust = new THREE.Points(dustGeometry, dustMaterial);
			dust.frustumCulled = false;
			dust.renderOrder = 3;
			scene.add(dust);

			// ── Post: blur the occupancy mask into a penumbra. ──────────────
			const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
			const blurMaterial = new THREE.ShaderMaterial({
				uniforms: {
					uTex: { value: maskRT.texture },
					uStep: { value: new THREE.Vector2() },
				},
				vertexShader: QUAD_VERT,
				fragmentShader: BLUR_FRAG,
				depthTest: false,
				depthWrite: false,
			});
			const quadScene = new THREE.Scene();
			const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMaterial);
			quad.frustumCulled = false;
			quadScene.add(quad);

			rebuild(shardCount, word);
			rebuildRef.current = rebuild;

			// ── Frame ───────────────────────────────────────────────────────
			let time = 0;
			let phase = 0;
			const m4 = new THREE.Matrix4();
			const pos = new THREE.Vector3();
			const quat = new THREE.Quaternion();
			const wob = new THREE.Quaternion();
			const scl = new THREE.Vector3();
			const black = new THREE.Color(0x000000);

			const placeShards = (scatterAmt: number, driftAmt: number, sizeAmt: number) => {
				if (!cloud || !shards) return;
				const c = cloud;
				const shadow = c.cell * SHARD_COVER * sizeAmt;
				for (let i = 0; i < c.count; i++) {
					const ph = c.motion[i * 3];
					const rate = c.motion[i * 3 + 1];
					let t = T0 + c.depth[i] * T_SPAN * scatterAmt;
					t += Math.sin(ph + time * rate) * DRIFT_T * driftAmt;
					t = Math.min(T_MAX, Math.max(T_MIN, t));
					const wx = c.target[i * 2];
					const wy = c.target[i * 2 + 1];
					pos.set(
						LIGHT.x + (wx - LIGHT.x) * t - CLOUD_CENTER.x,
						LIGHT.y + (wy - LIGHT.y) * t - CLOUD_CENTER.y,
						LIGHT.z * (1 - t) - CLOUD_CENTER.z,
					);
					quat.set(c.orient[i * 4], c.orient[i * 4 + 1], c.orient[i * 4 + 2], c.orient[i * 4 + 3]);
					const w = Math.sin(c.motion[i * 3 + 2] + time * rate * 0.7) * 0.22 * driftAmt;
					wob.set(0, 0, Math.sin(w / 2), Math.cos(w / 2));
					quat.multiply(wob);
					const size = shadow * t;
					scl.set(size * c.stretch[i * 2], size * c.stretch[i * 2 + 1], size);
					m4.compose(pos, quat, scl);
					shards.setMatrixAt(i, m4);
				}
				shards.instanceMatrix.needsUpdate = true;
			};

			drawRef.current = (dt) => {
				const l = live.current;
				const o = turn.current;
				const p = pointer.current;
				const frozen = pausedRef.current;
				const step = frozen ? 0 : Math.min(dt, 1 / 30);
				const still = frozen || l.reducedMotion;

				if (!still) {
					time += step;
					phase = (phase + step / PERIOD) % 1;
				}

				// Release: momentum, then a spring home. Reduced motion swaps the
				// spring for a fast, critically damped return with no overshoot.
				const near = Math.abs(wrapAngle(o.yaw)) < DETENT && Math.abs(o.pitch) < DETENT;
				const pull = l.snapBack || !o.touched || near;
				if (!o.dragging && step > 0) {
					if (pull) {
						o.yaw = wrapAngle(o.yaw);
						const k = l.reducedMotion ? 60 : near && !l.snapBack ? 9 : SPRING_K;
						const damp = l.reducedMotion ? 1 : SPRING_DAMP;
						const c = 2 * Math.sqrt(k) * damp;
						o.vYaw += (-k * o.yaw - c * o.vYaw) * step;
						o.vPitch += (-k * o.pitch - c * o.vPitch) * step;
					} else {
						const f = Math.exp(-2.6 * step);
						o.vYaw *= f;
						o.vPitch *= f;
					}
					o.yaw += o.vYaw * step;
					o.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, o.pitch + o.vPitch * step));
					if (Math.abs(o.pitch) >= PITCH_LIMIT) o.vPitch = 0;
				}
				cloudGroup.rotation.set(o.pitch, o.yaw, 0);

				const ease = frozen ? 0 : Math.min(1, Math.min(dt, 1 / 30) * 4);
				const lean = l.parallax && !l.reducedMotion;
				p.x += ((lean ? p.tx : 0) - p.x) * ease;
				p.y += ((lean ? p.ty : 0) - p.y) * ease;

				const yaw = CAM_YAW + p.x * 0.14;
				const pitch = CAM_PITCH + p.y * 0.07;
				camera.position.set(
					CAM_TARGET.x + Math.sin(yaw) * Math.cos(pitch) * CAM_DIST * distMul,
					CAM_TARGET.y + Math.sin(pitch) * CAM_DIST * distMul,
					CAM_TARGET.z + Math.cos(yaw) * Math.cos(pitch) * CAM_DIST * distMul,
				);
				camera.lookAt(CAM_TARGET);
				camera.updateMatrixWorld();

				placeShards(l.scatter, l.reducedMotion ? 0 : l.drift, l.shardSize);

				const off = Math.hypot(wrapAngle(o.yaw), o.pitch);
				wallMaterial.uniforms.uAlign.value = Math.exp(-(off * off) / 0.0025);
				wallMaterial.uniforms.uWall.value.set(l.wallColor);
				wallMaterial.uniforms.uLight.value.set(l.lightColor);
				wallMaterial.uniforms.uRim.value.set(l.rimColor);
				wallMaterial.uniforms.uIntensity.value = l.lightIntensity;
				shardMaterial.uniforms.uShard.value.set(l.shardColor);
				shardMaterial.uniforms.uRim.value.set(l.rimColor);
				shardMaterial.uniforms.uLight.value.set(l.lightColor);
				shardMaterial.uniforms.uIntensity.value = l.lightIntensity;
				shared.uLight.value.set(l.lightColor);
				shared.uHaze.value = l.haze;
				shared.uIntensity.value = l.lightIntensity;
				shared.uPhase.value = phase;
				dustMaterial.uniforms.uFocal.value = focal;
				beam.visible = dust.visible = l.haze > 0.001;

				// Pass 1: the shards from the lamp, white on black.
				const bg = scene.background;
				scene.background = black;
				scene.overrideMaterial = maskMaterial;
				renderer.setRenderTarget(maskRT);
				renderer.render(scene, lightCam);
				scene.overrideMaterial = null;
				scene.background = bg;

				// Passes 2 and 3: the penumbra. Tap spacing in blur texels.
				const spread = 0.6 + l.softness * l.softness * 7 + l.softness * 2;
				blurMaterial.uniforms.uTex.value = maskRT.texture;
				blurMaterial.uniforms.uStep.value.set(spread / blurA.width, 0);
				renderer.setRenderTarget(blurA);
				renderer.render(quadScene, quadCam);
				blurMaterial.uniforms.uTex.value = blurA.texture;
				blurMaterial.uniforms.uStep.value.set(0, spread / blurA.height);
				renderer.setRenderTarget(blurB);
				renderer.render(quadScene, quadCam);
				renderer.setRenderTarget(null);

				renderer.render(scene, camera);

				// Reduced motion has nothing running on its own: stop once the
				// cloud is home and the hand has let go. A handler restarts it.
				if (l.reducedMotion && !frozen) {
					const busy =
						o.dragging ||
						Math.abs(o.vYaw) + Math.abs(o.vPitch) > 0.002 ||
						(pull && Math.abs(wrapAngle(o.yaw)) + Math.abs(o.pitch) > 0.002) ||
						Math.abs(p.x) + Math.abs(p.y) > 0.002;
					if (!busy) return false;
				}
			};

			measureRef.current = ({ width, height, dpr }: Metrics) => {
				const w = Math.max(1, Math.floor(width));
				const h = Math.max(1, Math.floor(height));
				renderer.setPixelRatio(dpr);
				renderer.setSize(w, h);
				const aspect = w / h;
				landscape = aspect >= 1;
				// Landscape: the scene is shifted right of the copy with a lens
				// shift, so perspective stays straight while the composition moves.
				// Portrait: a wider lens, a step back, and the scene lifted above the copy.
				camera.fov = landscape ? 34 : Math.min(52, 34 + (1 - aspect) * 30);
				camera.aspect = aspect;
				camera.updateProjectionMatrix();
				shift = landscape ? [0.4, 0.04] : [0.32, 0.22];
				// A narrow frame also steps back, or the word runs off both edges.
				distMul = landscape ? 1 : 1 + (1 - aspect) * 0.9;
				camera.projectionMatrix.elements[8] = -shift[0];
				camera.projectionMatrix.elements[9] = -shift[1];
				camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
				focal = (h * dpr * 0.5) / Math.tan((camera.fov * Math.PI) / 360);
				drawRef.current?.(0);
			};

			loop.resize();
			loop.start();

			return () => {
				drawRef.current = null;
				measureRef.current = null;
				rebuildRef.current = null;
				shards?.dispose();
				shardGeometry.dispose();
				shardMaterial.dispose();
				wall.geometry.dispose();
				wallMaterial.dispose();
				beamGeometry.dispose();
				beamMaterial.dispose();
				dustGeometry.dispose();
				dustMaterial.dispose();
				quad.geometry.dispose();
				blurMaterial.dispose();
				maskMaterial.dispose();
				maskRT.dispose();
				blurA.dispose();
				blurB.dispose();
				renderer.dispose();
				if (container.contains(canvas)) container.removeChild(canvas);
			};
			// Built once. Shard count and word swap the cloud through rebuildRef;
			// every other prop reaches the shaders through the live ref.
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [fallback]);

		useEffect(() => {
			rebuildRef.current?.(shardCount, word);
		}, [shardCount, word]);

		useEffect(() => {
			loop.paint();
		}, [
			lightColor, rimColor, shardColor, wallColor, shardSize, scatter, softness,
			lightIntensity, haze, drift, snapBack, parallax, reducedMotion, loop,
		]);

		const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
			if ((e.target as Element).closest("button, a")) return;
			if (e.pointerType === "mouse" && e.button !== 0) return;
			const o = turn.current;
			o.dragging = true;
			o.touched = true;
			o.pointerId = e.pointerId;
			o.lastX = e.clientX;
			o.lastY = e.clientY;
			o.lastT = e.timeStamp;
			o.vYaw = 0;
			o.vPitch = 0;
			e.currentTarget.setPointerCapture(e.pointerId);
			loop.start();
		};

		const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
			const r = e.currentTarget.getBoundingClientRect();
			if (r.width === 0 || r.height === 0) return;
			pointer.current.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
			pointer.current.ty = -(((e.clientY - r.top) / r.height) * 2 - 1);

			const o = turn.current;
			if (!o.dragging || e.pointerId !== o.pointerId) {
				if (parallax && !reducedMotion && !paused) loop.start();
				return;
			}
			const dx = e.clientX - o.lastX;
			const dy = e.clientY - o.lastY;
			const dt = (e.timeStamp - o.lastT) / 1000;
			// The cloud itself turns, so no sign flip on the vertical: drag down
			// and the top of the cloud comes toward you.
			const k = 3.4 / Math.max(240, Math.min(r.width, r.height * 1.6));
			const dYaw = dx * k;
			const dPitch = dy * k;
			o.yaw += dYaw;
			o.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, o.pitch + dPitch));
			if (dt > 0.001) {
				const blend = Math.min(1, dt * 18);
				o.vYaw += (dYaw / dt - o.vYaw) * blend;
				o.vPitch += (dPitch / dt - o.vPitch) * blend;
			}
			o.lastX = e.clientX;
			o.lastY = e.clientY;
			o.lastT = e.timeStamp;
			loop.start();
		};

		const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
			const o = turn.current;
			if (e.pointerId !== o.pointerId) return;
			if (e.currentTarget.hasPointerCapture(e.pointerId)) {
				e.currentTarget.releasePointerCapture(e.pointerId);
			}
			// A hand that stopped before letting go throws nothing.
			if (e.timeStamp - o.lastT > 80) {
				o.vYaw = 0;
				o.vPitch = 0;
			}
			if (reducedMotion) {
				o.vYaw = 0;
				o.vPitch = 0;
			}
			o.dragging = false;
			o.pointerId = -1;
			if (e.pointerType !== "mouse") {
				pointer.current.tx = 0;
				pointer.current.ty = 0;
			}
			loop.start();
		};

		const onPointerLeave = () => {
			if (turn.current.dragging) return;
			pointer.current.tx = 0;
			pointer.current.ty = 0;
			loop.start();
		};

		const rise = (i: number): React.CSSProperties =>
			reducedMotion
				? {}
				: {
						opacity: entered ? 1 : 0,
						transform: entered ? "none" : "translateY(14px)",
						transition: `opacity 700ms cubic-bezier(0.22,1,0.36,1) ${i * 110}ms, transform 700ms cubic-bezier(0.22,1,0.36,1) ${i * 110}ms`,
					};

		// The wash under the copy deepens as the wall gets lighter, so white
		// type keeps its contrast whatever wall color is dialled in.
		const wash = (0.45 + 0.4 * Math.min(1, Math.max(0, (hexLuma(wallColor) - 0.25) / 0.6))).toFixed(2);

		const overlay = (
			<div
				className="pointer-events-none absolute inset-0 z-10 flex flex-col items-start justify-end bg-[linear-gradient(0deg,rgba(4,3,8,var(--penumbra-wash)),rgba(4,3,8,0)_55%)] px-[max(20px,5.5cqi)] pb-[max(20px,6cqi)] text-left [@container(orientation:landscape)]:justify-center [@container(orientation:landscape)]:bg-[linear-gradient(90deg,rgba(4,3,8,var(--penumbra-wash)),rgba(4,3,8,0)_55%)] [@container(orientation:landscape)]:pb-0"
				style={{ ["--penumbra-wash" as string]: wash }}
			>
				{title ? (
					<h1
						className="max-w-[max(260px,40cqi)] text-[max(28px,5.4cqi)] leading-[1.02] font-semibold tracking-tight text-white"
						style={rise(0)}
					>
						{title}
					</h1>
				) : null}
				{subtitle ? (
					<p
						className="mt-[max(10px,1.4cqi)] max-w-[max(220px,34cqi)] text-[max(12px,1.7cqi)] leading-snug text-white/70"
						style={rise(1)}
					>
						{subtitle}
					</p>
				) : null}
				{ctaLabel ? (
					<div className="mt-[max(18px,2.6cqi)]" style={rise(2)}>
						<button
							type="button"
							onClick={onCtaClick}
							className="pointer-events-auto relative cursor-pointer rounded-full px-[max(24px,3.1cqi)] py-[max(10px,1.2cqi)] text-[max(11px,1.25cqi)] font-medium tracking-[0.2em] text-[#0b0a10] uppercase shadow-[0_0_0_1px_rgba(255,255,255,0.18),0_10px_40px_-12px_var(--penumbra-light)] transition-[box-shadow,transform,filter] duration-300 ease-out hover:shadow-[0_0_0_1px_rgba(255,255,255,0.4),0_0_0_5px_var(--penumbra-rim-soft),0_10px_44px_-10px_var(--penumbra-light)] hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70 active:scale-[0.97] motion-reduce:transition-none"
							style={{
								backgroundColor: lightColor,
								["--penumbra-light" as string]: lightColor,
								["--penumbra-rim-soft" as string]: `color-mix(in srgb, ${rimColor} 45%, transparent)`,
							}}
						>
							{ctaLabel}
						</button>
					</div>
				) : null}
			</div>
		);

		const rootClass = [
			"relative h-full w-full cursor-grab overflow-hidden select-none @container-size active:cursor-grabbing [&_canvas]:touch-none",
			className,
		]
			.filter(Boolean)
			.join(" ");

		if (fallback) {
			// The poster: the pool on the wall with the word already in shadow.
			return (
				<div
					className={rootClass}
					style={{
						backgroundColor: "#050408",
						backgroundImage: `radial-gradient(ellipse 34% 26% at 66% 50%, color-mix(in srgb, ${wallColor} 80%, ${lightColor}) 0%, color-mix(in srgb, ${wallColor} 55%, transparent) 60%, transparent 100%)`,
					}}
				>
					<span
						aria-hidden
						className="absolute top-1/2 left-[66%] -translate-x-1/2 -translate-y-1/2 text-[9cqi] leading-none font-black tracking-tight blur-[1px]"
						style={{ color: "rgba(6,5,10,0.85)" }}
					>
						{word}
					</span>
					{overlay}
				</div>
			);
		}

		return (
			<div
				ref={containerRef}
				// A size container: the copy's orientation query needs the block
				// axis. select-none because the drag surface holds text.
				className={rootClass}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={endDrag}
				onPointerCancel={endDrag}
				onPointerLeave={onPointerLeave}
			>
				{overlay}
			</div>
		);
	},
);

Penumbra.displayName = "Penumbra";

export default Penumbra;
