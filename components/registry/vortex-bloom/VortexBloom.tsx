"use client";

// VORTEX BLOOM — a molten-gold-and-obsidian whirlpool spiraling into a luminous
// core, rendered per-pixel in a WebGL2 fragment shader. The observer sits inside
// a swirling volumetric medium that fills the frame and winds toward a central
// SDF core (lotus / gem / flame); a separate GPU dust field sprays along the
// flow toward the eye, all under a full 360° draggable orbit and a two-pass FBO
// bloom. Structural skeleton mirrors BlackHole.tsx.

import React, { useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle, RenderTarget, Geometry } from "ogl";
import { cn } from "@/lib/utils";

// Detect iOS (all iOS browsers share WebKit's WebGL limits) for the static fallback.
function isIOS(): boolean {
	if (typeof navigator === "undefined") return false;
	return (
		/iPhone|iPad|iPod/.test(navigator.userAgent) ||
		(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
	);
}

// Real capability probe — this shader needs WebGL2 (#version 300 es + float RTs).
function supportsWebGL2(): boolean {
	if (typeof document === "undefined") return false;
	try {
		return !!document.createElement("canvas").getContext("webgl2");
	} catch {
		return false;
	}
}

// Hex → normalized RGB for live recolor without reallocating.
function hexToRgb01(hex: string): [number, number, number] {
	let h = hex.replace("#", "").trim();
	if (h.length === 3)
		h = h
			.split("")
			.map((c) => c + c)
			.join("");
	if (h.length !== 6) return [0.94, 0.66, 0.19];
	const n = parseInt(h, 16);
	if (Number.isNaN(n)) return [0.94, 0.66, 0.19];
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

type CoreObject = "lotus" | "gem" | "flame";
const CORE_INDEX: Record<CoreObject, number> = { lotus: 0, gem: 1, flame: 2 };

interface VortexBloomProps {
	primary?: string;
	secondary?: string;
	accent?: string;
	coreObject?: CoreObject;
	coreScale?: number;
	stemLength?: number;
	vortexIntensity?: number;
	glowIntensity?: number;
	particleDensity?: number;
	particleSpeed?: number;
	smokeAmount?: number;
	cameraAutoRotate?: boolean;
	rotationSpeed?: number;
	fov?: number;
	verticalOffset?: number;
	chromaticAberration?: number;
	vignette?: number;
	grain?: number;
	/** Freeze on the current pose and halt the render loop (reduced motion). */
	paused?: boolean;
	/** Cap devicePixelRatio — the volumetric march is heavy, so a DPR-3 phone
	 * would pay multiples of the fill cost. */
	maxDpr?: number;
	fallbackSrc?: string;
	className?: string;
}

// ---- Camera. The observer sits just inside the swirling medium and orbits the
// eye; a pointer drag takes over and the orbit resumes on its own once idle. No
// dolly. Full tumble — inclination spans nearly pole to pole.
const ORBIT_R = 11; // observer distance — just outside the swirl so dark smoky sky frames it
const ORBIT_INC = 50; // colatitude° from +Y — looking down the axis into the throat. The
// lotus stem hangs along this axis, so it foreshortens away here and reads when dragged lower.
const BASE_SPIN = 5; // cinematic azimuth degrees/second at rotationSpeed 1
const IDLE_MS = 1000; // pointer-idle delay before the orbit resumes
const BLOOM_DUR = 2.4; // lotus bud→full-bloom intro duration (seconds)
const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;

// The dust field never rebuilds; density is a live draw-count on a fixed pool.
const PARTICLE_CAP = 700;
const BLOOM_THRESHOLD = 1.0;

// Internal render scale for the heavy volumetric pass. This shader is a true
// per-pixel volumetric march — every ray through the medium runs the full step
// count with 3 fbm calls each — so fill cost dominates and scales with the pixel
// count. Marching at 0.7x the drawing buffer roughly halves that cost; the medium
// is soft and the full-res composite (bloom + grain + chromatic split + ACES)
// launders the LINEAR upscale, so the look is unchanged while the GPU does ~2x
// less work. Only the scene/particle/bloom RTs shrink — the composite stays
// full-res so grain and vignette keep their crisp per-device-pixel detail.
const SCENE_SCALE = 0.7;

function toCartesian(
	r: number,
	inc: number,
	az: number,
	out: Float32Array,
): void {
	const i = inc * DEG;
	const a = az * DEG;
	const si = Math.sin(i);
	out[0] = r * si * Math.cos(a);
	out[1] = r * Math.cos(i);
	out[2] = r * si * Math.sin(a);
}

const VERT = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4(position, 0.0, 1.0);
}
`;

// ---- The vortex. The camera marches OUTWARD from inside a swirling volumetric
// ball, front-to-back compositing an emissive molten medium that winds toward
// the central eye. Everything glows; no lighting model — the bloom carries it.
const VORTEX_FRAG = `#version 300 es
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uCamTarget;
uniform float uFocal;
uniform float uVOffset;
uniform vec3 uPrimary;
uniform vec3 uSecondary;
uniform vec3 uAccent;
uniform float uSwirlPhase;
uniform float uTwist;
uniform float uTurb;
uniform float uCoreGlow;
uniform float uSmoke;
uniform float uBloom;
uniform float uCoreScale;
uniform float uStemLen;
uniform int uCore;
out vec4 fragColor;

const float PI = 3.14159265;
const float TWO_PI = 6.28318530718;
const vec3 CORE = vec3(0.0, 0.0, 0.0);
const float CORE_BOUND = 2.1;
const float BOUND = 8.3;       // swirling-medium ball radius; big enough to overfill
                                // the frame at default framing so its round limb never
                                // shows as a hard cut-off (dark corners come from the
                                // outer-shell falloff instead)

float hash21(vec2 p) {
	p = fract(p * vec2(123.34, 345.45));
	p += dot(p, p + 34.345);
	return fract(p.x * p.y);
}
float hash31(vec3 p) {
	p = fract(p * 0.3183099 + 0.1);
	p *= 17.0;
	return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	float a = hash21(i);
	float b = hash21(i + vec2(1.0, 0.0));
	float c = hash21(i + vec2(0.0, 1.0));
	float d = hash21(i + vec2(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
	float s = 0.0, a = 0.5;
	for (int i = 0; i < 5; i++) {
		s += a * vnoise(p);
		p = p * 2.03 + 11.3;
		a *= 0.5;
	}
	return s;
}
float vnoise3(vec3 p) {
	vec3 i = floor(p), f = fract(p);
	vec3 u = f * f * (3.0 - 2.0 * f);
	return mix(
		mix(mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), u.x),
			mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), u.x), u.y),
		mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), u.x),
			mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), u.x), u.y),
		u.z);
}
float fbm3(vec3 p) {
	float s = 0.0, a = 0.5;
	for (int i = 0; i < 4; i++) {
		s += a * vnoise3(p);
		p = p * 2.02 + vec3(11.3, 17.1, 5.7);
		a *= 0.5;
	}
	return s;
}

