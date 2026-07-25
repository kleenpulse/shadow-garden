"use client";

// RIPPLE FIELD — a real-time GPU water surface. A single RG-float RenderTarget
// holds the wave field (R = height, G = previous height); a leapfrog solve of
// the 2D wave equation propagates every disturbance across it each frame. A
// pointer drag dimples the surface into expanding rings, ambient drops keep the
// pool restless, and the display pass lights it as dark amethyst water —
// gradient normals drive refraction of the pool floor, curvature focuses
// caustic threads, and Fresnel rims glint on every wavefront. The sim runs on a
// fixed grid decoupled from canvas DPR; only the display pass runs at screen
// resolution. Capability-probe / live-ref / self-halt / resize re-arm / static
// fallback skeleton mirrors SmokeField.tsx.

import React, { useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle, RenderTarget } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

type Quality = "low" | "medium" | "high";

// This shader stack needs WebGL2 (#version 300 es) + renderable float targets.
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

interface RippleFieldProps {
	/** Amethyst tint of the water — specular glints, caustics, crest light. */
	waterColor?: string;
	/** Deep pool base color the surface sits over. */
	deepColor?: string;
	/** Simulation grid resolution bundle. Higher is crisper and costlier. */
	quality?: Quality;
	/** Wave propagation coefficient (0..0.49). Higher spreads ripples faster;
	 *  the leapfrog solve goes unstable at 0.5, so the control caps below it. */
	tension?: number;
	/** Per-step energy retention. Toward 1 ripples ring for longer. */
	damping?: number;
	/** Displacement force of a pointer drag / drop. */
	splatForce?: number;
	/** Size of the surface dimple a drag / drop carves, in screen fractions. */
	splatRadius?: number;
	/** How strongly the surface slope refracts the pool floor beneath. */
	refraction?: number;
	/** Intensity of the specular + Fresnel glints on each wavefront. */
	specular?: number;
	/** Specular tightness — higher is a sharper, glassier highlight. */
	glossiness?: number;
	/** Brightness of the caustic threads where wavefronts focus light. */
	caustics?: number;
	/** Randomly drop into the pool when idle so it never sits perfectly still. */
	autoRipple?: boolean;
	/** Animated fine grain over the final image. */
	grain?: number;
	/** Freeze the field and halt the loop (scrolled past / reduced motion). */
	paused?: boolean;
	/** OS reduced-motion: bake a still pool, halt, and ignore pointer input. */
	reducedMotion?: boolean;
	fallbackSrc?: string;
	className?: string;
}

// ---- Shared full-screen vertex shader (one Triangle, reused by every pass).
const VERT = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4(position, 0.0, 1.0);
}
`;

// Leapfrog 2D wave equation. State: R = current height, G = previous height.
//   next = 2·c − p + C2·(∇²h),   then × damping
// C2 ≤ 0.5 for stability; CLAMP_TO_EDGE sampling reflects waves off the walls
// so the pool is properly bounded.
const UPDATE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uState;
uniform vec2 texelSize;
uniform float uC2;
uniform float uDamping;
void main() {
	vec2 s = texture(uState, vUv).rg;
	float c = s.r;
	float p = s.g;
	float L = texture(uState, vUv - vec2(texelSize.x, 0.0)).r;
	float R = texture(uState, vUv + vec2(texelSize.x, 0.0)).r;
	float T = texture(uState, vUv + vec2(0.0, texelSize.y)).r;
	float B = texture(uState, vUv - vec2(0.0, texelSize.y)).r;
	float lap = (L + R + T + B) - 4.0 * c;
	float next = (2.0 * c - p) + uC2 * lap;
	next *= uDamping;
	fragColor = vec4(next, c, 0.0, 1.0);
}
`;

