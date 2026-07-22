"use client";

// SMOKE FIELD — a real-time Stam stable-fluids GPU solver. Velocity, pressure
// and dye live on floating-point RenderTargets and are advected semi-Lagrangian
// on the GPU: curl / vorticity confinement, a Jacobi pressure projection that
// makes the field divergence-free, buoyancy, and back-traced advection. An auto
// plume rises from the base; a pointer drag stirs the smoke. The sim runs on a
// fixed grid decoupled from canvas DPR — only the final display pass runs at
// screen resolution. Capability-probe / pause / resize skeleton mirrors
// BlackHole.tsx (WebGL2 + EXT_color_buffer_float float FBOs, live-ref, self-halt,
// resize re-arm, static fallback).

import React, { useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle, RenderTarget } from "ogl";

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

interface SmokeFieldProps {
	dyeColor?: string;
	backgroundColor?: string;
	quality?: Quality;
	pressureIterations?: number;
	velocityFade?: number;
	densityFade?: number;
	curl?: number;
	splatRadius?: number;
	splatForce?: number;
	autoPlume?: boolean;
	buoyancy?: number;
	exposure?: number;
	grain?: number;
	/** Freeze the fields and halt the loop (scrolled past / reduced motion). */
	paused?: boolean;
	/** OS reduced-motion: bake a still plume, halt, and ignore pointer input. */
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

// ω = ∂Vy/∂x − ∂Vx/∂y, packed into .x.
const CURL_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform vec2 texelSize;
void main() {
	float L = texture(uVelocity, vUv - vec2(texelSize.x, 0.0)).y;
	float R = texture(uVelocity, vUv + vec2(texelSize.x, 0.0)).y;
	float T = texture(uVelocity, vUv + vec2(0.0, texelSize.y)).x;
	float B = texture(uVelocity, vUv - vec2(0.0, texelSize.y)).x;
	float vort = R - L - T + B;
	fragColor = vec4(0.5 * vort, 0.0, 0.0, 1.0);
}
`;

// Vorticity confinement — pushes velocity back toward the curl gradient so the
// smoke keeps its small-scale swirl instead of numerically diffusing away.
const VORT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 texelSize;
uniform float uCurlStrength;
uniform float dt;
void main() {
	float L = texture(uCurl, vUv - vec2(texelSize.x, 0.0)).x;
	float R = texture(uCurl, vUv + vec2(texelSize.x, 0.0)).x;
	float T = texture(uCurl, vUv + vec2(0.0, texelSize.y)).x;
	float B = texture(uCurl, vUv - vec2(0.0, texelSize.y)).x;
	float C = texture(uCurl, vUv).x;
	vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
	force /= length(force) + 1e-4;
	force *= uCurlStrength * C;
	force.y *= -1.0;
	vec2 vel = texture(uVelocity, vUv).xy;
	vel += force * dt;
	vel = clamp(vel, -3000.0, 3000.0);
	fragColor = vec4(vel, 0.0, 1.0);
}
`;

// Buoyancy — hot (dye-dense) cells get a +y push, so the plume lifts on its own.
const BUOY_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform sampler2D uDye;
uniform float uBuoyancy;
uniform float dt;
void main() {
	vec2 vel = texture(uVelocity, vUv).xy;
	vec3 d = texture(uDye, vUv).rgb;
	float dens = dot(d, vec3(0.299, 0.587, 0.114));
	vel.y += uBuoyancy * dens * dt;
	fragColor = vec4(vel, 0.0, 1.0);
}
`;

// Additive gaussian splat — injects velocity (color = force.xy) or dye (color = rgb).
const SPLAT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTarget;
uniform float uAspect;
uniform vec3 uColor;
uniform vec2 uPoint;
uniform float uRadius;
void main() {
	vec2 p = vUv - uPoint;
	p.x *= uAspect;
	float rr = uRadius * uRadius;
	vec3 splat = exp(-dot(p, p) / max(rr, 1e-6)) * uColor;
	vec3 base = texture(uTarget, vUv).rgb;
	fragColor = vec4(base + splat, 1.0);
}
`;

// ∇·v with free-slip walls (reflect the boundary-normal component).
const DIV_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform vec2 texelSize;
void main() {
	float L = texture(uVelocity, vUv - vec2(texelSize.x, 0.0)).x;
	float R = texture(uVelocity, vUv + vec2(texelSize.x, 0.0)).x;
	float T = texture(uVelocity, vUv + vec2(0.0, texelSize.y)).y;
	float B = texture(uVelocity, vUv - vec2(0.0, texelSize.y)).y;
	vec2 C = texture(uVelocity, vUv).xy;
	if (vUv.x - texelSize.x < 0.0) L = -C.x;
	if (vUv.x + texelSize.x > 1.0) R = -C.x;
	if (vUv.y + texelSize.y > 1.0) T = -C.y;
	if (vUv.y - texelSize.y < 0.0) B = -C.y;
	float div = 0.5 * (R - L + T - B);
	fragColor = vec4(div, 0.0, 0.0, 1.0);
}
`;

// One Jacobi iteration of ∇²p = ∇·v.
const PRESSURE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 texelSize;
void main() {
	float L = texture(uPressure, vUv - vec2(texelSize.x, 0.0)).x;
	float R = texture(uPressure, vUv + vec2(texelSize.x, 0.0)).x;
	float T = texture(uPressure, vUv + vec2(0.0, texelSize.y)).x;
	float B = texture(uPressure, vUv - vec2(0.0, texelSize.y)).x;
	float div = texture(uDivergence, vUv).x;
	float p = (L + R + B + T - div) * 0.25;
	fragColor = vec4(p, 0.0, 0.0, 1.0);
}
`;

// v -= 0.5·∇p → divergence-free velocity.
const GRAD_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 texelSize;
void main() {
	float L = texture(uPressure, vUv - vec2(texelSize.x, 0.0)).x;
	float R = texture(uPressure, vUv + vec2(texelSize.x, 0.0)).x;
	float T = texture(uPressure, vUv + vec2(0.0, texelSize.y)).x;
	float B = texture(uPressure, vUv - vec2(0.0, texelSize.y)).x;
	vec2 vel = texture(uVelocity, vUv).xy;
	vel -= 0.5 * vec2(R - L, T - B);
	fragColor = vec4(vel, 0.0, 1.0);
}
`;

// Semi-Lagrangian advection: sample the source one back-traced step upstream.
const ADVECT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float dt;
uniform float uDissipation;
void main() {
	vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
	vec4 result = texture(uSource, coord);
	fragColor = uDissipation * result;
}
`;

// Composite: exposure, filmic tone over the background, animated grain.
const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uDye;
uniform vec3 uBg;
uniform float uExposure;
uniform float uGrain;
uniform float uTime;
float hash(vec2 p) {
	return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
	vec3 dye = texture(uDye, vUv).rgb;
	vec3 hdr = uBg + dye * uExposure;
	vec3 col = vec3(1.0) - exp(-hdr);
	float g = hash(gl_FragCoord.xy + fract(uTime * 13.7) * 97.0) - 0.5;
	col += g * uGrain * (1.0 - 0.6 * dot(col, vec3(0.333)));
	fragColor = vec4(max(col, 0.0), 1.0);
}
`;

// Fixed simulation timestep — the semi-Lagrangian solver is unconditionally
// stable, so a constant dt keeps the look consistent across frame rates.
const SIM_DT = 0.016;
// Per-frame plume injection force (auto plume). Tuned by feel, not physics.
const PLUME_FORCE = 700;
// Pointer-drag force scale; multiplied by pointer delta and splatForce.
const DRAG_FORCE = 6000;
// Buoyancy scale — maps the 0..3 control onto a usable +y acceleration.
const BUOY_SCALE = 4500;

function resolutionFor(quality: Quality): { sim: number; dye: number } {
	if (quality === "low") return { sim: 128, dye: 256 };
	if (quality === "high") return { sim: 256, dye: 1024 };
	return { sim: 192, dye: 512 };
}

// Aspect-correct FBO dimensions so the sim grid matches the canvas shape.
function gridDims(res: number, bw: number, bh: number): { w: number; h: number } {
	let aspect = bw / Math.max(bh, 1);
	if (aspect < 1) aspect = 1 / aspect;
	const min = Math.max(1, Math.round(res));
	const max = Math.max(1, Math.round(res * aspect));
	return bw > bh ? { w: max, h: min } : { w: min, h: max };
}

const SmokeField: React.FC<SmokeFieldProps> = ({
	dyeColor = "#a855f7",
	backgroundColor = "#05010a",
	quality = "medium",
	pressureIterations = 25,
	velocityFade = 0.98,
	densityFade = 0.97,
	curl = 20,
	splatRadius = 0.2,
	splatForce = 1,
	autoPlume = true,
	buoyancy = 1,
	exposure = 1.2,
	grain = 0.04,
	paused = false,
	reducedMotion = false,
	fallbackSrc,
	className,
}) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const animationFrameId = useRef<number>(0);
	const startLoopRef = useRef<(() => void) | null>(null);

	// Live-tunable values read each frame — the GL context is never rebuilt while
	// a control is dragged (BlackHole idiom). Only `quality` (resolution) rebuilds.
	const live = useRef({
		dyeColor,
		backgroundColor,
		pressureIterations,
		velocityFade,
		densityFade,
		curl,
		splatRadius,
		splatForce,
		autoPlume,
		buoyancy,
		exposure,
		grain,
		paused,
		reducedMotion,
	});
	live.current = {
		dyeColor,
		backgroundColor,
		pressureIterations,
		velocityFade,
		densityFade,
		curl,
		splatRadius,
		splatForce,
		autoPlume,
		buoyancy,
		exposure,
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
				throw new Error("SmokeField requires a WebGL2 context");
			}
			gl.clearColor(0, 0, 0, 1);
			container.appendChild(gl.canvas);

			const glc = renderer.gl;
			const gl2 = glc as unknown as WebGL2RenderingContext;
			// Float render targets + linear filtering for bilinear advection.
			const colorFloat = gl2.getExtension("EXT_color_buffer_float");
			gl2.getExtension("OES_texture_float_linear");
			if (!colorFloat) {
				throw new Error("SmokeField requires EXT_color_buffer_float");
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

			// Establish the drawing buffer before sizing the grids.
			renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
			const base = resolutionFor(quality);
			let simDim = gridDims(base.sim, gl.drawingBufferWidth, gl.drawingBufferHeight);
			let dyeDim = gridDims(base.dye, gl.drawingBufferWidth, gl.drawingBufferHeight);
			let simW = simDim.w;
			let simH = simDim.h;
			let dyeW = dyeDim.w;
			let dyeH = dyeDim.h;

			// Shared texel size for every sim-resolution pass (updated in place on
			// resize so all programs referencing it stay correct).
			const simTexel = new Float32Array([1 / simW, 1 / simH]);

			const velocity = makeDouble(simW, simH);
			const dye = makeDouble(dyeW, dyeH);
			const pressure = makeDouble(simW, simH);
			const divergenceRT = makeRT(simW, simH);
			const curlRT = makeRT(simW, simH);

			const geometry = new Triangle(gl);
			const mkProgram = (fragment: string, uniforms: Record<string, { value: unknown }>) =>
				new Program(gl!, { vertex: VERT, fragment, uniforms });

			const curlProgram = mkProgram(CURL_FRAG, {
				uVelocity: { value: velocity.read.texture },
				texelSize: { value: simTexel },
			});
			const vortProgram = mkProgram(VORT_FRAG, {
				uVelocity: { value: velocity.read.texture },
				uCurl: { value: curlRT.texture },
				texelSize: { value: simTexel },
				uCurlStrength: { value: curl },
				dt: { value: SIM_DT },
			});
			const buoyProgram = mkProgram(BUOY_FRAG, {
				uVelocity: { value: velocity.read.texture },
				uDye: { value: dye.read.texture },
				uBuoyancy: { value: buoyancy * BUOY_SCALE },
				dt: { value: SIM_DT },
			});
			const splatProgram = mkProgram(SPLAT_FRAG, {
				uTarget: { value: velocity.read.texture },
				uAspect: { value: simW / simH },
				uColor: { value: new Float32Array([0, 0, 0]) },
				uPoint: { value: new Float32Array([0.5, 0.5]) },
				uRadius: { value: 0.1 },
			});
			const divProgram = mkProgram(DIV_FRAG, {
				uVelocity: { value: velocity.read.texture },
				texelSize: { value: simTexel },
			});
			const pressProgram = mkProgram(PRESSURE_FRAG, {
				uPressure: { value: pressure.read.texture },
				uDivergence: { value: divergenceRT.texture },
				texelSize: { value: simTexel },
			});
			const gradProgram = mkProgram(GRAD_FRAG, {
				uPressure: { value: pressure.read.texture },
				uVelocity: { value: velocity.read.texture },
				texelSize: { value: simTexel },
			});
			const advProgram = mkProgram(ADVECT_FRAG, {
				uVelocity: { value: velocity.read.texture },
				uSource: { value: velocity.read.texture },
				texelSize: { value: simTexel },
				dt: { value: SIM_DT },
				uDissipation: { value: velocityFade },
			});
			const dispProgram = mkProgram(DISPLAY_FRAG, {
				uDye: { value: dye.read.texture },
				uBg: { value: new Float32Array(hexToRgb01(backgroundColor)) },
				uExposure: { value: exposure },
				uGrain: { value: grain },
				uTime: { value: 0 },
			});
			if (!gl.getProgramParameter(dispProgram.program, gl.LINK_STATUS)) {
				throw new Error("SmokeField display shader failed to link");
			}

			const curlMesh = new Mesh(gl, { geometry, program: curlProgram });
			const vortMesh = new Mesh(gl, { geometry, program: vortProgram });
			const buoyMesh = new Mesh(gl, { geometry, program: buoyProgram });
			const splatMesh = new Mesh(gl, { geometry, program: splatProgram });
			const divMesh = new Mesh(gl, { geometry, program: divProgram });
			const pressMesh = new Mesh(gl, { geometry, program: pressProgram });
			const gradMesh = new Mesh(gl, { geometry, program: gradProgram });
			const advMesh = new Mesh(gl, { geometry, program: advProgram });
			const dispMesh = new Mesh(gl, { geometry, program: dispProgram });

			let accumulatedTime = 0;

			// One additive gaussian splat: velocity (force.xy) then dye (rgb).
			function splat(
				x: number,
				y: number,
				fx: number,
				fy: number,
				rgb: [number, number, number],
				radius: number,
			) {
				splatProgram.uniforms.uAspect.value = simW / simH;
				splatProgram.uniforms.uRadius.value = radius;
				const point = splatProgram.uniforms.uPoint.value as Float32Array;
				point[0] = x;
				point[1] = y;
				const color = splatProgram.uniforms.uColor.value as Float32Array;

				splatProgram.uniforms.uTarget.value = velocity.read.texture;
				color[0] = fx;
				color[1] = fy;
				color[2] = 0;
				renderer.render({ scene: splatMesh, target: velocity.write });
				velocity.swap();

				splatProgram.uniforms.uTarget.value = dye.read.texture;
				color[0] = rgb[0];
				color[1] = rgb[1];
				color[2] = rgb[2];
				renderer.render({ scene: splatMesh, target: dye.write });
				dye.swap();
			}

			// Full solver step. injectFn runs at pass 3 (splats), then buoyancy.
			function step(injectFn: () => void) {
				const l = live.current;

				// 1) curl  2) vorticity confinement → velocity
				if (l.curl > 0) {
					curlProgram.uniforms.uVelocity.value = velocity.read.texture;
					renderer.render({ scene: curlMesh, target: curlRT });

					vortProgram.uniforms.uVelocity.value = velocity.read.texture;
					vortProgram.uniforms.uCurl.value = curlRT.texture;
					vortProgram.uniforms.uCurlStrength.value = l.curl;
					vortProgram.uniforms.dt.value = SIM_DT;
					renderer.render({ scene: vortMesh, target: velocity.write });
					velocity.swap();
				}

				// 3) inject splats + buoyancy → velocity
				injectFn();

				buoyProgram.uniforms.uVelocity.value = velocity.read.texture;
				buoyProgram.uniforms.uDye.value = dye.read.texture;
				buoyProgram.uniforms.uBuoyancy.value = l.buoyancy * BUOY_SCALE;
				buoyProgram.uniforms.dt.value = SIM_DT;
				renderer.render({ scene: buoyMesh, target: velocity.write });
				velocity.swap();

				// 4) divergence
				divProgram.uniforms.uVelocity.value = velocity.read.texture;
				renderer.render({ scene: divMesh, target: divergenceRT });

				// 5) Jacobi pressure solve
				const iters = Math.max(1, Math.round(l.pressureIterations));
				for (let i = 0; i < iters; i++) {
					pressProgram.uniforms.uPressure.value = pressure.read.texture;
					pressProgram.uniforms.uDivergence.value = divergenceRT.texture;
					renderer.render({ scene: pressMesh, target: pressure.write });
					pressure.swap();
				}

				// 6) gradient subtract → divergence-free velocity
				gradProgram.uniforms.uPressure.value = pressure.read.texture;
				gradProgram.uniforms.uVelocity.value = velocity.read.texture;
				renderer.render({ scene: gradMesh, target: velocity.write });
				velocity.swap();

				// 7) advect velocity (× velocityFade)
				advProgram.uniforms.uVelocity.value = velocity.read.texture;
				advProgram.uniforms.uSource.value = velocity.read.texture;
				advProgram.uniforms.dt.value = SIM_DT;
				advProgram.uniforms.uDissipation.value = l.velocityFade;
				renderer.render({ scene: advMesh, target: velocity.write });
				velocity.swap();

				// 8) advect dye by the divergence-free velocity (× densityFade)
				advProgram.uniforms.uVelocity.value = velocity.read.texture;
				advProgram.uniforms.uSource.value = dye.read.texture;
				advProgram.uniforms.uDissipation.value = l.densityFade;
				renderer.render({ scene: advMesh, target: dye.write });
				dye.swap();
			}

			// Pointer-drag splats queued from event handlers, drained per frame.
			const pointerSplats: {
				x: number;
				y: number;
				fx: number;
				fy: number;
				rgb: [number, number, number];
				radius: number;
			}[] = [];

			function liveInject() {
				const l = live.current;
				while (pointerSplats.length) {
					const s = pointerSplats.shift()!;
					splat(s.x, s.y, s.fx, s.fy, s.rgb, s.radius);
				}
				if (l.autoPlume) {
					const rgb = hexToRgb01(l.dyeColor);
					// Bounded wander so the plume drifts instead of standing rigid.
					const w =
						Math.sin(accumulatedTime * 1.3) * 0.12 +
						Math.sin(accumulatedTime * 0.7 + 1.0) * 0.06;
					const r = Math.max(0.02, l.splatRadius * 0.35);
					splat(0.5 + w * 0.15, 0.06, w * PLUME_FORCE, PLUME_FORCE, rgb, r);
				}
			}

			// Forced base plume for warm-up (independent of autoPlume) so a halted
			// canvas bakes a still plume rather than an empty box.
			function warmInject() {
				const l = live.current;
				const rgb = hexToRgb01(l.dyeColor);
				const r = Math.max(0.02, l.splatRadius * 0.35);
				splat(0.5, 0.06, 0, PLUME_FORCE, rgb, r);
			}

			function seedPlume() {
				const l = live.current;
				const rgb = hexToRgb01(l.dyeColor);
				splat(0.5, 0.08, 0, PLUME_FORCE * 2, rgb, Math.max(0.03, l.splatRadius * 0.4));
			}

			// Synchronous warm-up: bake a developed still plume before halting.
			function warmUp(frames: number) {
				for (let i = 0; i < frames; i++) {
					accumulatedTime += SIM_DT;
					step(warmInject);
				}
			}

			function blit() {
				const l = live.current;
				dispProgram.uniforms.uDye.value = dye.read.texture;
				const bg = hexToRgb01(l.backgroundColor);
				const bgv = dispProgram.uniforms.uBg.value as Float32Array;
				bgv[0] = bg[0];
				bgv[1] = bg[1];
				bgv[2] = bg[2];
				dispProgram.uniforms.uExposure.value = l.exposure;
				dispProgram.uniforms.uGrain.value = l.grain;
				// Keep uTime bounded so the grain hash never loses float precision.
				dispProgram.uniforms.uTime.value = accumulatedTime % 1000;
				renderer.render({ scene: dispMesh });
			}

			let running = false;
			let lastTimestamp = -1;

			function update(t: number) {
				const l = live.current;
				const dt = lastTimestamp >= 0 ? (t - lastTimestamp) * 0.001 : 0;
				lastTimestamp = t;

				// Paused / reduced-motion: freeze the fields, re-blit the frozen dye
				// once, then self-halt. A [paused] effect re-arms the loop.
				if (l.paused || l.reducedMotion) {
					blit();
					running = false;
					lastTimestamp = -1;
					return;
				}

				accumulatedTime += Math.min(dt, 0.05);
				step(liveInject);
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

			// Re-size canvas + grids. Grid dims change only when aspect changes;
			// resizing an FBO clears it, so re-seed a plume after a real change.
			function resize(): boolean {
				const { clientWidth, clientHeight } = container;
				if (clientWidth === 0 || clientHeight === 0) return false;
				renderer.setSize(clientWidth, clientHeight);
				const bw = gl!.drawingBufferWidth;
				const bh = gl!.drawingBufferHeight;
				const s = gridDims(base.sim, bw, bh);
				const d = gridDims(base.dye, bw, bh);
				if (s.w === simW && s.h === simH && d.w === dyeW && d.h === dyeH) {
					return false;
				}
				simW = s.w;
				simH = s.h;
				dyeW = d.w;
				dyeH = d.h;
				simTexel[0] = 1 / simW;
				simTexel[1] = 1 / simH;
				velocity.setSize(simW, simH);
				pressure.setSize(simW, simH);
				divergenceRT.setSize(simW, simH);
				curlRT.setSize(simW, simH);
				dye.setSize(dyeW, dyeH);
				return true;
			}

			// A resize clears the fluid; re-seed + (if halted) warm-up so a paused
			// canvas repaints a plume, then re-arm — the loop self-halts again if
			// still paused (it draws one corrected frame first).
			const resizeObserver = new ResizeObserver(() => {
				const changed = resize();
				if (changed) {
					seedPlume();
					if (live.current.paused || live.current.reducedMotion) warmUp(48);
					blit();
				}
				startLoopRef.current?.();
			});
			resizeObserver.observe(container);
			resize();

			// Initial state: seed a plume, then either run or bake-and-halt.
			seedPlume();
			if (live.current.paused || live.current.reducedMotion) {
				warmUp(64);
				blit();
			} else {
				startLoop();
			}

			// Pointer-drag stir — grab on the canvas, track on window (BlackHole
			// idiom). Ignored while paused / reduced-motion (sim is frozen).
			const canvas = gl.canvas as HTMLCanvasElement;
			let dragging = false;
			let lastX = 0;
			let lastY = 0;

			function pushSplat(e: PointerEvent, fromMove: boolean) {
				const rect = canvas.getBoundingClientRect();
				if (rect.width === 0 || rect.height === 0) return;
				const l = live.current;
				const x = (e.clientX - rect.left) / rect.width;
				const y = 1 - (e.clientY - rect.top) / rect.height;
				let fx = 0;
				let fy = 0;
				if (fromMove) {
					fx = ((e.clientX - lastX) / rect.width) * DRAG_FORCE * l.splatForce;
					fy = (-(e.clientY - lastY) / rect.height) * DRAG_FORCE * l.splatForce;
				}
				lastX = e.clientX;
				lastY = e.clientY;
				pointerSplats.push({
					x,
					y,
					fx,
					fy,
					rgb: hexToRgb01(l.dyeColor),
					radius: Math.max(0.02, l.splatRadius * 0.4),
				});
			}

			function onPointerDown(e: PointerEvent) {
				const l = live.current;
				if (l.paused || l.reducedMotion) return;
				if (e.pointerType === "mouse" && e.button !== 0) return;
				e.preventDefault();
				dragging = true;
				lastX = e.clientX;
				lastY = e.clientY;
				pushSplat(e, false);
				try {
					canvas.setPointerCapture(e.pointerId);
				} catch {
					// setPointerCapture can throw if the pointer is already gone.
				}
				startLoop();
			}
			function onPointerMove(e: PointerEvent) {
				if (!dragging) return;
				pushSplat(e, true);
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
				"SmokeField: WebGL2 init failed, falling back to static image",
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
		// No poster — a static dark-amethyst radial plume so the stage is never blank.
		return (
			<div
				aria-hidden
				className={className ? `${baseClass} ${className}` : baseClass}
				style={{
					background:
						"radial-gradient(120% 90% at 50% 100%, rgba(168,85,247,0.32) 0%, rgba(126,58,206,0.14) 28%, rgba(20,8,32,0.6) 55%, #05010a 80%)",
				}}
			/>
		);
	}

	return (
		<div
			ref={containerRef}
			className={
				className
					? `${baseClass} [&_canvas]:cursor-grab [&_canvas]:touch-none [&_canvas:active]:cursor-grabbing ${className}`
					: `${baseClass} [&_canvas]:cursor-grab [&_canvas]:touch-none [&_canvas:active]:cursor-grabbing`
			}
		/>
	);
};

export default SmokeField;
