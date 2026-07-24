"use client";

// SHADOW BLOOM — a real-time Gray-Scott reaction-diffusion GPU solver. Two
// species U (substrate) and V (bloom) live in the .r / .g channels of a pair of
// ping-ponged floating-point RenderTargets on a FIXED sim grid decoupled from
// canvas DPR. Each frame runs `growthSpeed` reaction iterations (5-tap Laplacian
// + Gray-Scott kinetics), draining a splat queue that injects V gaussians where
// the pointer drags. A display pass maps V through `contrast` into a
// background→tint ramp, so living tendrils of darkness grow with an amethyst
// glow. Capability-probe / pause / resize skeleton mirrors SmokeField.tsx
// (WebGL2 + EXT_color_buffer_float float FBOs, live-ref, self-halt, resize
// re-seed, static fallback).

import React, { useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle, RenderTarget } from "ogl";

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

interface ShadowBloomProps {
	/** Gray-Scott feed rate F — how fast substrate U is replenished. */
	feed?: number;
	/** Gray-Scott kill rate k — how fast bloom V is removed. */
	kill?: number;
	/** Reaction iterations per animation frame (integer). Higher = faster growth. */
	growthSpeed?: number;
	/** Radius (UV) of injected V gaussian blobs. */
	seedRadius?: number;
	/** Amplitude of injected V blobs (pointer + auto-seed). */
	brushStrength?: number;
	/** Contrast applied to V before the color ramp. */
	contrast?: number;
	/** Periodically drop a seed so the field never fully empties. */
	autoSeed?: boolean;
	/** Bloom tint hex (living tendrils). */
	tint?: string;
	/** Background hex (empty substrate). */
	backgroundColor?: string;
	/** Freeze the fields and halt the loop (scrolled past / reduced motion). */
	paused?: boolean;
	/** OS reduced-motion: bake a developed bloom, halt, and ignore pointer input. */
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

// Initial state: U = 1 (full substrate), V = 0 (no bloom yet).
const INIT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
void main() {
	fragColor = vec4(1.0, 0.0, 0.0, 1.0);
}
`;

// Gray-Scott reaction step. 5-tap (cross) Laplacian on the sim grid; CLAMP_TO_EDGE
// sampling gives a zero-flux (Neumann) boundary. dt≈1, Du≈0.16, Dv≈0.08.
const REACT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uState;
uniform vec2 texelSize;
uniform float uFeed;
uniform float uKill;
uniform float uDu;
uniform float uDv;
uniform float uDt;
void main() {
	vec2 c = texture(uState, vUv).rg;
	float u = c.r;
	float v = c.g;

	vec2 L = texture(uState, vUv - vec2(texelSize.x, 0.0)).rg;
	vec2 R = texture(uState, vUv + vec2(texelSize.x, 0.0)).rg;
	vec2 T = texture(uState, vUv + vec2(0.0, texelSize.y)).rg;
	vec2 B = texture(uState, vUv - vec2(0.0, texelSize.y)).rg;

	float lapU = L.r + R.r + T.r + B.r - 4.0 * u;
	float lapV = L.g + R.g + T.g + B.g - 4.0 * v;

	float reaction = u * v * v;
	float du = uDu * lapU - reaction + uFeed * (1.0 - u);
	float dv = uDv * lapV + reaction - (uFeed + uKill) * v;

	float nu = clamp(u + du * uDt, 0.0, 1.0);
	float nv = clamp(v + dv * uDt, 0.0, 1.0);
	fragColor = vec4(nu, nv, 0.0, 1.0);
}
`;

// Gaussian V injection: add bloom to .g, carve a little substrate from .r so the
// reaction has contrast to grow from. Additive so overlapping splats accumulate.
const SPLAT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTarget;
uniform float uAspect;
uniform vec2 uPoint;
uniform float uRadius;
uniform float uAmount;
void main() {
	vec2 p = vUv - uPoint;
	p.x *= uAspect;
	float rr = uRadius * uRadius;
	float g = exp(-dot(p, p) / max(rr, 1e-6)) * uAmount;
	vec2 base = texture(uTarget, vUv).rg;
	float nv = clamp(base.g + g, 0.0, 1.0);
	float nu = clamp(base.r - g * 0.5, 0.0, 1.0);
	fragColor = vec4(nu, nv, 0.0, 1.0);
}
`;

// Display: map V through contrast into a background→tint ramp, add an amethyst
// glow highlight on the densest tendrils.
const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uState;
uniform vec3 uBg;
uniform vec3 uTint;
uniform float uContrast;
void main() {
	float v = texture(uState, vUv).g;
	float x = clamp(v * uContrast, 0.0, 1.0);
	float t = x * x * (3.0 - 2.0 * x);
	vec3 col = mix(uBg, uTint, t);
	col += uTint * pow(t, 3.0) * 0.4;
	fragColor = vec4(max(col, 0.0), 1.0);
}
`;

// Explicit-Euler diffusion constants (stable while Du*dt < 0.25).
const DU = 0.16;
const DV = 0.08;
const REACT_DT = 1.0;
// Fixed sim grid — the reaction runs at this resolution regardless of canvas DPR.
const SIM_BASE = 300;
// Real-time seconds between auto-seed drops.
const AUTO_SEED_INTERVAL = 2.6;

// Aspect-correct FBO dimensions so the sim grid matches the canvas shape while
// the shorter side stays fixed at `res` (decoupled from device pixels).
function gridDims(res: number, bw: number, bh: number): { w: number; h: number } {
	let aspect = bw / Math.max(bh, 1);
	if (aspect < 1) aspect = 1 / aspect;
	const min = Math.max(1, Math.round(res));
	const max = Math.max(1, Math.round(res * aspect));
	return bw > bh ? { w: max, h: min } : { w: min, h: max };
}

const ShadowBloom: React.FC<ShadowBloomProps> = ({
	feed = 0.055,
	kill = 0.062,
	growthSpeed = 12,
	seedRadius = 0.05,
	brushStrength = 0.7,
	contrast = 1.4,
	autoSeed = true,
	tint = "#a855f7",
	backgroundColor = "#07030d",
	paused = false,
	reducedMotion = false,
	fallbackSrc,
	className,
}) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const animationFrameId = useRef<number>(0);
	const startLoopRef = useRef<(() => void) | null>(null);