// Additive gaussian dimple — pushes the current height (R) without touching the
// previous height (G), so the leapfrog reads it as a fresh disturbance and rings
// it outward. Drags inject a negative bump (a trough that rebounds).
const SPLAT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uState;
uniform float uAspect;
uniform float uAmount;
uniform vec2 uPoint;
uniform float uRadius;
void main() {
	vec2 p = vUv - uPoint;
	p.x *= uAspect;
	float rr = max(uRadius * uRadius, 1e-6);
	float bump = exp(-dot(p, p) / rr) * uAmount;
	vec2 s = texture(uState, vUv).rg;
	fragColor = vec4(s.r + bump, s.g, 0.0, 1.0);
}
`;

// Display — light the height field as dark amethyst water. Gradient normals
// refract the pool floor, curvature (laplacian) focuses caustic threads, and a
// Fresnel term rims every wavefront with a glassy glint.
const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uState;
uniform vec2 texelSize;
uniform vec3 uWaterColor;
uniform vec3 uDeepColor;
uniform float uRefraction;
uniform float uSpecular;
uniform float uGloss;
uniform float uCaustics;
uniform float uNormalScale;
uniform float uGrain;
uniform float uTime;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
	float h  = texture(uState, vUv).r;
	float hL = texture(uState, vUv - vec2(texelSize.x, 0.0)).r;
	float hR = texture(uState, vUv + vec2(texelSize.x, 0.0)).r;
	float hT = texture(uState, vUv + vec2(0.0, texelSize.y)).r;
	float hB = texture(uState, vUv - vec2(0.0, texelSize.y)).r;

	// Surface normal from the height gradient (z up out of the pool).
	vec3 n = normalize(vec3((hL - hR) * uNormalScale, (hB - hT) * uNormalScale, 1.0));

	vec3 viewDir = vec3(0.0, 0.0, 1.0);
	vec3 lightDir = normalize(vec3(-0.4, 0.5, 0.85));

	// Refraction — sample the pool floor offset by the surface slope so the
	// bottom shifts and warps beneath the ripples.
	vec2 buv = vUv + n.xy * uRefraction * 0.05;
	float depth = smoothstep(-0.15, 1.05, buv.y);
	vec3 base = mix(uDeepColor * 0.65, uDeepColor + uWaterColor * 0.06, depth);

	// Caustics — converging wavefronts focus light. Curvature ≈ −laplacian; it
	// spikes where the surface pinches, threading amethyst light on the floor.
	float lap = (hL + hR + hT + hB) - 4.0 * h;
	float caust = pow(max(-lap * 42.0, 0.0), 1.5);
	base += uWaterColor * caust * uCaustics * 0.5;

	// Fresnel rim — grazing wavefronts glint like glass edges.
	float fres = pow(1.0 - n.z, 3.0);

	// Specular highlight — amethyst glints where a normal catches the key light.
	vec3 refl = reflect(-lightDir, n);
	float spec = pow(max(dot(refl, viewDir), 0.0), uGloss);

	vec3 col = base;
	col += uWaterColor * spec * uSpecular;
	col += mix(uWaterColor, vec3(1.0), 0.4) * fres * uSpecular * 0.55;
	// Crests read a touch brighter than troughs.
	col += uWaterColor * clamp(h * 2.5, -0.2, 0.35) * 0.5;

	// Animated grain (uTime kept bounded upstream so the hash never drifts).
	float g = hash(gl_FragCoord.xy + fract(uTime * 13.7) * 97.0) - 0.5;
	col += g * uGrain * (1.0 - 0.5 * dot(col, vec3(0.333)));

	fragColor = vec4(max(col, 0.0), 1.0);
}
`;

// Surface-slope → normal gain. Heights are small, so the gradient is amplified
// to read as real relief without exposing yet another control.
const NORMAL_SCALE = 6.0;
// Base dimple amplitudes (negative = a trough that rebounds into a ring).
const DROP_AMOUNT = -0.55; // ambient auto-drop
const HOVER_AMOUNT = -0.32; // one dimple per step of pointer travel
const PRESS_AMOUNT = -0.75; // a deliberate press drops a heavier stone
// Pointer travel between injected dimples, in screen fractions — spaces the
// hover wake evenly regardless of how fast pointermove events arrive.
const HOVER_STEP = 0.018;

function simResolution(quality: Quality): number {
	if (quality === "low") return 256;
	if (quality === "high") return 512;
	return 384;
}

