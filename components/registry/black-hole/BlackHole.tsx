"use client";

// GARGANTUA — a Schwarzschild black hole raytraced per-pixel in a WebGL2
// fragment shader. Null geodesics are integrated on the GPU, bending a lensed
// accretion disk over the event horizon, with relativistic Doppler beaming,
// gravitational redshift, a photon ring, and a lensed starfield. A CPU-side
// cinematic camera flies a looping eight-keyframe orbit; the disk glow is a
// real two-pass FBO bloom. No sphere, no flat ring — the shape you see is the
// geodesics themselves. Structural skeleton mirrors Threads.tsx.

import React, { useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle, RenderTarget } from "ogl";
import { cn } from "@/lib/utils";

// Detect iOS (all iOS browsers share WebKit's WebGL limits) for the static fallback.
function isIOS(): boolean {
	if (typeof navigator === "undefined") return false;
	return (
		/iPhone|iPad|iPod/.test(navigator.userAgent) ||
		(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
	);
}

// Real capability probe — this shader needs WebGL2 specifically (#version 300 es
// + float render targets). WebGL1-only devices fall back to the static poster.
function supportsWebGL2(): boolean {
	if (typeof document === "undefined") return false;
	try {
		return !!document.createElement("canvas").getContext("webgl2");
	} catch {
		return false;
	}
}

// Hex → normalized RGB for live tint updates without reallocating.
function hexToRgb01(hex: string): [number, number, number] {
	let h = hex.replace("#", "").trim();
	if (h.length === 3)
		h = h
			.split("")
			.map((c) => c + c)
			.join("");
	if (h.length !== 6) return [0.66, 0.33, 0.97];
	const n = parseInt(h, 16);
	if (Number.isNaN(n)) return [0.66, 0.33, 0.97];
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

type DebugMode = "off" | "steps" | "disk" | "min-r" | "escape-dir" | "redshift";
const DEBUG_INDEX: Record<DebugMode, number> = {
	off: 0,
	steps: 1,
	disk: 2,
	"min-r": 3,
	"escape-dir": 4,
	redshift: 5,
};

interface BlackHoleProps {
	steps?: number;
	diskInner?: number;
	diskOuter?: number;
	diskBrightness?: number;
	dopplerMax?: number;
	starBrightness?: number;
	skyFloor?: number;
	rotationSpeed?: number;
	fov?: number;
	bloomStrength?: number;
	bloomRadius?: number;
	vignette?: number;
	grain?: number;
	chromaticAberration?: number;
	autoOrbit?: boolean;
	debug?: DebugMode;
	tint?: string;
	/** Recolors the accretion disk. White keeps the physical blackbody look. */
	ringColor?: string;
	/** Freeze on the hero pose and halt the render loop (reduced motion). */
	paused?: boolean;
	/** Cap devicePixelRatio — the geodesic loop is far heavier than a normal
	 * shader, so a DPR-3 phone would render 60-step raymarches at 9x the cost. */
	maxDpr?: number;
	fallbackSrc?: string;
	className?: string;
}

// ---- Camera. Cinematic mode spins the observer horizontally around the hole
// at a fixed radius (no dolly in/out); a pointer drag takes over, and the orbit
// resumes on its own once the pointer goes idle.
const ORBIT_R = 16; // observer distance in Schwarzschild radii
const ORBIT_INC = 87; // colatitude° — near edge-on so the disk lenses over the shadow
const BASE_SPIN = 9; // cinematic azimuth degrees/second at rotationSpeed 1
const IDLE_MS = 1000; // pointer-idle delay before the cinematic orbit resumes
const DEG = Math.PI / 180;

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

// ---- The raytracer. RS = 1 in geometrized units (c = G = 1).
const RAY_FRAG = `#version 300 es
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uCamTarget;
uniform float uFocal;
uniform float uSteps;
uniform float uDiskInner;
uniform float uDiskOuter;
uniform float uDiskBrightness;
uniform float uDoppler;
uniform float uStarBright;
uniform float uSkyFloor;
uniform float uRotSpeed;
uniform vec3 uTint;
uniform vec3 uRingColor;
uniform float uDebug;
out vec4 fragColor;

const float RS = 1.0;
const float PI = 3.14159265;

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

// 3D value noise + fbm — used for the nebula so it stays seamless on the sphere
// (sampling 2D fbm by a direction vector distorts badly toward the poles).
float vnoise3(vec3 p) {
	vec3 i = floor(p), f = fract(p);
	vec3 u = f * f * (3.0 - 2.0 * f);
	return mix(
		mix(
			mix(hash31(i + vec3(0.0, 0.0, 0.0)), hash31(i + vec3(1.0, 0.0, 0.0)), u.x),
			mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), u.x),
			u.y),
		mix(
			mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), u.x),
			mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), u.x),
			u.y),
		u.z);
}
float fbm3(vec3 p) {
	float s = 0.0, a = 0.5;
	for (int i = 0; i < 5; i++) {
		s += a * vnoise3(p);
		p = p * 2.02 + vec3(11.3, 17.1, 5.7);
		a *= 0.5;
	}
	return s;
}

// Continuous pseudo-blackbody: dark red -> orange -> warm white -> pale blue-white.
vec3 blackbody(float t) {
	vec3 c = mix(vec3(0.55, 0.06, 0.01), vec3(1.0, 0.42, 0.10), smoothstep(0.0, 0.55, t));
	c = mix(c, vec3(1.0, 0.86, 0.55), smoothstep(0.50, 1.05, t));
	c = mix(c, vec3(0.85, 0.92, 1.25), smoothstep(1.05, 1.90, t));
	return c;
}

// One colored star per grid cell, tight core falloff. Hue leans blue-white with
// a warm minority (warmBias raises the share of amber/gold stars).
vec3 starLayer(vec3 dir, float scale, float thresh, float warmBias) {
	vec3 p = dir * scale;
	vec3 id = floor(p);
	float h = hash31(id);
	if (h < thresh) return vec3(0.0);
	vec3 f = fract(p) - 0.5;
	float core = smoothstep(0.5, 0.0, length(f));
	core *= core;
	float bright = (h - thresh) / (1.0 - thresh);
	float hue = hash31(id + 3.7);
	vec3 cool = vec3(0.72, 0.82, 1.0);
	vec3 warm = vec3(1.0, 0.82, 0.60);
	vec3 sc = mix(cool, warm, smoothstep(0.62, 1.0, hue) * warmBias);
	return sc * core * bright;
}

// Domain-warped, dust-carved nebula graded across blue/indigo/magenta/teal,
// concentrated toward the galactic plane and biased a touch to the brand tint.
vec3 nebula(vec3 dir) {
	vec3 q = dir * 2.2;
	vec2 w = vec2(fbm3(q), fbm3(q + 4.7));
	float base = fbm3(q + 1.8 * vec3(w, 0.0));
	vec3 n = normalize(vec3(0.22, 1.0, 0.16));
	float band = exp(-dot(dir, n) * dot(dir, n) * 5.0);
	float cloud = smoothstep(0.42, 0.95, base) * (0.35 + 0.75 * band);
	float dust = fbm3(dir * 4.5 + 12.0);
	cloud *= 0.35 + 0.65 * smoothstep(0.25, 0.75, dust);
	float zone = fbm3(q * 0.55 + 2.0);
	vec3 deepBlue = vec3(0.05, 0.09, 0.26);
	vec3 indigo = vec3(0.16, 0.10, 0.42);
	vec3 magenta = vec3(0.42, 0.14, 0.46);
	vec3 teal = vec3(0.06, 0.24, 0.34);
	vec3 c = mix(deepBlue, indigo, smoothstep(0.30, 0.75, zone));
	c = mix(c, magenta, smoothstep(0.55, 0.95, base) * 0.7);
	c = mix(c, teal, smoothstep(0.60, 0.90, w.y) * 0.30);
	c = mix(c, uTint, 0.15);
	return c * cloud * 1.4;
}

vec3 starfield(vec3 dir) {
	vec3 col = nebula(dir);
	col += starLayer(dir, 55.0, 0.955, 0.5);
	col += starLayer(dir.zxy, 95.0, 0.958, 0.5) * 0.85;
	col += starLayer(dir.yzx, 150.0, 0.962, 0.4) * 0.7;
	col += starLayer(dir.xzy, 240.0, 0.972, 0.35) * 0.55;
	// rare hero stars with a soft bloom-ready glow
	vec3 hp = dir * 42.0;
	vec3 hid = floor(hp);
	if (hash31(hid + 7.3) > 0.9975) {
		float hd = length(fract(hp) - 0.5);
		float glow = smoothstep(0.5, 0.0, hd);
		vec3 hc = mix(vec3(0.70, 0.85, 1.0), vec3(1.0, 0.80, 0.60), hash31(hid + 1.1));
		col += hc * (glow * glow * 2.2 + smoothstep(0.35, 0.0, hd) * 0.6);
	}
	return col;
}

void main() {
	vec3 ro = uCamPos;
	vec3 fwd = normalize(uCamTarget - ro);
	vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
	vec3 up = cross(right, fwd);
	vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
	vec3 rd = normalize(p.x * right + p.y * up + uFocal * fwd);

	vec3 pos = ro;
	vec3 vel = rd;
	vec3 hvec = cross(pos, vel);
	float h2 = dot(hvec, hvec);

	vec3 col = vec3(0.0);
	float trans = 1.0;
	float minR = 1e5;
	float lastR = length(ro);
	float stepsUsed = 0.0;
	float lastG = 0.0;
	bool captured = false;

	for (int i = 0; i < 600; i++) {
		if (float(i) >= uSteps) break;
		stepsUsed += 1.0;
		float r = length(pos);
		r = max(r, 1e-4);
		minR = min(minR, r);
		if (r < 1.03 * RS) { captured = true; trans = 0.0; break; }
		if (r > 45.0 && dot(pos, vel) > 0.0) break;

		float r2 = r * r;
		vec3 acc = -1.5 * RS * h2 / (r2 * r2 * r) * pos;
		float dt = max(0.012, r * mix(0.02, 0.06, smoothstep(6.0, 20.0, r)));
		vec3 nvel = normalize(vel + acc * dt);
		vec3 npos = pos + nvel * dt;

		// Disk crossing (equatorial plane y = 0), analytically interpolated.
		if (pos.y * npos.y <= 0.0 && trans > 0.02) {
			float tt = abs(pos.y) / (abs(pos.y) + abs(npos.y) + 1e-5);
			vec3 X = mix(pos, npos, tt);
			float rc = length(X.xz);
			if (rc > uDiskInner && rc < uDiskOuter) {
				float ang = atan(X.z, X.x);
				float x = max(rc, 3.001);
				float flux = pow(x / 3.0, -3.0) * (1.0 - sqrt(3.0 / x));
				flux = max(flux, 0.0);
				float temp = pow(flux * 10.0, 0.25);

				// Moving fibers: differential Keplerian swirl, faster near the hole.
				float omega = uRotSpeed * 1.1 * pow(3.0 / rc, 1.5);
				float ph = ang - uTime * omega;
				vec2 qp = vec2(cos(ph), sin(ph)) * rc;
				float warp = fbm(qp * 0.35 + uTime * 0.05);
				float turb = fbm(qp * 0.8 + warp * 1.5);
				float streak = fbm(vec2(ph * 22.0, rc * 0.5));
				float laneMask = smoothstep(0.15, 0.6, turb);
				float detail = mix(1.0, turb, smoothstep(18.0, 4.0, rc));
				float I = flux * 11.0 * mix(0.6, 1.4, turb) * mix(0.7, 1.2, streak) * mix(0.6, 1.0, laneMask) * detail;
				float ig = (rc - 3.1) * 3.0;
				I += exp(-ig * ig) * 2.8;
				I *= smoothstep(uDiskOuter, uDiskOuter - 6.0, rc);

				// Relativity: Doppler beaming + gravitational redshift.
				float beta = min(sqrt(0.5 / rc), 0.95);
				float gamma = 1.0 / sqrt(1.0 - beta * beta);
				vec3 tdir = normalize(vec3(-sin(ang), 0.0, cos(ang)));
				vec3 rayDir = normalize(nvel);
				float D = 1.0 / max(gamma * (1.0 - dot(tdir * beta, rayDir)), 1e-3);
				D = clamp(D, 0.5, 2.2);
				float g = sqrt(max(1.0 - RS / rc, 1e-3));
				lastG = g;
				float shift = mix(1.0, D * g, uDoppler);
				float beam = mix(1.0, D * D * D * g, uDoppler);
				// Luminance-normalized ring tint: white is a no-op (keeps the
				// physical blackbody gradient + Doppler shift), any other hue
				// recolors the disk without dimming it.
				vec3 rc3 = uRingColor / max(dot(uRingColor, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
				vec3 dcol = blackbody(temp * shift) * rc3 * I * beam;

				float op = mix(0.80, 0.90, smoothstep(13.0, 4.0, rc));
				op *= smoothstep(uDiskOuter, uDiskOuter - 6.0, rc);
				col += trans * dcol * uDiskBrightness;
				trans *= 1.0 - clamp(op, 0.0, 1.0);
			}
		}

		pos = npos;
		vel = nvel;
		lastR = r;
		if (trans < 0.02) break;
	}

	if (!captured) {
		vec3 bg = starfield(normalize(vel)) * uStarBright;
		bg += uSkyFloor * mix(vec3(0.10, 0.13, 0.28), uTint, 0.4);
		float dim = clamp((lastR - 1.03) * 0.45, 0.45, 1.0);
		col += trans * bg * dim;
	}

	// Photon ring — the critical curve at the photon sphere (~1.5 Rs).
	float m = (minR - 1.5) * 4.0;
	float ring = exp(-m * m);
	vec3 ringHue = mix(mix(vec3(1.0, 0.92, 0.80), uTint, 0.25), uRingColor, 0.35);
	col += ring * ringHue * 0.9;

	int dbg = int(uDebug + 0.5);
	if (dbg == 1) col = vec3(stepsUsed / max(uSteps, 1.0));
	else if (dbg == 2) col = vec3(1.0 - trans);
	else if (dbg == 3) col = vec3(minR / 12.0);
	else if (dbg == 4) col = 0.5 + 0.5 * normalize(vel);
	else if (dbg == 5) col = vec3(lastG);

	if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
	fragColor = vec4(max(col, 0.0), 1.0);
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
	float ca = uChroma * 0.01 * dot(dir, dir);
	vec3 scene;
	scene.r = texture(tScene, uv + dir * ca).r;
	scene.g = texture(tScene, uv).g;
	scene.b = texture(tScene, uv - dir * ca).b;
	vec3 bloom = texture(tBloom, uv).rgb;
	vec3 hdr = (scene + bloom * uBloomStrength) * 0.95;
	vec3 col = aces(hdr);
	float aspect = uRes.x / max(uRes.y, 1.0);
	float v = smoothstep(1.30, 0.30, length(dir * vec2(aspect, 1.0)) * 1.15);
	col *= mix(1.0, v, uVignette);
	float g = hash(gl_FragCoord.xy + fract(uTime * 13.7) * 97.0) - 0.5;
	col += g * uGrain * (1.0 - 0.5 * dot(col, vec3(0.333)));
	fragColor = vec4(col, 1.0);
}
`;

const BLOOM_THRESHOLD = 0.7;

const BlackHole: React.FC<BlackHoleProps> = ({
	steps = 300,
	diskInner = 3,
	diskOuter = 12,
	diskBrightness = 1,
	dopplerMax = 1,
	starBrightness = 1,
	skyFloor = 0.02,
	rotationSpeed = 1,
	fov = 60,
	bloomStrength = 1,
	bloomRadius = 1,
	vignette = 0.4,
	grain = 0.06,
	chromaticAberration = 0.15,
	autoOrbit = true,
	debug = "off",
	tint = "#a855f7",
	ringColor = "#ffffff",
	paused = false,
	maxDpr = 1.5,
	fallbackSrc,
	className,
}) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const animationFrameId = useRef<number>(0);
	const startLoopRef = useRef<(() => void) | null>(null);

	// Live-tunable values read each frame — the GL context is never rebuilt
	// while a control is dragged, so tuning stays smooth (Threads idiom).
	const live = useRef({
		steps,
		diskInner,
		diskOuter,
		diskBrightness,
		dopplerMax,
		starBrightness,
		skyFloor,
		rotationSpeed,
		fov,
		bloomStrength,
		bloomRadius,
		vignette,
		grain,
		chromaticAberration,
		autoOrbit,
		debug,
		tint,
		ringColor,
		paused,
	});
	live.current = {
		steps,
		diskInner,
		diskOuter,
		diskBrightness,
		dopplerMax,
		starBrightness,
		skyFloor,
		rotationSpeed,
		fov,
		bloomStrength,
		bloomRadius,
		vignette,
		grain,
		chromaticAberration,
		autoOrbit,
		debug,
		tint,
		ringColor,
		paused,
	};

	// Camera state, eased every frame toward whichever mode owns it. A pointer
	// drag sets `manualActive` and steers targetAz/Inc; after IDLE_MS with no
	// interaction the cinematic orbit reclaims it. Radius is fixed (no zoom).
	const cam = useRef({
		r: ORBIT_R,
		inc: ORBIT_INC,
		az: 0,
		orbitAz: 0,
		manualActive: false,
		manualR: ORBIT_R,
		targetAz: 0,
		targetInc: ORBIT_INC,
		lastInteract: -1e9,
		spinDir: 1, // cinematic spin direction; adopts the user's last drag
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
			const renderer = new Renderer({
				alpha: false,
				antialias: false,
				premultipliedAlpha: true,
				powerPreference: "high-performance",
				dpr: Math.min(window.devicePixelRatio || 1, maxDpr),
				webgl: 2,
			});
			gl = renderer.gl;
			// If the requested WebGL2 context silently degraded, bail to the poster.
			if (
				typeof WebGL2RenderingContext === "undefined" ||
				!(gl instanceof WebGL2RenderingContext)
			) {
				throw new Error("BlackHole requires a WebGL2 context");
			}
			gl.clearColor(0, 0, 0, 1);
			container.appendChild(gl.canvas);

			// The ogl-augmented context (carries `.renderer`) is what RenderTarget
			// wants; the plain WebGL2 view is only for the format constants.
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
			const sceneRT = makeRT(iw, ih);
			const bloomA = makeRT(iw >> 1, ih >> 1);
			const bloomB = makeRT(iw >> 1, ih >> 1);

			const geometry = new Triangle(gl);
			const rayProgram = new Program(gl, {
				vertex: VERT,
				fragment: RAY_FRAG,
				uniforms: {
					uRes: { value: new Float32Array([iw, ih]) },
					uTime: { value: 0 },
					uCamPos: { value: new Float32Array([0, 2, 25]) },
					uCamTarget: { value: new Float32Array([0, 0, 0]) },
					uFocal: { value: 1 / Math.tan((fov * 0.5 * Math.PI) / 180) },
					uSteps: { value: steps },
					uDiskInner: { value: diskInner },
					uDiskOuter: { value: diskOuter },
					uDiskBrightness: { value: diskBrightness },
					uDoppler: { value: dopplerMax },
					uStarBright: { value: starBrightness },
					uSkyFloor: { value: skyFloor },
					uRotSpeed: { value: rotationSpeed },
					uTint: { value: new Float32Array(hexToRgb01(tint)) },
					uRingColor: { value: new Float32Array(hexToRgb01(ringColor)) },
					uDebug: { value: DEBUG_INDEX[debug] ?? 0 },
				},
			});
			if (!gl.getProgramParameter(rayProgram.program, gl.LINK_STATUS)) {
				throw new Error("BlackHole raytracer shader failed to link");
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
					uTexel: { value: new Float32Array([1 / (iw >> 1), 1 / (ih >> 1)]) },
					uDir: { value: new Float32Array([1, 0]) },
					uRadius: { value: bloomRadius },
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
					uBloomStrength: { value: bloomStrength },
					uVignette: { value: vignette },
					uGrain: { value: grain },
					uChroma: { value: chromaticAberration },
				},
			});

			const rayMesh = new Mesh(gl, { geometry, program: rayProgram });
			const brightMesh = new Mesh(gl, { geometry, program: brightProgram });
			const blurMesh = new Mesh(gl, { geometry, program: blurProgram });
			const compMesh = new Mesh(gl, { geometry, program: compProgram });

			function resize() {
				const { clientWidth, clientHeight } = container;
				if (clientWidth === 0 || clientHeight === 0) return;
				renderer.setSize(clientWidth, clientHeight);
				const bw = gl!.drawingBufferWidth;
				const bh = gl!.drawingBufferHeight;
				const hw = Math.max(1, bw >> 1);
				const hh = Math.max(1, bh >> 1);
				sceneRT.setSize(bw, bh);
				bloomA.setSize(hw, hh);
				bloomB.setSize(hw, hh);
				rayProgram.uniforms.uRes.value[0] = bw;
				rayProgram.uniforms.uRes.value[1] = bh;
				compProgram.uniforms.uRes.value[0] = bw;
				compProgram.uniforms.uRes.value[1] = bh;
				blurProgram.uniforms.uTexel.value[0] = 1 / hw;
				blurProgram.uniforms.uTexel.value[1] = 1 / hh;
			}
			const resizeObserver = new ResizeObserver(() => resize());
			resizeObserver.observe(container);
			resize();

			// Camera + clock state (no per-frame allocation).
			const camPos = new Float32Array(3);
			let accumulatedTime = 0;
			let lastTimestamp = -1;
			let timeScale = paused ? 0 : 1;
			let running = false;
			let dragging = false;
			let dragStartX = 0;
			let dragStartY = 0;
			let dragStartAz = 0;
			let dragStartInc = 0;
			let prevTargetAz = 0; // last azimuth target — its delta gives spin direction

			function renderPasses() {
				const l = live.current;

				// Raytracer -> sceneRT (HDR).
				renderer.render({ scene: rayMesh, target: sceneRT });

				const doBloom = l.bloomStrength > 0;
				if (doBloom) {
					brightProgram.uniforms.tMap.value = sceneRT.texture;
					renderer.render({ scene: brightMesh, target: bloomA });

					blurProgram.uniforms.tMap.value = bloomA.texture;
					blurProgram.uniforms.uDir.value[0] = 1;
					blurProgram.uniforms.uDir.value[1] = 0;
					blurProgram.uniforms.uRadius.value = l.bloomRadius;
					renderer.render({ scene: blurMesh, target: bloomB });

					blurProgram.uniforms.tMap.value = bloomB.texture;
					blurProgram.uniforms.uDir.value[0] = 0;
					blurProgram.uniforms.uDir.value[1] = 1;
					renderer.render({ scene: blurMesh, target: bloomA });

					compProgram.uniforms.tBloom.value = bloomA.texture;
					compProgram.uniforms.uBloomStrength.value = l.bloomStrength;
				} else {
					compProgram.uniforms.tBloom.value = sceneRT.texture;
					compProgram.uniforms.uBloomStrength.value = 0;
				}

				compProgram.uniforms.tScene.value = sceneRT.texture;
				renderer.render({ scene: compMesh });
			}

			function syncUniforms() {
				const l = live.current;
				rayProgram.uniforms.uTime.value = accumulatedTime;
				rayProgram.uniforms.uSteps.value = l.steps;
				rayProgram.uniforms.uDiskInner.value = l.diskInner;
				rayProgram.uniforms.uDiskOuter.value = l.diskOuter;
				rayProgram.uniforms.uDiskBrightness.value = l.diskBrightness;
				rayProgram.uniforms.uDoppler.value = l.dopplerMax;
				rayProgram.uniforms.uStarBright.value = l.starBrightness;
				rayProgram.uniforms.uSkyFloor.value = l.skyFloor;
				rayProgram.uniforms.uRotSpeed.value = l.rotationSpeed;
				rayProgram.uniforms.uFocal.value =
					1 / Math.tan((l.fov * 0.5 * Math.PI) / 180);
				rayProgram.uniforms.uDebug.value = DEBUG_INDEX[l.debug] ?? 0;
				const [tr, tg, tb] = hexToRgb01(l.tint);
				rayProgram.uniforms.uTint.value[0] = tr;
				rayProgram.uniforms.uTint.value[1] = tg;
				rayProgram.uniforms.uTint.value[2] = tb;
				const [rr, rg, rb] = hexToRgb01(l.ringColor);
				rayProgram.uniforms.uRingColor.value[0] = rr;
				rayProgram.uniforms.uRingColor.value[1] = rg;
				rayProgram.uniforms.uRingColor.value[2] = rb;

				compProgram.uniforms.uTime.value = accumulatedTime;
				compProgram.uniforms.uVignette.value = l.vignette;
				compProgram.uniforms.uGrain.value = l.grain;
				compProgram.uniforms.uChroma.value = l.chromaticAberration;
			}

			// Eases the camera toward the active mode's target and writes uCamPos.
			// Returns true while the pose is still moving (keeps the loop alive).
			function updateCamera(frameDt: number, now: number): boolean {
				const l = live.current;
				const c = cam.current;

				// Reclaim the cinematic orbit once the pointer has been idle.
				if (
					l.autoOrbit &&
					c.manualActive &&
					!dragging &&
					now - c.lastInteract > IDLE_MS
				) {
					c.manualActive = false;
				}

				let tr: number;
				let ti: number;
				let ta: number;
				if (dragging || c.manualActive) {
					tr = c.manualR;
					ti = c.targetInc;
					ta = c.targetAz;
					c.orbitAz = c.az; // stay aligned so the resume is seamless
				} else if (l.autoOrbit) {
					// Keep spinning from wherever the view is now — hold the current
					// radius and inclination, advance only the azimuth in the direction
					// the user last dragged. A tilted view is preserved; the orbit
					// just continues around it.
					c.orbitAz +=
						frameDt * timeScale * BASE_SPIN * l.rotationSpeed * c.spinDir;
					tr = c.r;
					ti = c.inc;
					ta = c.orbitAz;
				} else {
					// Frozen — hold exactly where the view was left.
					tr = c.r;
					ti = c.inc;
					ta = c.az;
					c.orbitAz = c.az;
				}

				const k = Math.min(1, frameDt * 6);
				c.r += (tr - c.r) * k;
				c.inc += (ti - c.inc) * k;
				c.az += (ta - c.az) * k;
				// Keep the ever-growing spin azimuth in a sane float range.
				if (c.az > 3600 || c.az < -3600) {
					const wrap = Math.floor(c.az / 360) * 360;
					c.az -= wrap;
					c.orbitAz -= wrap;
					c.targetAz -= wrap;
				}

				toCartesian(c.r, c.inc, c.az, camPos);
				rayProgram.uniforms.uCamPos.value[0] = camPos[0];
				rayProgram.uniforms.uCamPos.value[1] = camPos[1];
				rayProgram.uniforms.uCamPos.value[2] = camPos[2];

				return (
					dragging ||
					Math.abs(tr - c.r) > 1e-3 ||
					Math.abs(ti - c.inc) > 1e-3 ||
					Math.abs(ta - c.az) > 1e-3
				);
			}

			function update(t: number) {
				const dt = lastTimestamp >= 0 ? (t - lastTimestamp) * 0.001 : 0;
				lastTimestamp = t;
				const cdt = Math.min(dt, 0.1);

				const l = live.current;
				const target = l.paused ? 0 : 1;
				timeScale += (target - timeScale) * 0.05;
				accumulatedTime += cdt * timeScale;

				syncUniforms();
				const restless = updateCamera(cdt, t);
				renderPasses();

				// Self-halt once paused settles — a scrolled-past hero stops issuing
				// draw calls. Keep drawing while a drag is live or the pose is still
				// easing, so pointer control works even under reduced motion.
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

			// Pointer-drag orbit (SakuraTree idiom): pointerdown on the canvas grabs,
			// move/up on window so a drag that leaves the canvas keeps tracking. First
			// grab seeds from the current pose and breaks the cinematic flythrough.
			const canvas = gl.canvas as HTMLCanvasElement;
			function onPointerDown(e: PointerEvent) {
				if (e.pointerType === "mouse" && e.button !== 0) return;
				e.preventDefault();
				const c = cam.current;
				// Seed the drag from the current eased pose so it never jumps.
				if (!c.manualActive) {
					c.manualR = c.r;
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
					// setPointerCapture can throw if the pointer is already gone.
				}
				startLoop();
			}
			function onPointerMove(e: PointerEvent) {
				if (!dragging) return;
				const c = cam.current;
				// 360° azimuth is unclamped (cos/sin are periodic); inclination stays
				// off the poles where the camera basis would degenerate.
				const newAz = dragStartAz - (e.clientX - dragStartX) * 0.4;
				// The autoplay spin adopts the direction of the drag.
				if (Math.abs(newAz - prevTargetAz) > 0.01) {
					c.spinDir = Math.sign(newAz - prevTargetAz);
				}
				prevTargetAz = newAz;
				c.targetAz = newAz;
				c.targetInc = Math.min(
					168,
					Math.max(12, dragStartInc - (e.clientY - dragStartY) * 0.3),
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
					// Already released.
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
				"BlackHole: WebGL2 init failed, falling back to static image",
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

	// Resume the loop when unpausing — it self-halts once the pause ease settles.
	useEffect(() => {
		if (!paused) startLoopRef.current?.();
	}, [paused]);

	// Toggling the cinematic control back on re-arms the orbit immediately,
	// releasing any manual drag takeover.
	useEffect(() => {
		if (autoOrbit) cam.current.manualActive = false;
	}, [autoOrbit]);

	if (useFallback) {
		if (fallbackSrc) {
			return (
				<div className={className ?? "relative h-full w-full"}>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						src={fallbackSrc}
						alt=""
						aria-hidden
						className="absolute inset-0 h-full w-full object-cover"
					/>
				</div>
			);
		}
		// No poster shipped — draw a graphite void with a faint tinted event
		// horizon so the hero is never an empty box on unsupported GPUs.
		return (
			<div
				aria-hidden
				className={className ?? "relative h-full w-full"}
				style={{
					background:
						"radial-gradient(circle at 50% 48%, rgba(0,0,0,1) 22%, rgba(168,85,247,0.14) 26%, rgba(255,176,84,0.10) 30%, rgba(8,7,12,1) 55%)",
				}}
			/>
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

export default BlackHole;