vec2 raySphere(vec3 ro, vec3 rd, float rad) {
	float b = dot(ro, rd);
	float c = dot(ro, ro) - rad * rad;
	float h = b * b - c;
	if (h < 0.0) return vec2(1.0, -1.0);
	h = sqrt(h);
	return vec2(-b - h, -b + h);
}

float sdEllipsoid(vec3 p, vec3 r) {
	float k0 = length(p / r);
	float k1 = length(p / (r * r));
	return k0 * (k0 - 1.0) / max(k1, 1e-6);
}
float sdPetal(vec3 p, float tilt, float reach, float width) {
	float c = cos(tilt), s = sin(tilt);
	vec3 q = vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
	q.x -= reach;
	return sdEllipsoid(q, vec3(reach * 0.95, width * 0.34, width));
}
float sdLotus(vec3 p, float bloom, float stemLen) {
	float d = 1e5;
	float rad = length(p.xz);
	float a = atan(p.z, p.x);
	// Petals fold nearly vertical into a pointed bud at bloom=0, splay open at 1.
	float k1 = TWO_PI / 7.0;
	float a1 = mod(a + 0.5 * k1, k1) - 0.5 * k1;
	d = min(d, sdPetal(vec3(rad * cos(a1), p.y, rad * sin(a1)), mix(1.48, 0.55, bloom), 0.92, 0.5));
	float k2 = TWO_PI / 6.0;
	float a2 = mod(a + k2, k2) - 0.5 * k2;
	d = min(d, sdPetal(vec3(rad * cos(a2), p.y - 0.04, rad * sin(a2)), mix(1.52, 0.95, bloom), 0.62, 0.4));
	float k3 = TWO_PI / 5.0;
	float a3 = mod(a + 0.5 * k3, k3) - 0.5 * k3;
	d = min(d, sdPetal(vec3(rad * cos(a3), p.y - 0.02, rad * sin(a3)), mix(1.55, 1.35, bloom), 0.4, 0.32));
	d = min(d, sdEllipsoid(p - vec3(0.0, 0.14, 0.0), vec3(0.17, 0.24, 0.17)));
	// Tapered stalk hanging BELOW the flower. Local +y is world-down (the outer call
	// flips Y), so the stem lives at p.y in [0, stemLen], thick at the base → thin tip.
	if (stemLen > 0.01) {
		float sy = p.y;
		float tp = clamp(sy / stemLen, 0.0, 1.0);
		float sr = mix(0.20, 0.0, tp); // chunky trunk at the flower → tapers to a point at the tip
		// Sweep the stalk outward as it descends: a straight axial stem hides behind the
		// flower under the top-down camera, so curve it into view and let it droop.
		vec2 lean = vec2(0.32 * stemLen * tp * tp, 0.0);
		float stem = length(p.xz - lean) - sr;
		stem = max(stem, -sy);
		stem = max(stem, sy - stemLen);
		d = min(d, stem);
	}
	return d;
}
float sdIcosahedron(vec3 p, float r) {
	const float G = 0.5773502692;
	const float PHI = 1.618033989;
	vec3 n1 = normalize(vec3(PHI, 1.0, 0.0));
	vec3 n2 = normalize(vec3(0.0, PHI, 1.0));
	vec3 n3 = normalize(vec3(1.0, 0.0, PHI));
	p = abs(p);
	float d = dot(p, n1);
	d = max(d, dot(p, n2));
	d = max(d, dot(p, n3));
	d = max(d, dot(p, vec3(G)));
	return d - r;
}
float sdFlame(vec3 p) {
	// Bounded flicker time (precision rule): two rates advect the turbulence upward so
	// the plume writhes organically instead of scrolling rigidly.
	float t1 = mod(uTime * 1.7, 240.0);
	float t2 = mod(uTime * 0.9, 240.0);
	// Tall teardrop: fat rounded base tapering to a sharp tip near y = +0.95.
	float prof = 0.42 * pow(clamp(1.0 - (p.y + 0.5) / 1.4, 0.0, 1.0), 0.75)
		* smoothstep(-0.55, -0.2, p.y);
	// Turbulence licks harder toward the tip → tongues peel off the top.
	vec3 q = p * vec3(2.6, 1.7, 2.6);
	float turb = fbm3(q + vec3(0.0, -t1 * 1.7, 0.0)) * 0.6
		+ fbm3(q * 2.1 + vec3(3.0, -t2 * 2.4, 1.0)) * 0.3;
	float lick = (turb - 0.42) * smoothstep(-0.4, 0.9, p.y) * 0.55;
	float body = length(p.xz) - (prof + lick);
	body = max(body, p.y - 0.95); // cap the tip
	body = max(body, -0.6 - p.y); // cap the base
	return body;
}
float sdCore(vec3 p) {
	float s = uCoreScale;
	if (uCore == 1) return sdIcosahedron(p / s, 0.62) * s;
	if (uCore == 2) return sdFlame(p / s) * s;
	// petals cup upward toward the viewer; stem hangs below
	return sdLotus(vec3(p.x, -p.y, p.z) / s, uBloom, uStemLen) * s;
}
vec3 coreTint() {
	if (uCore == 1) return mix(uAccent, vec3(0.72, 0.86, 1.0), 0.22);
	if (uCore == 2) return mix(uPrimary, uAccent, 0.42);
	return mix(uPrimary, uAccent, 0.62);
}