// Aspect-correct FBO dimensions so the sim grid matches the canvas shape.
function gridDims(res: number, bw: number, bh: number): { w: number; h: number } {
	let aspect = bw / Math.max(bh, 1);
	if (aspect < 1) aspect = 1 / aspect;
	const min = Math.max(1, Math.round(res));
	const max = Math.max(1, Math.round(res * aspect));
	return bw > bh ? { w: max, h: min } : { w: min, h: max };
}

const RippleField: React.FC<RippleFieldProps> = ({
	waterColor = "#F7FAFF",
	deepColor = "#1227E1",
	quality = "medium",
	tension = 0.35,
	damping = 0.99,
	splatForce = 1,
	splatRadius = 0.03,
	refraction = 1,
	specular = 0.4,
	glossiness = 96,
	caustics = 1.5,
	autoRipple = true,
	grain = 0,
	paused = false,
	reducedMotion = false,
	fallbackSrc,
	className,
}) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const drawRef = useRef<(() => void | false) | null>(null);
	const measureRef = useRef<((m: Metrics) => void) | null>(null);
	const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(
		null,
	);

	const loop = useAnimationLoop({
		target: containerRef,
		halted: paused || reducedMotion,
		dpr: "auto",
		onResize: (metrics) => measureRef.current?.(metrics),
		onFrame: () => drawRef.current?.() ?? false,
		gl: () => glRef.current,
	});

	// Live-tunable values read each frame — the GL context is never rebuilt while
	// a control is dragged (SmokeField idiom). Only `quality` (resolution) rebuilds.
	const live = useRef({
		waterColor,
		deepColor,
		tension,
		damping,
		splatForce,
		splatRadius,
		refraction,
		specular,
		glossiness,
		caustics,
		autoRipple,
		grain,
		paused,
		reducedMotion,
	});
	live.current = {
		waterColor,
		deepColor,
		tension,
		damping,
		splatForce,
		splatRadius,
		refraction,
		specular,
		glossiness,
		caustics,
		autoRipple,
		grain,
		paused,
		reducedMotion,
	};

	const [useFallback, setUseFallback] = useState(false);
	useEffect(() => {
		if (!supportsWebGL2()) setUseFallback(true);
	}, []);

	useEffect(() => {
		if (useFallback || !containerRef.current) return;
		const container = containerRef.current;

		let gl: Renderer["gl"] | undefined;
		try {
			const renderer = new Renderer({
				alpha: false,
				antialias: false,
				premultipliedAlpha: false,
				powerPreference: "high-performance",
				dpr: Math.min(window.devicePixelRatio || 1, 1.5),
				webgl: 2,
			});
			gl = renderer.gl;
			if (
				typeof WebGL2RenderingContext === "undefined" ||
				!(gl instanceof WebGL2RenderingContext)
			) {
				throw new Error("RippleField requires a WebGL2 context");
			}
			gl.clearColor(0, 0, 0, 1);
			// Out of flow — an in-flow canvas with an explicit pixel width holds the
			// container open, so it never shrinks and the observer never fires.
			gl.canvas.style.position = "absolute";
			gl.canvas.style.top = "0";
			gl.canvas.style.left = "0";
			container.appendChild(gl.canvas);

			const glc = renderer.gl;
			const gl2 = glc as unknown as WebGL2RenderingContext;
			// Float render targets + linear filtering for smooth normals on display.
			const colorFloat = gl2.getExtension("EXT_color_buffer_float");
			gl2.getExtension("OES_texture_float_linear");
			if (!colorFloat) {
				throw new Error("RippleField requires EXT_color_buffer_float");
			}
			const makeRT = (w: number, h: number) =>
				new RenderTarget(glc, {
					width: Math.max(1, w),
					height: Math.max(1, h),
					depth: false,
					type: gl2.HALF_FLOAT,
					format: gl2.RGBA,
					internalFormat: gl2.RGBA16F,
					minFilter: gl2.LINEAR,
					magFilter: gl2.LINEAR,
					wrapS: gl2.CLAMP_TO_EDGE,
					wrapT: gl2.CLAMP_TO_EDGE,
				});

			// Ping-pong pair — the whole sim is one field, swapped after each write.
			type Double = {
				read: RenderTarget;
				write: RenderTarget;
				swap: () => void;
				setSize: (w: number, h: number) => void;
			};
			const makeDouble = (w: number, h: number): Double => {
				const d: Double = {
					read: makeRT(w, h),
					write: makeRT(w, h),
					swap() {
						const t = d.read;
						d.read = d.write;
						d.write = t;
					},
					setSize(nw: number, nh: number) {
						d.read.setSize(Math.max(1, nw), Math.max(1, nh));
						d.write.setSize(Math.max(1, nw), Math.max(1, nh));
					},
				};
				return d;
			};

			// Establish the drawing buffer before sizing the grid.
			renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
			const baseRes = simResolution(quality);
			let dim = gridDims(baseRes, gl.drawingBufferWidth, gl.drawingBufferHeight);
			let simW = dim.w;
			let simH = dim.h;

			const simTexel = new Float32Array([1 / simW, 1 / simH]);
			const state = makeDouble(simW, simH);

			const geometry = new Triangle(gl);
			const mkProgram = (
				fragment: string,
				uniforms: Record<string, { value: unknown }>,
			) => new Program(gl!, { vertex: VERT, fragment, uniforms });

			const updateProgram = mkProgram(UPDATE_FRAG, {
				uState: { value: state.read.texture },
				texelSize: { value: simTexel },
				uC2: { value: tension },
				uDamping: { value: damping },
			});
			const splatProgram = mkProgram(SPLAT_FRAG, {
				uState: { value: state.read.texture },
				uAspect: { value: simW / simH },
				uAmount: { value: 0 },
				uPoint: { value: new Float32Array([0.5, 0.5]) },
				uRadius: { value: 0.05 },
			});
			const dispProgram = mkProgram(DISPLAY_FRAG, {
				uState: { value: state.read.texture },
				texelSize: { value: simTexel },
				uWaterColor: { value: new Float32Array(hexToRgb01(waterColor)) },
				uDeepColor: { value: new Float32Array(hexToRgb01(deepColor)) },
				uRefraction: { value: refraction },
				uSpecular: { value: specular },
				uGloss: { value: glossiness },
				uCaustics: { value: caustics },
				uNormalScale: { value: NORMAL_SCALE },
				uGrain: { value: grain },
				uTime: { value: 0 },
			});
			if (!gl.getProgramParameter(dispProgram.program, gl.LINK_STATUS)) {
				throw new Error("RippleField display shader failed to link");
			}

			const updateMesh = new Mesh(gl, { geometry, program: updateProgram });
			const splatMesh = new Mesh(gl, { geometry, program: splatProgram });
			const dispMesh = new Mesh(gl, { geometry, program: dispProgram });

			let accumulatedTime = 0;

			// One additive gaussian dimple into the height channel.
			function splat(x: number, y: number, amount: number, radius: number) {
				splatProgram.uniforms.uState.value = state.read.texture;
				splatProgram.uniforms.uAspect.value = simW / simH;
				splatProgram.uniforms.uAmount.value = amount;
				splatProgram.uniforms.uRadius.value = radius;
				const point = splatProgram.uniforms.uPoint.value as Float32Array;
				point[0] = x;
				point[1] = y;
				renderer.render({ scene: splatMesh, target: state.write });
				state.swap();
			}

			// Pointer-drag dimples queued from handlers, drained per frame.
			const pointerSplats: { x: number; y: number; amount: number; radius: number }[] =
				[];

			// Ambient-drop bookkeeping (frame-counted so it's frame-rate stable-ish).
			let dropTimer = 0;

			function drainSplats() {
				while (pointerSplats.length) {
					const s = pointerSplats.shift()!;
					splat(s.x, s.y, s.amount, s.radius);
				}
			}

			// One frame of physics: inject queued drags, occasionally an ambient
			// drop, then step the wave field forward once.
			function step(allowAuto: boolean) {
				const l = live.current;
				drainSplats();

				if (allowAuto && l.autoRipple) {
					dropTimer -= 1;
					if (dropTimer <= 0) {
						dropTimer = 45 + Math.floor(Math.random() * 90);
						splat(
							0.1 + Math.random() * 0.8,
							0.1 + Math.random() * 0.8,
							DROP_AMOUNT * (0.5 + Math.random() * 0.6) * l.splatForce,
							Math.max(0.006, l.splatRadius * 0.7),
						);
					}
				}

				updateProgram.uniforms.uState.value = state.read.texture;
				updateProgram.uniforms.uC2.value = Math.min(l.tension, 0.49);
				updateProgram.uniforms.uDamping.value = l.damping;
				renderer.render({ scene: updateMesh, target: state.write });
				state.swap();
			}

			// Forced central drops for warm-up so a halted canvas bakes real ripple
			// rings rather than a flat, empty pool.
			function seedDrops() {
				const l = live.current;
				const r = Math.max(0.01, l.splatRadius);
				splat(0.5, 0.55, -0.8, r);
				splat(0.32, 0.4, -0.5, r * 0.8);
				splat(0.68, 0.62, -0.5, r * 0.8);
			}

			// Synchronous warm-up: propagate a few developed rings, then halt.
			function warmUp(frames: number) {
				for (let i = 0; i < frames; i++) {
					accumulatedTime += 0.016;
					step(false);
				}
			}

			function blit() {
				const l = live.current;
				dispProgram.uniforms.uState.value = state.read.texture;
				const wc = hexToRgb01(l.waterColor);
				const wcv = dispProgram.uniforms.uWaterColor.value as Float32Array;
				wcv[0] = wc[0];
				wcv[1] = wc[1];
				wcv[2] = wc[2];
				const dc = hexToRgb01(l.deepColor);
				const dcv = dispProgram.uniforms.uDeepColor.value as Float32Array;
				dcv[0] = dc[0];
				dcv[1] = dc[1];
				dcv[2] = dc[2];
				dispProgram.uniforms.uRefraction.value = l.refraction;
				dispProgram.uniforms.uSpecular.value = l.specular;
				dispProgram.uniforms.uGloss.value = l.glossiness;
				dispProgram.uniforms.uCaustics.value = l.caustics;
				dispProgram.uniforms.uGrain.value = l.grain;
				// Keep uTime bounded so the grain hash never loses float precision.
				dispProgram.uniforms.uTime.value = accumulatedTime % 1000;
				renderer.render({ scene: dispMesh });
			}

			drawRef.current = () => {
				const l = live.current;

				// Paused / reduced-motion: freeze the field, re-blit once, self-halt.
				if (l.paused || l.reducedMotion) {
					blit();
					return false;
				}

				accumulatedTime += 0.016;
				step(true);
				blit();
			};

			// Re-size canvas + grid. Grid dims change only when aspect changes;
			// resizing an FBO clears it, so re-seed drops after a real change.
			function resize({ width, height, dpr }: Metrics): boolean {
				if (width === 0 || height === 0) return false;
				renderer.dpr = dpr;
				renderer.setSize(width, height);
				const d = gridDims(baseRes, gl!.drawingBufferWidth, gl!.drawingBufferHeight);
				if (d.w === simW && d.h === simH) return false;
				simW = d.w;
				simH = d.h;
				simTexel[0] = 1 / simW;
				simTexel[1] = 1 / simH;
				state.setSize(simW, simH);
				return true;
			}

			// A resize clears the field; re-seed + (if halted) warm-up so a paused
			// canvas repaints a rippled pool. The host then paints one frame.
			measureRef.current = (metrics) => {
				if (!resize(metrics)) return;
				seedDrops();
				if (live.current.paused || live.current.reducedMotion) warmUp(64);
				blit();
			};

			glRef.current = gl;
			loop.resize();

			// Initial state: seed drops, then either run or bake-and-halt.
			seedDrops();
			if (live.current.paused || live.current.reducedMotion) {
				warmUp(80);
				blit();
			} else {
				loop.start();
			}

			// Pointer wake — a bare hover disturbs the pool; no button required. The
			// pointer is tracked on window (element listeners can be swallowed by the
			// showcase stage overlay — FlockField idiom) and its position mapped
			// through the canvas rect, so a dimple is injected once per HOVER_STEP of
			// travel: fast motion carves a strong wake, a still cursor leaves it calm.
			// A press drops a heavier stone. Ignored while paused / reduced-motion.
			const canvas = gl.canvas as HTMLCanvasElement;
			let lastRelX = -1;
			let lastRelY = -1;
			let travel = 0;

			// Returns the pointer position in [0,1] canvas space, or null if it's
			// outside the pool (which also resets the travel accumulator).
			function relPos(e: PointerEvent): { rx: number; ry: number } | null {
				const rect = canvas.getBoundingClientRect();
				if (rect.width === 0 || rect.height === 0) return null;
				const rx = (e.clientX - rect.left) / rect.width;
				const ry = (e.clientY - rect.top) / rect.height;
				if (rx < 0 || rx > 1 || ry < 0 || ry > 1) {
					lastRelX = -1;
					return null;
				}
				return { rx, ry };
			}

			function onPointerMove(e: PointerEvent) {
				const l = live.current;
				if (l.paused || l.reducedMotion) return;
				const p = relPos(e);
				if (!p) return;
				if (lastRelX < 0) {
					// First sample after entering the pool — seed, don't dimple yet.
					lastRelX = p.rx;
					lastRelY = p.ry;
					travel = 0;
					return;
				}
				travel += Math.hypot(p.rx - lastRelX, p.ry - lastRelY);
				lastRelX = p.rx;
				lastRelY = p.ry;
				if (travel < HOVER_STEP) return;
				travel = 0;
				pointerSplats.push({
					x: p.rx,
					y: 1 - p.ry,
					amount: HOVER_AMOUNT * l.splatForce,
					radius: Math.max(0.008, l.splatRadius),
				});
			}

			function onPointerDown(e: PointerEvent) {
				const l = live.current;
				if (l.paused || l.reducedMotion) return;
				if (e.pointerType === "mouse" && e.button !== 0) return;
				const p = relPos(e);
				if (!p) return;
				pointerSplats.push({
					x: p.rx,
					y: 1 - p.ry,
					amount: PRESS_AMOUNT * l.splatForce,
					radius: Math.max(0.008, l.splatRadius * 1.3),
				});
			}

			canvas.addEventListener("pointerdown", onPointerDown);
			window.addEventListener("pointermove", onPointerMove);

			return () => {
				drawRef.current = null;
				measureRef.current = null;
				canvas.removeEventListener("pointerdown", onPointerDown);
				window.removeEventListener("pointermove", onPointerMove);
				// The host drops the context; this only detaches the canvas.
				if (container.contains(gl!.canvas)) container.removeChild(gl!.canvas);
			};
		} catch (err) {
			console.warn(
				"RippleField: WebGL2 init failed, falling back to static image",
				err,
			);
			if (gl) {
				if (container.contains(gl.canvas)) container.removeChild(gl.canvas);
				gl.getExtension("WEBGL_lose_context")?.loseContext();
			}
			setUseFallback(true);
			return;
		}
		// Only `quality` (grid resolution) and the fallback flag rebuild GL.
	}, [useFallback, quality]);


	const baseClass = "relative h-full w-full";

	if (useFallback) {
		if (fallbackSrc) {
			return (
				<div className={className ? `${baseClass} ${className}` : baseClass}>
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
		// No poster — a static dark-amethyst pool so the stage is never blank.
		return (
			<div
				aria-hidden
				className={className ? `${baseClass} ${className}` : baseClass}
				style={{
					background:
						"radial-gradient(120% 100% at 50% 40%, rgba(168,85,247,0.22) 0%, rgba(126,58,206,0.10) 30%, rgba(12,6,22,0.7) 60%, #05010a 85%)",
				}}
			/>
		);
	}

	return (
		<div
			ref={containerRef}
			className={
				className
					? `${baseClass} [&_canvas]:cursor-crosshair [&_canvas]:touch-none ${className}`
					: `${baseClass} [&_canvas]:cursor-crosshair [&_canvas]:touch-none`
			}
		/>
	);
};

export default RippleField;