	// Live-tunable values read each frame — the GL context is never rebuilt while
	// a control is dragged (SmokeField idiom). Nothing here rebuilds GL.
	const live = useRef({
		feed,
		kill,
		growthSpeed,
		seedRadius,
		brushStrength,
		contrast,
		autoSeed,
		tint,
		backgroundColor,
		paused,
		reducedMotion,
	});
	live.current = {
		feed,
		kill,
		growthSpeed,
		seedRadius,
		brushStrength,
		contrast,
		autoSeed,
		tint,
		backgroundColor,
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
				throw new Error("ShadowBloom requires a WebGL2 context");
			}
			gl.clearColor(0, 0, 0, 1);
			container.appendChild(gl.canvas);

			const glc = renderer.gl;
			const gl2 = glc as unknown as WebGL2RenderingContext;
			// Renderable float targets + linear filtering for the smooth display ramp.
			const colorFloat = gl2.getExtension("EXT_color_buffer_float");
			const floatLinear = gl2.getExtension("OES_texture_float_linear");
			if (!colorFloat || !floatLinear) {
				throw new Error(
					"ShadowBloom requires EXT_color_buffer_float + OES_texture_float_linear",
				);
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

			// Ping-pong pair helper — swap after every pass that writes it.
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
			let dim = gridDims(SIM_BASE, gl.drawingBufferWidth, gl.drawingBufferHeight);
			let simW = dim.w;
			let simH = dim.h;

			// Shared texel size for the reaction pass (updated in place on resize).
			const simTexel = new Float32Array([1 / simW, 1 / simH]);

			const state = makeDouble(simW, simH);

			const geometry = new Triangle(gl);
			const mkProgram = (fragment: string, uniforms: Record<string, { value: unknown }>) =>
				new Program(gl!, { vertex: VERT, fragment, uniforms });

			const initProgram = mkProgram(INIT_FRAG, {});
			const reactProgram = mkProgram(REACT_FRAG, {
				uState: { value: state.read.texture },
				texelSize: { value: simTexel },
				uFeed: { value: feed },
				uKill: { value: kill },
				uDu: { value: DU },
				uDv: { value: DV },
				uDt: { value: REACT_DT },
			});
			const splatProgram = mkProgram(SPLAT_FRAG, {
				uTarget: { value: state.read.texture },
				uAspect: { value: simW / simH },
				uPoint: { value: new Float32Array([0.5, 0.5]) },
				uRadius: { value: 0.05 },
				uAmount: { value: 0.7 },
			});
			const dispProgram = mkProgram(DISPLAY_FRAG, {
				uState: { value: state.read.texture },
				uBg: { value: new Float32Array(hexToRgb01(backgroundColor)) },
				uTint: { value: new Float32Array(hexToRgb01(tint)) },
				uContrast: { value: contrast },
			});
			if (!gl.getProgramParameter(dispProgram.program, gl.LINK_STATUS)) {
				throw new Error("ShadowBloom display shader failed to link");
			}

			const initMesh = new Mesh(gl, { geometry, program: initProgram });
			const reactMesh = new Mesh(gl, { geometry, program: reactProgram });
			const splatMesh = new Mesh(gl, { geometry, program: splatProgram });
			const dispMesh = new Mesh(gl, { geometry, program: dispProgram });

			let accumulatedTime = 0;
			let nextSeedTime = AUTO_SEED_INTERVAL;

			// Reset both buffers to (U=1, V=0).
			function initState() {
				renderer.render({ scene: initMesh, target: state.write });
				state.swap();
				renderer.render({ scene: initMesh, target: state.write });
				state.swap();
			}

			// One gaussian V injection at (x,y) UV with radius / amount.
			function splat(x: number, y: number, radius: number, amount: number) {
				splatProgram.uniforms.uAspect.value = simW / simH;
				splatProgram.uniforms.uRadius.value = radius;
				splatProgram.uniforms.uAmount.value = amount;
				const point = splatProgram.uniforms.uPoint.value as Float32Array;
				point[0] = x;
				point[1] = y;
				splatProgram.uniforms.uTarget.value = state.read.texture;
				renderer.render({ scene: splatMesh, target: state.write });
				state.swap();
			}

			// Scatter a handful of V blobs so the bloom has somewhere to grow.
			function seedField() {
				const l = live.current;
				const r = Math.max(0.012, l.seedRadius);
				const amt = Math.max(0.2, l.brushStrength);
				const pts: [number, number][] = [
					[0.5, 0.5],
					[0.32, 0.62],
					[0.68, 0.38],
					[0.42, 0.34],
					[0.6, 0.66],
				];
				for (const [x, y] of pts) splat(x, y, r, amt);
			}

			// One reaction pass with the current live feed / kill.
			function reactStep() {
				const l = live.current;
				reactProgram.uniforms.uState.value = state.read.texture;
				reactProgram.uniforms.uFeed.value = l.feed;
				reactProgram.uniforms.uKill.value = l.kill;
				renderer.render({ scene: reactMesh, target: state.write });
				state.swap();
			}

			function runReactions(n: number) {
				for (let i = 0; i < n; i++) reactStep();
			}

			// Pointer-drag splats queued from event handlers, drained per frame.
			const pointerSplats: { x: number; y: number; radius: number; amount: number }[] = [];

			function drainInjections() {
				const l = live.current;
				while (pointerSplats.length) {
					const s = pointerSplats.shift()!;
					splat(s.x, s.y, s.radius, s.amount);
				}
				if (l.autoSeed && accumulatedTime >= nextSeedTime) {
					nextSeedTime = accumulatedTime + AUTO_SEED_INTERVAL;
					const x = 0.14 + Math.random() * 0.72;
					const y = 0.14 + Math.random() * 0.72;
					splat(x, y, Math.max(0.012, l.seedRadius), Math.max(0.2, l.brushStrength));
				}
			}

			// Synchronous warm-up: grow a developed bloom before halting so a paused /
			// reduced-motion stage is never blank.
			function warmUp(iters: number) {
				runReactions(iters);
			}

			function blit() {
				const l = live.current;
				dispProgram.uniforms.uState.value = state.read.texture;
				const bg = hexToRgb01(l.backgroundColor);
				const bgv = dispProgram.uniforms.uBg.value as Float32Array;
				bgv[0] = bg[0];
				bgv[1] = bg[1];
				bgv[2] = bg[2];
				const tn = hexToRgb01(l.tint);
				const tnv = dispProgram.uniforms.uTint.value as Float32Array;
				tnv[0] = tn[0];
				tnv[1] = tn[1];
				tnv[2] = tn[2];
				dispProgram.uniforms.uContrast.value = l.contrast;
				renderer.render({ scene: dispMesh });
			}

			let running = false;
			let lastTimestamp = -1;

			function update(t: number) {
				const l = live.current;
				const dt = lastTimestamp >= 0 ? (t - lastTimestamp) * 0.001 : 0;
				lastTimestamp = t;

				// Paused / reduced-motion: freeze the fields, re-blit once, self-halt.
				// A [still] effect re-arms the loop.
				if (l.paused || l.reducedMotion) {
					blit();
					running = false;
					lastTimestamp = -1;
					return;
				}

				accumulatedTime += Math.min(dt, 0.05);
				drainInjections();
				const iters = Math.max(1, Math.round(l.growthSpeed));
				runReactions(iters);
				blit();
				animationFrameId.current = requestAnimationFrame(update);
			}

			function startLoop() {
				if (running) return;
				running = true;
				lastTimestamp = -1;
				animationFrameId.current = requestAnimationFrame(update);
			}
			startLoopRef.current = startLoop;

			// Re-size canvas + grid. The grid only changes when aspect changes;
			// resizing an FBO clears it, so re-seed the field after a real change.
			function resize(): boolean {
				const { clientWidth, clientHeight } = container;
				if (clientWidth === 0 || clientHeight === 0) return false;
				renderer.setSize(clientWidth, clientHeight);
				const bw = gl!.drawingBufferWidth;
				const bh = gl!.drawingBufferHeight;
				const s = gridDims(SIM_BASE, bw, bh);
				if (s.w === simW && s.h === simH) return false;
				simW = s.w;
				simH = s.h;
				simTexel[0] = 1 / simW;
				simTexel[1] = 1 / simH;
				state.setSize(simW, simH);
				return true;
			}

			// A resize clears the field; re-init + re-seed + (if halted) warm-up so a
			// paused canvas repaints a bloom, then re-arm — the loop self-halts again
			// if still paused (it draws one corrected frame first).
			const resizeObserver = new ResizeObserver(() => {
				const changed = resize();
				if (changed) {
					initState();
					seedField();
					if (live.current.paused || live.current.reducedMotion) warmUp(900);
					blit();
				}
				startLoopRef.current?.();
			});
			resizeObserver.observe(container);
			resize();

			// Initial state: seed, then either run or bake-and-halt.
			initState();
			seedField();
			if (live.current.paused || live.current.reducedMotion) {
				// Grow a developed bloom up front so the still stage reads as alive.
				warmUp(1100);
				blit();
			} else {
				// Warm up to a developed bloom so the opening frame reads as living
				// tendrils rather than scattered seeds — the loop grows on from here.
				warmUp(600);
				startLoop();
			}

			// Pointer-drag stir — grab on the canvas, track on window (SmokeField
			// idiom). Ignored while paused / reduced-motion (sim is frozen).
			const canvas = gl.canvas as HTMLCanvasElement;
			let dragging = false;

			function pushSplat(e: PointerEvent) {
				const rect = canvas.getBoundingClientRect();
				if (rect.width === 0 || rect.height === 0) return;
				const l = live.current;
				const x = (e.clientX - rect.left) / rect.width;
				const y = 1 - (e.clientY - rect.top) / rect.height;
				pointerSplats.push({
					x,
					y,
					radius: Math.max(0.012, l.seedRadius),
					amount: Math.max(0.2, l.brushStrength),
				});
			}

			function onPointerDown(e: PointerEvent) {
				const l = live.current;
				if (l.paused || l.reducedMotion) return;
				if (e.pointerType === "mouse" && e.button !== 0) return;
				e.preventDefault();
				dragging = true;
				pushSplat(e);
				try {
					canvas.setPointerCapture(e.pointerId);
				} catch {
					// setPointerCapture can throw if the pointer is already gone.
				}
				startLoop();
			}
			function onPointerMove(e: PointerEvent) {
				if (!dragging) return;
				pushSplat(e);
			}
			function onPointerUp(e: PointerEvent) {
				if (!dragging) return;
				dragging = false;
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
				if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
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
				"ShadowBloom: WebGL2 init failed, falling back to static image",
				err,
			);
			if (gl) {
				if (container.contains(gl.canvas)) container.removeChild(gl.canvas);
				gl.getExtension("WEBGL_lose_context")?.loseContext();
			}
			setUseFallback(true);
			return;
		}
		// Nothing live-tuned rebuilds GL; only the fallback flag re-runs this effect.
	}, [useFallback]);

	// Resume the loop when unpausing — it self-halts once the pause settles.
	useEffect(() => {
		if (!(paused || reducedMotion)) startLoopRef.current?.();
	}, [paused, reducedMotion]);

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
		// No poster — a static amethyst-tendril radial so the stage is never blank.
		return (
			<div
				aria-hidden
				className={className ? `${baseClass} ${className}` : baseClass}
				style={{
					background:
						"radial-gradient(90% 90% at 42% 40%, rgba(168,85,247,0.34) 0%, rgba(126,58,206,0.16) 26%, rgba(20,8,32,0.7) 52%, #07030d 78%), radial-gradient(70% 70% at 66% 68%, rgba(168,85,247,0.22) 0%, rgba(20,8,32,0.0) 46%)",
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

export default ShadowBloom;