// Dark obsidian sky with soft, drifting gold smoke — frames the swirl and fills
// every ray that misses the medium ball. Controlled by uSmoke.
vec3 smokyBG(vec3 rd, float cs, float sn) {
	// Swirl the backdrop with the vortex. Rotating by a mod-2π angle is seamless at
	// the wrap (cos/sin are periodic), so the smoke reads as the SAME swirling
	// medium — no flat plate to seam against the marched ball's limb.
	vec2 rxz = mat2(cs, -sn, sn, cs) * rd.xz;
	float a = atan(rxz.y, rxz.x);
	float e = rd.y;
	float s = fbm(vec2(a * 2.1 + e * 1.4, e * 2.3 + 1.0));
	s = smoothstep(0.32, 0.97, s);
	float s2 = fbm(vec2(a * 4.4 + 3.0, e * 3.4));
	s = max(s, smoothstep(0.5, 0.97, s2) * 0.5);
	vec3 base = uSecondary * 0.28;
	vec3 smoke = mix(uSecondary, uPrimary, 0.35) * 0.42;
	return base + smoke * s * uSmoke;
}

void main() {
	vec3 ro = uCamPos;
	vec3 fwd = normalize(uCamTarget - ro);
	vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
	vec3 up = cross(right, fwd);
	vec2 sp = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
	sp.y += uVOffset; // vertical framing offset — slides the whole scene in-frame
	vec3 rd = normalize(sp.x * right + sp.y * up + uFocal * fwd);

	// The swirl spin is a RIGID ROTATION of the sample field, not an additive phase
	// fed into (non-periodic) fbm. Rotating by a mod-2π angle is seamless at the
	// wrap — cos(2π)=cos(0), sin(2π)=sin(0) — so the loop never jumps, while the mod
	// keeps the argument bounded for float precision (WebGL time-precision rule).
	float swirlPhase = uSwirlPhase;
	float cs = cos(swirlPhase), sn = sin(swirlPhase);

	vec2 tb = raySphere(ro, rd, BOUND);
	if (tb.y < 0.0 || tb.y <= tb.x) {
		fragColor = vec4(max(smokyBG(rd, cs, sn), 0.0), 1.0);
		return;
	}
	float t0 = max(tb.x, 0.0);
	float t1 = tb.y;

	int STEPS = 96;
	float dt = (t1 - t0) / float(STEPS);
	// Interleaved gradient noise breaks the raymarch banding without the sandy
	// clumping of a white-noise hash, and at half a step it barely reads at all.
	float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
	float t = t0 + dt * dither * 0.5;

	vec3 col = vec3(0.0);
	float trans = 1.0;

	for (int i = 0; i < 96; i++) {
		if (i >= STEPS) break;
		vec3 P = ro + rd * t;
		t += dt;

		float r = length(P);
		// Rigid swirl rotation of the sample point about +Y — the whole ribbon field
		// spins with the flow, seamlessly (see swirlPhase note above).
		vec2 rxz = mat2(cs, -sn, sn, cs) * P.xz;
		float rc = length(rxz);
		float y = P.y;
		float ang = atan(rxz.y, rxz.x);

		// Whirlpool spiral: the arms wind tighter toward the eye. The winding term
		// is clamped in rc, so cos/sin/noise stay precise for any runtime.
		float wind = uTwist * (7.0 - min(rc, 7.0)) * 0.5;
		float spiral = ang - wind + y * 0.08;

		// Big sweeping arms (low freq) broken up by warped fine streaks, carved to
		// high contrast so obsidian lanes knife between the molten-gold bands.
		float w1 = fbm(vec2(spiral * 0.6, rc * 0.25 + y * 0.15));

		// Liquid ribbons: RIDGED noise sampled along the spiral gives sharp-edged
		// metal streaks that curl with the flow (the crease of a poured-gold sheet),
		// with a fine layer breaking them into wet detail. Ridge lines, not soft fog.
		float bandN = fbm(vec2(spiral * 3.4 + w1 * 2.6, rc * 0.6 + y * 0.25));
		float ridged = 1.0 - abs(2.0 * bandN - 1.0);
		ridged = pow(ridged, 4.5); // thinner crests → wider obsidian lanes between arms
		float micro = fbm(vec2(spiral * 7.0 + w1 * 2.0, rc * 1.4)); // lower freq → less sandy grain
		float flow = clamp(ridged * (0.6 + 0.45 * micro), 0.0, 1.0);
		// Thin specular cores — the wet, reflective glint riding the ribbon crests.
		float spec = pow(ridged, 6.0) * (0.6 + 0.2 * micro);

		// Outer shell fades the medium to obsidian toward the ball edge, so the
		// frame corners go dark WITHOUT ever seeing the ball's hard silhouette.
		float radial = smoothstep(BOUND, 1.5, r) * mix(1.0, exp(-y * y * 0.09), 0.55);
		float dens = radial * flow;

		// Carve hard obsidian between the ribbons: only high flow reads as molten
		// gold, everything below sinks to near-black so a big ball still keeps deep
		// darks instead of hazing to milk over the long sightline.
		float gold = smoothstep(0.14, 0.74, flow);
		vec3 emis = mix(uSecondary * 0.07, uPrimary, gold);             // obsidian → gold
		emis += (uPrimary * 0.55 + uAccent * 0.45) * spec * 1.6;        // liquid-metal specular
		emis *= mix(0.7, 1.35, smoothstep(10.0, 1.2, r));              // gentle inward lift
		float a = clamp(dens * dt * 1.05, 0.0, 1.0);
		col += trans * emis * a;
		trans *= 1.0 - a * 0.84;                                        // front-lit: near ribbons occlude the haze behind

		// Tight bright eye, gated to the flow so it never becomes a uniform sun.
		float cg = exp(-r * r * 2.8);
		col += trans * mix(uAccent, uPrimary, 0.25) * cg * uCoreGlow * (0.35 + 0.65 * flow) * dt * 0.6;

		// Core object (SDF, swappable by uCore), scaled by uCoreScale. The gate covers
		// the scaled flower sphere plus a thin column for the lotus stem below it.
		float s = uCoreScale;
		float coreReach = CORE_BOUND * s;
		bool inStem = (uCore == 0) && length(P.xz) < (0.3 + 0.36 * uStemLen) * s
			&& P.y < 0.1 * s && P.y > -(uStemLen + 0.2) * s;
		if (r < coreReach || inStem) {
			float cd = sdCore(P - CORE);
			if (uCore == 2) {
				// Volumetric flame: soft filled emission, NO hard rim (the rim read as a
				// triangle outline). A tighter falloff gives the plume a defined body; the
				// flicker varies with height AND angle so tongues lick instead of a uniform
				// blob. Hue stays in-palette — white-gold base → gold body → pale-accent tip.
				float glow = smoothstep(0.22 * s, -0.12 * s, cd);
				float h = clamp((P.y + 0.6 * s) / (1.55 * s), 0.0, 1.0);
				float fk = mod(uTime * 2.6, 180.0);
				float flick = 0.5 + 0.6 * fbm(vec2(atan(P.z, P.x) * 1.6 + P.y * 2.5 - fk, P.y * 3.0));
				vec3 fc = mix(mix(uPrimary, vec3(1.0), 0.4), uPrimary, smoothstep(0.0, 0.5, h));
				fc = mix(fc, uAccent, smoothstep(0.55, 1.0, h));
				col += trans * fc * glow * uCoreGlow * flick * (1.5 - 0.6 * h) * dt * 2.2;
				trans *= 1.0 - clamp(glow * 0.5, 0.0, 1.0);
			} else {
				// Solid cores (lotus, gem): rim + filled inside so the silhouette reads
				// through the bloom instead of flattening to a white mass.
				float rim = smoothstep(0.09, 0.0, abs(cd));
				float inside = smoothstep(0.03, -0.16, cd);
				// The lotus stem dissolves into the flow toward its tail — fade both emission
				// and absorption down the lower stalk so it ends in mist, not a hard cone cap.
				float fade = 1.0;
				if (uCore == 0 && uStemLen > 0.01) {
					float depth = -P.y / (uStemLen * s);
					fade = 1.0 - smoothstep(0.35, 1.0, depth);
				}
				vec3 cc = coreTint();
				float ce = (inside * 0.45 + rim * 1.3) * uCoreGlow * fade;
				col += trans * cc * ce * dt * 1.1;
				trans *= 1.0 - clamp(inside * 0.75 * fade, 0.0, 1.0);
			}
		}

		if (trans < 0.02) break;
	}

	// Whatever the swirl didn't cover shows the smoky obsidian sky — now swirl-
	// textured, so the transition across the ball limb carries no visible seam.
	col += trans * smokyBG(rd, cs, sn);

	if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
	fragColor = vec4(max(col, 0.0), 1.0);
}
`;

// ---- GPU dust. One POINTS draw; each grain's whole spiral inflow is a
// closed-form function of uTime, projected with the SAME camera basis as the
// vortex so the two layers register exactly. Additive into the scene RT.
const PARTICLE_VERT = `#version 300 es
in vec4 aSeed;   // theta0, r0, spiralTurns, phase
in vec2 aJit;    // speedJitter, sizeJitter
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uCamTarget;
uniform float uFocal;
uniform vec2 uRes;
uniform float uDpr;
uniform float uVOffset;
uniform float uParticleSpeed;
uniform float uCurlPhase;
uniform float uDrawCount;
uniform float uBaseSize;
out float vLife;
out float vAlpha;

const float TWO_PI = 6.28318530718;
// Dust always targets this fixed convergence point — INDEPENDENT of which core
// mesh renders, so swapping coreObject never breaks the flow-field targeting.
const float R_CORE = 0.3;
const float Y_TOP = 4.6;
const float Y_CORE = 0.0;

void main() {
	if (float(gl_VertexID) >= uDrawCount) { gl_Position = vec4(2.0); return; }

	float speed = uParticleSpeed * (0.55 + 0.9 * aJit.x);
	float lf = fract(uTime * speed * 0.16 + aSeed.w);
	float ei = lf * lf;
	float r = mix(aSeed.y, R_CORE, ei);
	float y = mix(Y_TOP, Y_CORE, lf);
	float ang = aSeed.x + aSeed.z * lf * TWO_PI + uCurlPhase;
	vec3 world = vec3(r * cos(ang), y, r * sin(ang));

	vAlpha = smoothstep(0.0, 0.07, lf) * (1.0 - smoothstep(0.72, 1.0, lf));
	vLife = lf;

	vec3 fwd = normalize(uCamTarget - uCamPos);
	vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
	vec3 up = cross(right, fwd);
	vec3 rel = world - uCamPos;
	float cz = dot(rel, fwd);
	float cx = dot(rel, right);
	float cy = dot(rel, up);
	float aspect = uRes.x / max(uRes.y, 1.0);
	vec2 ndc = vec2(uFocal * cx / cz * 2.0 / aspect, uFocal * cy / cz * 2.0);
	ndc.y -= uVOffset * 2.0; // match the fragment's vertical framing offset
	gl_Position = vec4(ndc, 0.0, 1.0);
	if (cz <= 0.05) gl_Position = vec4(2.0);
	gl_PointSize = clamp(uBaseSize * uDpr * uFocal / cz, 1.0, 48.0);
}
`;

const PARTICLE_FRAG = `#version 300 es
precision highp float;
in float vLife;
in float vAlpha;
uniform vec3 uPrimary;
uniform vec3 uAccent;
uniform float uBright;
out vec4 fragColor;
void main() {
	vec2 d = gl_PointCoord - 0.5;
	float m = 1.0 - smoothstep(0.3, 0.5, length(d));
	float a = vAlpha * m;
	if (a < 0.004) discard;
	vec3 c = mix(uPrimary, uAccent, vLife) * uBright;
	fragColor = vec4(c * a, a); // additive (ONE, ONE)
}
`;

const BRIGHT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D tMap;
uniform float uThreshold;
out vec4 fragColor;
void main() {
	vec3 c = texture(tMap, vUv).rgb;
	float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
	float w = smoothstep(uThreshold, uThreshold + 0.5, l);
	fragColor = vec4(c * w, 1.0);
}
`;

const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D tMap;
uniform vec2 uTexel;
uniform vec2 uDir;
uniform float uRadius;
out vec4 fragColor;
void main() {
	vec2 d = uTexel * uDir * uRadius;
	vec3 s = texture(tMap, vUv).rgb * 0.227027;
	s += texture(tMap, vUv + d * 1.3846).rgb * 0.316216;
	s += texture(tMap, vUv - d * 1.3846).rgb * 0.316216;
	s += texture(tMap, vUv + d * 3.2307).rgb * 0.070270;
	s += texture(tMap, vUv - d * 3.2307).rgb * 0.070270;
	fragColor = vec4(s, 1.0);
}
`;

const COMP_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform vec2 uRes;
uniform float uTime;
uniform float uBloomStrength;
uniform float uVignette;
uniform float uGrain;
uniform float uChroma;
out vec4 fragColor;

vec3 aces(vec3 x) {
	return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
float hash(vec2 p) {
	return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
	vec2 uv = vUv;
	vec2 dir = uv - 0.5;
	// Radial RGB split, strong enough to read at the frame edges.
	float ca = uChroma * 0.06 * dot(dir, dir);
	vec3 scene;
	scene.r = texture(tScene, uv + dir * ca).r;
	scene.g = texture(tScene, uv).g;
	scene.b = texture(tScene, uv - dir * ca).b;
	vec3 bloom;
	bloom.r = texture(tBloom, uv + dir * ca).r;
	bloom.g = texture(tBloom, uv).g;
	bloom.b = texture(tBloom, uv - dir * ca).b;
	vec3 hdr = (scene + bloom * uBloomStrength) * 0.82; // pull exposure down to deepen the obsidian
	vec3 col = aces(hdr);
	float aspect = uRes.x / max(uRes.y, 1.0);
	float v = smoothstep(1.30, 0.30, length(dir * vec2(aspect, 1.0)) * 1.15);
	col *= mix(1.0, v, uVignette);
	float g = hash(gl_FragCoord.xy + fract(uTime * 13.7) * 97.0) - 0.5;
	col += g * uGrain * 0.6 * (1.0 - 0.5 * dot(col, vec3(0.333)));
	fragColor = vec4(col, 1.0);
}
`;

const VortexBloom: React.FC<VortexBloomProps> = ({
	primary = "#F0A830",
	secondary = "#120E1A",
	accent = "#FFE7A3",
	coreObject = "lotus",
	coreScale = 1.5,
	stemLength = 1.4,
	vortexIntensity = 7,
	glowIntensity = 8,
	particleDensity = 700,
	particleSpeed = 1,
	smokeAmount = 0.6,
	cameraAutoRotate = true,
	rotationSpeed = 1,
	fov = 60,
	verticalOffset = 0,
	chromaticAberration = 0.15,
	vignette = 0.4,
	grain = 0.02,
	paused = false,
	maxDpr = 1.5,
	fallbackSrc,
	className,
}) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const animationFrameId = useRef<number>(0);
	const startLoopRef = useRef<(() => void) | null>(null);

	// Live-tunable values read each frame — the GL context is never rebuilt while
	// a control is dragged, so tuning stays smooth (BlackHole/Threads idiom).
	const live = useRef({
		primary,
		secondary,
		accent,
		coreObject,
		coreScale,
		stemLength,
		vortexIntensity,
		glowIntensity,
		particleDensity,
		particleSpeed,
		smokeAmount,
		cameraAutoRotate,
		rotationSpeed,
		fov,
		verticalOffset,
		chromaticAberration,
		vignette,
		grain,
		paused,
	});
	live.current = {
		primary,
		secondary,
		accent,
		coreObject,
		coreScale,
		stemLength,
		vortexIntensity,
		glowIntensity,
		particleDensity,
		particleSpeed,
		smokeAmount,
		cameraAutoRotate,
		rotationSpeed,
		fov,
		verticalOffset,
		chromaticAberration,
		vignette,
		grain,
		paused,
	};

	const cam = useRef({
		r: ORBIT_R,
		inc: ORBIT_INC,
		az: 0,
		orbitAz: 0,
		manualActive: false,
		targetAz: 0,
		targetInc: ORBIT_INC,
		lastInteract: -1e9,
		spinDir: 1,
	});

	const [useFallback, setUseFallback] = useState(false);
	useEffect(() => {
		if (isIOS() || !supportsWebGL2()) setUseFallback(true);
	}, []);

	useEffect(() => {
		if (useFallback || !containerRef.current) return;
		const container = containerRef.current;

		let gl: Renderer["gl"] | undefined;
		try {
			const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
			const renderer = new Renderer({
				alpha: false,
				antialias: false,
				premultipliedAlpha: true,
				powerPreference: "high-performance",
				dpr,
				webgl: 2,
			});
			gl = renderer.gl;
			if (
				typeof WebGL2RenderingContext === "undefined" ||
				!(gl instanceof WebGL2RenderingContext)
			) {
				throw new Error("VortexBloom requires a WebGL2 context");
			}
			gl.clearColor(0, 0, 0, 1);
			container.appendChild(gl.canvas);

			const glc = renderer.gl;
			const gl2 = glc as unknown as WebGL2RenderingContext;
			const halfFloat = !!gl2.getExtension("EXT_color_buffer_float");
			const rtType = halfFloat ? gl2.HALF_FLOAT : gl2.UNSIGNED_BYTE;
			const rtInternal = halfFloat ? gl2.RGBA16F : gl2.RGBA;
			const makeRT = (w: number, h: number) =>
				new RenderTarget(glc, {
					width: Math.max(1, w),
					height: Math.max(1, h),
					depth: false,
					type: rtType,
					format: gl2.RGBA,
					internalFormat: rtInternal,
					minFilter: gl2.LINEAR,
					magFilter: gl2.LINEAR,
				});

			const iw = gl.canvas.width;
			const ih = gl.canvas.height;
			// Scene/bloom RTs live at the reduced volumetric resolution; the composite
			// still targets the full canvas. resize() is the source of truth for these.
			const sw = Math.max(1, Math.round(iw * SCENE_SCALE));
			const sh = Math.max(1, Math.round(ih * SCENE_SCALE));
			const shw = Math.max(1, sw >> 1);
			const shh = Math.max(1, sh >> 1);
			const sceneRT = makeRT(sw, sh);
			const bloomA = makeRT(shw, shh);
			const bloomB = makeRT(shw, shh);

			const geometry = new Triangle(gl);
			const focal0 = 1 / Math.tan((fov * 0.5 * Math.PI) / 180);

			const vortexProgram = new Program(gl, {
				vertex: VERT,
				fragment: VORTEX_FRAG,
				uniforms: {
					uRes: { value: new Float32Array([sw, sh]) },
					uTime: { value: 0 },
					uCamPos: { value: new Float32Array([0, 7, 5]) },
					uCamTarget: { value: new Float32Array([0, 0, 0]) },
					uFocal: { value: focal0 },
					uVOffset: { value: verticalOffset },
					uPrimary: { value: new Float32Array(hexToRgb01(primary)) },
					uSecondary: { value: new Float32Array(hexToRgb01(secondary)) },
					uAccent: { value: new Float32Array(hexToRgb01(accent)) },
					uSwirlPhase: { value: 0 },
					uTwist: { value: 0.8 },
					uTurb: { value: 1.0 },
					uCoreGlow: { value: 3.0 },
					uSmoke: { value: smokeAmount },
					uBloom: { value: 0 },
					uCoreScale: { value: coreScale },
					uStemLen: { value: stemLength },
					uCore: { value: CORE_INDEX[coreObject] ?? 0 },
				},
			});
			if (!gl.getProgramParameter(vortexProgram.program, gl.LINK_STATUS)) {
				throw new Error("VortexBloom vortex shader failed to link");
			}

			// Dust field — a fixed pool, generated once. Live density is a draw-count.
			const seed = new Float32Array(PARTICLE_CAP * 4);
			const jit = new Float32Array(PARTICLE_CAP * 2);
			for (let i = 0; i < PARTICLE_CAP; i++) {
				seed[i * 4] = Math.random() * Math.PI * 2;
				seed[i * 4 + 1] = 1.6 + Math.random() * 1.1;
				seed[i * 4 + 2] = 1.5 + Math.random() * 2.8;
				seed[i * 4 + 3] = Math.random();
				jit[i * 2] = Math.random();
				jit[i * 2 + 1] = Math.random();
			}
			const particleGeo = new Geometry(gl, {
				aSeed: { size: 4, data: seed },
				aJit: { size: 2, data: jit },
			});
			const particleProgram = new Program(gl, {
				vertex: PARTICLE_VERT,
				fragment: PARTICLE_FRAG,
				transparent: true,
				depthTest: false,
				depthWrite: false,
				uniforms: {
					uTime: { value: 0 },
					uCamPos: { value: new Float32Array([0, 7, 5]) },
					uCamTarget: { value: new Float32Array([0, 0, 0]) },
					uFocal: { value: focal0 },
					uRes: { value: new Float32Array([sw, sh]) },
					// Point size is measured in scene-RT pixels, so it must shrink with the
					// reduced render scale to keep the dust the same apparent size on screen.
					uDpr: { value: dpr * SCENE_SCALE },
					uVOffset: { value: verticalOffset },
					uParticleSpeed: { value: 1.4 },
					uCurlPhase: { value: 0 },
					uDrawCount: { value: particleDensity },
					uBaseSize: { value: 46 },
					uPrimary: { value: new Float32Array(hexToRgb01(primary)) },
					uAccent: { value: new Float32Array(hexToRgb01(accent)) },
					uBright: { value: 1.1 },
				},
			});
			particleProgram.setBlendFunc(gl.ONE, gl.ONE);
			if (!gl.getProgramParameter(particleProgram.program, gl.LINK_STATUS)) {
				throw new Error("VortexBloom particle shader failed to link");
			}

			const brightProgram = new Program(gl, {
				vertex: VERT,
				fragment: BRIGHT_FRAG,
				uniforms: {
					tMap: { value: sceneRT.texture },
					uThreshold: { value: BLOOM_THRESHOLD },
				},
			});
			const blurProgram = new Program(gl, {
				vertex: VERT,
				fragment: BLUR_FRAG,
				uniforms: {
					tMap: { value: bloomA.texture },
					uTexel: { value: new Float32Array([1 / shw, 1 / shh]) },
					uDir: { value: new Float32Array([1, 0]) },
					uRadius: { value: 1 },
				},
			});
			const compProgram = new Program(gl, {
				vertex: VERT,
				fragment: COMP_FRAG,
				uniforms: {
					tScene: { value: sceneRT.texture },
					tBloom: { value: bloomA.texture },
					uRes: { value: new Float32Array([iw, ih]) },
					uTime: { value: 0 },
					uBloomStrength: { value: 1.8 },
					uVignette: { value: vignette },
					uGrain: { value: grain },
					uChroma: { value: chromaticAberration },
				},
			});

			const vortexMesh = new Mesh(gl, { geometry, program: vortexProgram });
			const particleMesh = new Mesh(gl, {
				geometry: particleGeo,
				program: particleProgram,
				mode: gl.POINTS,
			});
			const brightMesh = new Mesh(gl, { geometry, program: brightProgram });
			const blurMesh = new Mesh(gl, { geometry, program: blurProgram });
			const compMesh = new Mesh(gl, { geometry, program: compProgram });

			function resize() {
				const { clientWidth, clientHeight } = container;
				if (clientWidth === 0 || clientHeight === 0) return;
				renderer.setSize(clientWidth, clientHeight);
				const bw = gl!.drawingBufferWidth;
				const bh = gl!.drawingBufferHeight;
				// Volumetric scene + bloom march at the reduced scale; the composite reads
				// them upscaled and renders at the full drawing buffer.
				const rw = Math.max(1, Math.round(bw * SCENE_SCALE));
				const rh = Math.max(1, Math.round(bh * SCENE_SCALE));
				const hw = Math.max(1, rw >> 1);
				const hh = Math.max(1, rh >> 1);
				sceneRT.setSize(rw, rh);
				bloomA.setSize(hw, hh);
				bloomB.setSize(hw, hh);
				vortexProgram.uniforms.uRes.value[0] = rw;
				vortexProgram.uniforms.uRes.value[1] = rh;
				particleProgram.uniforms.uRes.value[0] = rw;
				particleProgram.uniforms.uRes.value[1] = rh;
				compProgram.uniforms.uRes.value[0] = bw;
				compProgram.uniforms.uRes.value[1] = bh;
				blurProgram.uniforms.uTexel.value[0] = 1 / hw;
				blurProgram.uniforms.uTexel.value[1] = 1 / hh;
			}
			const resizeObserver = new ResizeObserver(() => {
				resize();
				startLoopRef.current?.();
			});
			resizeObserver.observe(container);
			resize();

			const camPos = new Float32Array(3);
			let accumulatedTime = 0;
			let lastTimestamp = -1;
			let timeScale = paused ? 0 : 1;
			let bloomClock = 0; // lotus bud→bloom intro; resets on mount + core swap
			let lastCore = CORE_INDEX[live.current.coreObject] ?? 0;
			let running = false;
			let swirlDir = 1; // whole-vortex spin direction; eases toward the drag's spinDir
			let swirlPhase = 0;
			let curlPhase = 0;
			let dragging = false;
			let dragStartX = 0;
			let dragStartY = 0;
			let dragStartAz = 0;
			let dragStartInc = 0;
			let prevTargetAz = 0;

			function renderPasses() {
				const l = live.current;

				renderer.render({ scene: vortexMesh, target: sceneRT });
				renderer.render({
					scene: particleMesh,
					target: sceneRT,
					clear: false,
				});

				const bloom = l.glowIntensity * 0.14;
				const doBloom = bloom > 0.001;
				if (doBloom) {
					brightProgram.uniforms.tMap.value = sceneRT.texture;
					renderer.render({ scene: brightMesh, target: bloomA });

					blurProgram.uniforms.tMap.value = bloomA.texture;
					blurProgram.uniforms.uDir.value[0] = 1;
					blurProgram.uniforms.uDir.value[1] = 0;
					renderer.render({ scene: blurMesh, target: bloomB });

					blurProgram.uniforms.tMap.value = bloomB.texture;
					blurProgram.uniforms.uDir.value[0] = 0;
					blurProgram.uniforms.uDir.value[1] = 1;
					renderer.render({ scene: blurMesh, target: bloomA });

					compProgram.uniforms.tBloom.value = bloomA.texture;
					compProgram.uniforms.uBloomStrength.value = bloom;
				} else {
					compProgram.uniforms.tBloom.value = sceneRT.texture;
					compProgram.uniforms.uBloomStrength.value = 0;
				}

				compProgram.uniforms.tScene.value = sceneRT.texture;
				renderer.render({ scene: compMesh });
			}

			function syncUniforms() {
				const l = live.current;
				const vi = l.vortexIntensity;
				const gi = l.glowIntensity;
				const focal = 1 / Math.tan((l.fov * 0.5 * Math.PI) / 180);

				const vu = vortexProgram.uniforms;
				vu.uTime.value = accumulatedTime;
				vu.uTwist.value = 0.35 + vi * 0.12;
				vu.uTurb.value = 0.35 + vi * 0.1;
				vu.uCoreGlow.value = 0.5 + gi * 0.32;
				vu.uSmoke.value = l.smokeAmount;
				vu.uFocal.value = focal;
				vu.uVOffset.value = l.verticalOffset;
				vu.uCore.value = CORE_INDEX[l.coreObject] ?? 0;
				vu.uCoreScale.value = l.coreScale;
				vu.uStemLen.value = l.stemLength;
				const [pr, pg, pb] = hexToRgb01(l.primary);
				vu.uPrimary.value[0] = pr;
				vu.uPrimary.value[1] = pg;
				vu.uPrimary.value[2] = pb;
				const [srr, sgg, sbb] = hexToRgb01(l.secondary);
				vu.uSecondary.value[0] = srr;
				vu.uSecondary.value[1] = sgg;
				vu.uSecondary.value[2] = sbb;
				const [ar, ag, ab] = hexToRgb01(l.accent);
				vu.uAccent.value[0] = ar;
				vu.uAccent.value[1] = ag;
				vu.uAccent.value[2] = ab;

				const pu = particleProgram.uniforms;
				pu.uTime.value = accumulatedTime;
				pu.uFocal.value = focal;
				pu.uVOffset.value = l.verticalOffset;
				pu.uParticleSpeed.value = 0.25 + l.particleSpeed * 1.0;
				pu.uDrawCount.value = l.particleDensity;
				pu.uBright.value = 0.3 + gi * 0.06;
				pu.uPrimary.value[0] = pr;
				pu.uPrimary.value[1] = pg;
				pu.uPrimary.value[2] = pb;
				pu.uAccent.value[0] = ar;
				pu.uAccent.value[1] = ag;
				pu.uAccent.value[2] = ab;

				compProgram.uniforms.uTime.value = accumulatedTime;
				compProgram.uniforms.uVignette.value = l.vignette;
				compProgram.uniforms.uGrain.value = l.grain;
				compProgram.uniforms.uChroma.value = l.chromaticAberration;
			}

			function updateCamera(frameDt: number, now: number): boolean {
				const l = live.current;
				const c = cam.current;

				if (
					l.cameraAutoRotate &&
					c.manualActive &&
					!dragging &&
					now - c.lastInteract > IDLE_MS
				) {
					c.manualActive = false;
				}

				let ti: number;
				let ta: number;
				if (dragging || c.manualActive) {
					ti = c.targetInc;
					ta = c.targetAz;
					c.orbitAz = c.az;
				} else if (l.cameraAutoRotate) {
					c.orbitAz +=
						frameDt * timeScale * BASE_SPIN * l.rotationSpeed * c.spinDir;
					ti = c.inc;
					ta = c.orbitAz;
				} else {
					ti = c.inc;
					ta = c.az;
					c.orbitAz = c.az;
				}

				const k = Math.min(1, frameDt * 6);
				c.inc += (ti - c.inc) * k;
				c.az += (ta - c.az) * k;
				if (c.az > 3600 || c.az < -3600) {
					const wrap = Math.floor(c.az / 360) * 360;
					c.az -= wrap;
					c.orbitAz -= wrap;
					c.targetAz -= wrap;
				}

				toCartesian(c.r, c.inc, c.az, camPos);
				const vp = vortexProgram.uniforms.uCamPos.value;
				const pp = particleProgram.uniforms.uCamPos.value;
				vp[0] = pp[0] = camPos[0];
				vp[1] = pp[1] = camPos[1];
				vp[2] = pp[2] = camPos[2];

				return (
					dragging || Math.abs(ti - c.inc) > 1e-3 || Math.abs(ta - c.az) > 1e-3
				);
			}

			function update(t: number) {
				const dt2 = lastTimestamp >= 0 ? (t - lastTimestamp) * 0.001 : 0;
				lastTimestamp = t;
				const cdt = Math.min(dt2, 0.1);

				const l = live.current;
				const target = l.paused ? 0 : 1;
				timeScale += (target - timeScale) * 0.05;
				accumulatedTime += cdt * timeScale;

				// The whole vortex answers a drag: swirlDir eases toward the camera's spinDir
				// so the funnel winds down and spins back the other way without a snap. Phases
				// accumulate on the CPU (not from uTime in-shader) to keep that reversal seamless;
				// the rate still tracks vortexIntensity and the dust curl rides the same sign.
				const swirlRate = 0.05 + l.vortexIntensity * 0.04;
				swirlDir += (cam.current.spinDir - swirlDir) * Math.min(1, cdt * 3);
				swirlPhase =
					(swirlPhase + cdt * timeScale * swirlRate * swirlDir) % TWO_PI;
				curlPhase =
					(curlPhase + cdt * timeScale * swirlRate * 0.6 * swirlDir) % TWO_PI;
				vortexProgram.uniforms.uSwirlPhase.value = swirlPhase;
				particleProgram.uniforms.uCurlPhase.value = curlPhase;

				// Lotus bud→bloom intro: a real-time clock, reset on mount and whenever
				// coreObject changes. Frozen (reduced motion) snaps fully open, so it
				// never freezes mid-bud.
				const curCore = CORE_INDEX[l.coreObject] ?? 0;
				if (curCore !== lastCore) {
					lastCore = curCore;
					bloomClock = 0;
				}
				bloomClock = l.paused
					? BLOOM_DUR
					: Math.min(BLOOM_DUR, bloomClock + cdt);

				syncUniforms();
				const bt = bloomClock / BLOOM_DUR;
				vortexProgram.uniforms.uBloom.value =
					1 - (1 - bt) * (1 - bt) * (1 - bt); // ease-out
				const restless = updateCamera(cdt, t);
				renderPasses();

				if (l.paused && timeScale < 1e-3 && !restless) {
					running = false;
					lastTimestamp = -1;
					return;
				}
				animationFrameId.current = requestAnimationFrame(update);
			}

			function startLoop() {
				if (running) return;
				running = true;
				lastTimestamp = -1;
				animationFrameId.current = requestAnimationFrame(update);
			}
			startLoopRef.current = startLoop;
			startLoop();

			const canvas = gl.canvas as HTMLCanvasElement;
			function onPointerDown(e: PointerEvent) {
				if (e.pointerType === "mouse" && e.button !== 0) return;
				e.preventDefault();
				const c = cam.current;
				if (!c.manualActive) {
					c.targetInc = c.inc;
					c.targetAz = c.az;
					c.manualActive = true;
				}
				dragging = true;
				dragStartX = e.clientX;
				dragStartY = e.clientY;
				dragStartAz = c.az;
				dragStartInc = c.inc;
				prevTargetAz = c.az;
				c.lastInteract = performance.now();
				try {
					canvas.setPointerCapture(e.pointerId);
				} catch {
					// pointer already gone
				}
				startLoop();
			}
			function onPointerMove(e: PointerEvent) {
				if (!dragging) return;
				const c = cam.current;
				const newAz = dragStartAz - (e.clientX - dragStartX) * 0.4;
				if (Math.abs(newAz - prevTargetAz) > 0.01) {
					c.spinDir = Math.sign(newAz - prevTargetAz);
				}
				prevTargetAz = newAz;
				c.targetAz = newAz;
				// Full vertical tumble — clamp just shy of the poles where the camera
				// basis (cross with world-up) would degenerate.
				c.targetInc = Math.min(
					176,
					Math.max(4, dragStartInc - (e.clientY - dragStartY) * 0.3),
				);
				c.lastInteract = performance.now();
			}
			function onPointerUp(e: PointerEvent) {
				if (!dragging) return;
				dragging = false;
				cam.current.lastInteract = performance.now();
				try {
					canvas.releasePointerCapture(e.pointerId);
				} catch {
					// already released
				}
			}
			canvas.addEventListener("pointerdown", onPointerDown);
			window.addEventListener("pointermove", onPointerMove);
			window.addEventListener("pointerup", onPointerUp);
			window.addEventListener("pointercancel", onPointerUp);

			return () => {
				running = false;
				if (animationFrameId.current)
					cancelAnimationFrame(animationFrameId.current);
				resizeObserver.disconnect();
				canvas.removeEventListener("pointerdown", onPointerDown);
				window.removeEventListener("pointermove", onPointerMove);
				window.removeEventListener("pointerup", onPointerUp);
				window.removeEventListener("pointercancel", onPointerUp);
				if (container.contains(gl!.canvas)) container.removeChild(gl!.canvas);
				gl!.getExtension("WEBGL_lose_context")?.loseContext();
			};
		} catch (err) {
			console.warn(
				"VortexBloom: WebGL2 init failed, falling back to static image",
				err,
			);
			if (gl) {
				if (container.contains(gl.canvas)) container.removeChild(gl.canvas);
				gl.getExtension("WEBGL_lose_context")?.loseContext();
			}
			setUseFallback(true);
			return;
		}
		// All tunable props are live via the `live` ref — only these rebuild GL.
	}, [useFallback, maxDpr]);

	useEffect(() => {
		if (!paused) startLoopRef.current?.();
	}, [paused]);

	// Re-arm one frame on any tunable change so a paused/halted loop (reduced
	// motion) still repaints — e.g. a coreObject swap must show, and re-blooms.
	useEffect(() => {
		startLoopRef.current?.();
	}, [
		primary,
		secondary,
		accent,
		coreObject,
		coreScale,
		stemLength,
		vortexIntensity,
		glowIntensity,
		particleDensity,
		particleSpeed,
		smokeAmount,
		fov,
		verticalOffset,
		chromaticAberration,
		vignette,
		grain,
	]);

	useEffect(() => {
		if (cameraAutoRotate) cam.current.manualActive = false;
	}, [cameraAutoRotate]);

	if (useFallback) {
		return (
			<div className={cn("relative h-full w-full", className)}>
				{fallbackSrc ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img
						src={fallbackSrc}
						alt=""
						aria-hidden
						className="absolute inset-0 h-full w-full object-cover"
					/>
				) : (
					<div
						aria-hidden
						className="absolute inset-0"
						style={{
							background:
								"radial-gradient(circle at 50% 48%, rgba(255,231,163,0.24) 0%, rgba(240,168,48,0.16) 16%, rgba(20,14,26,1) 55%, rgba(8,6,10,1) 100%)",
						}}
					/>
				)}
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			className={cn(
				"relative h-full w-full [&_canvas]:cursor-grab [&_canvas]:touch-none [&_canvas:active]:cursor-grabbing",
				className,
			)}
		/>
	);
};

export default VortexBloom;
