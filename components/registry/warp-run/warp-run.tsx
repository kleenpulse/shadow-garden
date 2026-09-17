"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Geometry, Triangle } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A hyperspace run: streaks flying past the cockpit, each one a thin QUAD
// whose tail stretches with apparent velocity — real motion blur in the
// primitive, not a sprite faking it. Points cannot elongate along their
// motion and GL lines cannot be wider than a pixel or softer than a step, so
// every streak is four vertices: a hot core, soft edges, a tail that dies.
//
// Behind the streaks a backdrop pass paints the tunnel itself — a bloom at
// the vanishing point (where all the light is coming from) and a faint
// nebula streaming outward — so the run has walls rather than a black void
// with scratches on it.
//
// Interaction split, house style: hover STEERS (the pointer drags the
// vanishing point), drag BANKS (roll that springs back once released).
// Sharing one gesture would make every course correction also rock the ship.
//
// Star positions are pure functions of seed + distance flown — the CPU
// uploads nothing per frame but uniforms. Recycle happens inside fract(), so
// there is no wrap bookkeeping and no pop at the far plane beyond an alpha
// ramp that hides it.
export interface WarpRunProps {
	/** Streak count, as discrete steps. */
	density?: "150" | "300" | "400" | "700";
	/** Cruising streak color. */
	streakColor?: string;
	/** Fast-streak burn color. */
	accentColor?: string;
	/** Tunnel void. */
	backgroundColor?: string;
	/** Forward throttle. */
	speed?: number;
	/** Motion-blur stretch per streak. */
	streakLength?: number;
	/** How hard the pointer bends the tunnel. */
	steer?: number;
	/** Bank (roll) while orbit-dragging. */
	rollOnDrag?: boolean;
	/** Halt the loop. Mid-flight freeze. */
	paused?: boolean;
	/** Settles the scene: one static frame of streaks. */
	reducedMotion?: boolean;
	className?: string;
}

export type WarpDensity = NonNullable<WarpRunProps["density"]>;

const COUNTS: Record<string, number> = {
	"150": 150,
	"300": 300,
	"400": 400,
	"700": 700,
};

const hexToRgb01 = (hex: string): [number, number, number] => {
	const h = hex.replace("#", "");
	const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
	const n = parseInt(full, 16);
	if (Number.isNaN(n) || full.length !== 6) return [1, 1, 1];
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

// Distance flown wraps here. Every star's velocity factor is a multiple of
// 0.1, so 10 × factor is a whole number and fract() lands exactly where it
// left off — the wrap is invisible. (Wrapping a raw clock would teleport
// every star whose factor is not an integer.)
const DIST_WRAP = 10;

function buildStars(n: number): {
	aPoint: Float32Array;
	aCorner: Float32Array;
	index: Uint16Array;
} {
	// Four vertices per streak: head/tail × left/right. All four share the
	// seed; the vertex shader separates head from tail along z by apparent
	// velocity and pushes left/right apart across the streak's screen normal.
	const aPoint = new Float32Array(n * 4 * 4);
	const aCorner = new Float32Array(n * 4 * 2);
	const index = new Uint16Array(n * 6);
	for (let i = 0; i < n; i++) {
		// Disc distribution, biased outward: an empty core reads as a hole, a
		// dense core occludes everything behind it.
		const a = Math.random() * Math.PI * 2;
		const r = 0.18 + Math.sqrt(Math.random()) * 1.5;
		const x = Math.cos(a) * r;
		const y = Math.sin(a) * r;
		const z = Math.random();
		// Seven velocity classes, 0.7 … 1.3 — quantised so DIST_WRAP is exact.
		const sf = 0.7 + Math.round(Math.random() * 6) * 0.1;
		for (let v = 0; v < 4; v++) {
			const j = (i * 4 + v) * 4;
			aPoint[j] = x;
			aPoint[j + 1] = y;
			aPoint[j + 2] = z;
			aPoint[j + 3] = sf;
			aCorner[(i * 4 + v) * 2] = v >> 1;
			aCorner[(i * 4 + v) * 2 + 1] = (v & 1) * 2 - 1;
		}
		const b = i * 4;
		const k = i * 6;
		index[k] = b;
		index[k + 1] = b + 1;
		index[k + 2] = b + 2;
		index[k + 3] = b + 2;
		index[k + 4] = b + 1;
		index[k + 5] = b + 3;
	}
	return { aPoint, aCorner, index };
}

const vert = `#version 300 es
in vec4 aPoint;
in vec2 aCorner;
uniform float uDist;
uniform float uSpeed;
uniform float uStreak;
uniform float uZoom;
uniform float uAspect;
uniform float uPx;
uniform float uRoll;
uniform vec2 uSteer;
uniform vec2 uPointer;
out float vFade;
out float vFast;
out float vAlong;
out float vSide;
out float vBright;

vec2 project(vec2 p, float z) {
  // Isotropic screen units (height = 2); x is divided by aspect at the end,
  // after the width has been applied, so a streak's thickness is the same on
  // screen whichever way it points.
  float persp = 1.0 / max(z, 0.05);
  return p * persp * 1.6 * uZoom;
}

void main() {
  // Depth cycles 0 (far) -> 1 (near). fract() IS the recycle.
  float depth = fract(aPoint.z + uDist * aPoint.w);
  float zNear = 0.55;
  float zFar = 13.0;
  float z = mix(zFar, zNear, depth);

  // Tail lags the head by an amount that GROWS as the star approaches: closer
  // stars have more apparent velocity, so longer tails are what sell the
  // acceleration.
  float len = uStreak * (0.3 + depth * 1.6);

  vec2 p = aPoint.xy;

  // Steering: the whole tunnel shears opposite the pointer, scaled by depth,
  // so distant streaks converge on the cursor exactly like a camera yawing.
  p -= uPointer * depth * 1.15;

  // Bank rolls the frame about the view axis.
  float cr = cos(uRoll), sr = sin(uRoll);
  p = vec2(p.x * cr - p.y * sr, p.x * sr + p.y * cr);

  vec2 head = project(p, z);
  vec2 tail = project(p, z + len);
  vec2 dir = head - tail;
  float L = length(dir);
  dir = L > 1e-5 ? dir / L : vec2(0.0, 1.0);
  vec2 nrm = vec2(-dir.y, dir.x);

  // Width: a thread far away, a bar up close — but never under a pixel and a
  // half, or the far field aliases into dust.
  float w = max(uPx * 1.5, 0.003 + depth * depth * 0.024);
  vec2 pos = mix(head, tail, aCorner.x) + nrm * aCorner.y * w * 0.5;
  pos.x /= uAspect;
  pos += uSteer * 0.22;
  gl_Position = vec4(pos, 0.0, 1.0);

  vAlong = aCorner.x;
  vSide = aCorner.y;

  // Alpha ramps hide both ends of the cycle: birth pops otherwise, and the
  // fly-past clip at the near plane otherwise reads as a glitch.
  float born = smoothstep(0.0, 0.10, depth);
  float died = 1.0 - smoothstep(0.86, 1.0, depth);
  vFade = born * died;
  // Far stars are dim; each star also carries its own magnitude so the field
  // is not seven hundred identical bulbs.
  float mag = fract(sin(aPoint.z * 91.7 + aPoint.x * 13.3) * 43758.5453);
  vBright = mix(0.3, 1.0, depth) * (0.55 + 0.45 * mag);
  // Velocity readout: only stars genuinely running hot earn the accent.
  vFast = clamp((uSpeed * aPoint.w - 0.95) * 1.4, 0.0, 1.0);
}`;

const frag = `#version 300 es
precision highp float;
in float vFade;
in float vFast;
in float vAlong;
in float vSide;
in float vBright;
out vec4 fragColor;
uniform vec3 uStreakCol;
uniform vec3 uAccent;
void main() {
  // Across: soft edges, a hot core. Along: head bright, tail dying. The core
  // goes toward white — a bright enough light source burns out its own hue.
  float across = 1.0 - vSide * vSide;
  float along = pow(1.0 - vAlong, 1.6);
  float core = pow(across, 4.0) * (1.0 - vAlong);
  vec3 col = mix(uStreakCol, uAccent, vFast);
  col = mix(col, vec3(1.0), core * 0.55);
  float a = min(1.0, across * across * along * vFade * vBright * 1.5);
  fragColor = vec4(col, a);
}`;

const backVert = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }`;

const backFrag = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec3 uBg;
uniform vec3 uStreakCol;
uniform vec3 uAccent;
uniform vec2 uCenter;
uniform float uAspect;
uniform float uGlow;
uniform float uFlow;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1, 0)), u.x),
    mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x),
    u.y);
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  vec2 d = (uv - uCenter) * vec2(uAspect, 1.0);
  float r = length(d);
  vec3 col = uBg;

  // Nebula in polar coordinates, log-radial so it streams OUT of the
  // vanishing point at the same perspective rate as the stars — the tunnel
  // wall going by, not a texture pasted on the glass.
  float ang = atan(d.y, d.x);
  vec2 nq = vec2(ang * 1.6, log(r + 0.04) * 2.2 - uFlow);
  float neb = vnoise(nq) * 0.6 + vnoise(nq * 2.3 + 7.1) * 0.4;
  neb = smoothstep(0.35, 0.95, neb) * smoothstep(0.0, 0.45, r);
  col += mix(uAccent, uStreakCol, 0.5) * neb * 0.07 * uGlow;

  // Bloom at the vanishing point: a tight core and a wide skirt.
  float core = exp(-r * r * 60.0) * 0.6 + exp(-r * 5.0) * 0.1;
  col += mix(uStreakCol, uAccent, 0.45) * core * uGlow;

  // Vignette: the cockpit frame the eye expects at the edges of a run.
  col *= 1.0 - 0.3 * smoothstep(0.6, 1.5, length(uv * vec2(uAspect, 1.0)));

  // Dither: eight-bit output bands a dark bloom into rings.
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(col, 1.0);
}`;

const WarpRun = memo(
	({
		density = "700",
		streakColor = "#e9d5ff",
		accentColor = "#67e8f9",
		backgroundColor = "#030308",
		speed = 0.2,
		streakLength = 0.1,
		steer = 0.6,
		rollOnDrag = true,
		paused = false,
		reducedMotion = false,
		className,
	}: WarpRunProps) => {
		const containerRef = useRef<HTMLDivElement>(null);
		const drawRef = useRef<((dt: number) => void | false) | null>(null);
		const measureRef = useRef<((m: Metrics) => void) | null>(null);
		const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(
			null,
		);
		// Roll state in a ref, written from the loop — never React state.
		const roll = useRef({ value: 0, dragging: false, lastX: 0 });
		const pointer = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
		const [fallback, setFallback] = useState(false);
		const pausedRef = useRef(paused);
		pausedRef.current = paused;

		const loop = useAnimationLoop({
			target: containerRef,
			halted: paused,
			dpr: "auto",
			onResize: (metrics) => measureRef.current?.(metrics),
			onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
			gl: () => glRef.current,
		});

		const live = useRef({
			streakColor, accentColor, backgroundColor,
			speed, streakLength, steer, rollOnDrag, reducedMotion,
		});
		live.current = {
			streakColor, accentColor, backgroundColor,
			speed, streakLength, steer, rollOnDrag, reducedMotion,
		};

		useEffect(() => {
			const container = containerRef.current;
			if (fallback || !container) return;

			let renderer: Renderer;
			try {
				renderer = new Renderer({
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

			const n = COUNTS[density] ?? 400;
			const { aPoint, aCorner, index } = buildStars(n);
			const geometry = new Geometry(glc, {
				aPoint: { size: 4, data: aPoint },
				aCorner: { size: 2, data: aCorner },
				index: { data: index },
			});

			const program = new Program(glc, {
				vertex: vert,
				fragment: frag,
				transparent: true,
				cullFace: false,
				depthTest: false,
				depthWrite: false,
				uniforms: {
					uStreakCol: { value: new Float32Array(hexToRgb01(streakColor)) },
					uAccent: { value: new Float32Array(hexToRgb01(accentColor)) },
					uDist: { value: 0 },
					uSpeed: { value: speed },
					uStreak: { value: streakLength },
					uZoom: { value: 1 },
					uAspect: { value: 1 },
					uPx: { value: 2 / 600 },
					uRoll: { value: 0 },
					uSteer: { value: new Float32Array([0, 0]) },
					uPointer: { value: new Float32Array([0, 0]) },
				},
			});
			// Additive: overlapping streaks brighten toward the centre of the run,
			// which is where the eye should already be.
			program.setBlendFunc(glc.SRC_ALPHA, glc.ONE);
			const mesh = new Mesh(glc, { geometry, program });
			const u = program.uniforms as Record<string, { value: unknown }>;

			const backProgram = new Program(glc, {
				vertex: backVert,
				fragment: backFrag,
				cullFace: false,
				depthTest: false,
				depthWrite: false,
				uniforms: {
					uBg: { value: new Float32Array(hexToRgb01(backgroundColor)) },
					uStreakCol: { value: new Float32Array(hexToRgb01(streakColor)) },
					uAccent: { value: new Float32Array(hexToRgb01(accentColor)) },
					uCenter: { value: new Float32Array([0, 0]) },
					uAspect: { value: 1 },
					uGlow: { value: 1 },
					uFlow: { value: 0 },
				},
			});
			const back = new Mesh(glc, {
				geometry: new Triangle(glc),
				program: backProgram,
			});
			const ub = backProgram.uniforms as Record<string, { value: unknown }>;

			// Distance flown, not a clock: integrating speed per frame means a
			// throttle change accelerates the field instead of teleporting it.
			let dist = 0;
			let flow = 0;

			drawRef.current = (dt) => {
				const l = live.current;
				const step = Math.min(dt, 1 / 30);
				const still = pausedRef.current || l.reducedMotion;

				if (!still) {
					dist = (dist + step * l.speed * 0.09) % DIST_WRAP;
					flow = (flow + step * l.speed * 0.35) % 1000;
					if (!roll.current.dragging) {
						// The bank unwinds on its own: a hero shot self-levels rather than
						// leaving the visitor cocked forty degrees.
						roll.current.value *= Math.pow(0.02, step);
					}
					const ease = Math.min(1, step * 4.5);
					pointer.current.x += (pointer.current.tx - pointer.current.x) * ease;
					pointer.current.y += (pointer.current.ty - pointer.current.y) * ease;
				}

				const steerOn = l.reducedMotion ? 0 : l.steer;
				const sx = pointer.current.x * steerOn;
				const sy = pointer.current.y * steerOn;
				((u.uStreakCol as { value: Float32Array }).value).set(hexToRgb01(l.streakColor));
				((u.uAccent as { value: Float32Array }).value).set(hexToRgb01(l.accentColor));
				(u.uDist as { value: number }).value = dist;
				(u.uSpeed as { value: number }).value = l.speed;
				(u.uStreak as { value: number }).value = l.streakLength;
				(u.uRoll as { value: number }).value =
					l.rollOnDrag ? roll.current.value : 0;
				// Shift and shear ride the same eased pointer — the raw target on one
				// and the eased value on the other had them disagree mid-ease.
				const sv = u.uSteer.value as Float32Array;
				sv[0] = sx;
				sv[1] = sy;
				const pv = u.uPointer.value as Float32Array;
				pv[0] = sx;
				pv[1] = sy;

				((ub.uBg as { value: Float32Array }).value).set(hexToRgb01(l.backgroundColor));
				((ub.uStreakCol as { value: Float32Array }).value).set(hexToRgb01(l.streakColor));
				((ub.uAccent as { value: Float32Array }).value).set(hexToRgb01(l.accentColor));
				const cv = ub.uCenter.value as Float32Array;
				cv[0] = sx * 0.22;
				cv[1] = sy * 0.22;
				(ub.uGlow as { value: number }).value = Math.min(1.6, 0.6 + l.speed * 0.4);
				(ub.uFlow as { value: number }).value = flow;

				const bg = hexToRgb01(l.backgroundColor);
				glc.clearColor(bg[0], bg[1], bg[2], 1);
				renderer.render({ scene: back });
				renderer.render({ scene: mesh, clear: false });
			};

			measureRef.current = ({ width, height, dpr }: Metrics) => {
				renderer.dpr = dpr;
				renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
				const aspect = Math.max(width, 1) / Math.max(height, 1);
				(u.uAspect as { value: number }).value = aspect;
				(ub.uAspect as { value: number }).value = aspect;
				(u.uPx as { value: number }).value = 2 / Math.max(height * dpr, 1);
				drawRef.current?.(0.016);
			};

			loop.resize();
			loop.start();

			return () => {
				drawRef.current = null;
				measureRef.current = null;
				if (container.contains(canvas)) container.removeChild(canvas);
			};
			// Rebuilds on a density change only — the enum reallocates the quad
			// buffer; every other prop flows through uniforms above.
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [fallback, density]);

		useEffect(() => {
			loop.paint();
		}, [
			streakColor, accentColor, backgroundColor, speed,
			streakLength, steer, rollOnDrag, loop,
		]);

		const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
			roll.current.dragging = true;
			roll.current.lastX = e.clientX;
			e.currentTarget.setPointerCapture(e.pointerId);
			loop.start();
		};

		const track = (e: React.PointerEvent<HTMLDivElement>) => {
			const r = e.currentTarget.getBoundingClientRect();
			if (r.width === 0 || r.height === 0) return;
			pointer.current.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
			pointer.current.ty = -(((e.clientY - r.top) / r.height) * 2 - 1);

			if (!roll.current.dragging) return;
			const dx = e.clientX - roll.current.lastX;
			roll.current.lastX = e.clientX;
			// Bank INTO the drag: pull left, the horizon tips left, like weight
			// shifting rather than a picture being turned.
			if (live.current.rollOnDrag && !pausedRef.current) {
				roll.current.value = Math.max(
					-0.55,
					Math.min(0.55, roll.current.value - dx * 0.003),
				);
			}
			loop.start();
		};

		const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
			if (e.currentTarget.hasPointerCapture(e.pointerId)) {
				e.currentTarget.releasePointerCapture(e.pointerId);
			}
			roll.current.dragging = false;
			loop.start();
		};

		// The tunnel recentres once the cursor is gone; a run left steered
		// toward wherever the pointer last exited reads as a stuck rudder.
		const leave = () => {
			if (roll.current.dragging) return;
			pointer.current.tx = 0;
			pointer.current.ty = 0;
			loop.start();
		};

		if (fallback) {
			return (
				<div
					className={className ?? "relative h-full w-full overflow-hidden"}
					style={{
						backgroundColor,
						backgroundImage: `radial-gradient(circle at 50% 50%, ${accentColor}33 0%, transparent 40%), radial-gradient(circle at 50% 50%, ${streakColor}22 0%, transparent 70%)`,
					}}
				/>
			);
		}

		return (
			<div
				ref={containerRef}
				className={
					className ??
					"relative h-full w-full cursor-default overflow-hidden [&_canvas]:touch-none select-none"
				}
				onPointerDown={onPointerDown}
				onPointerMove={track}
				onPointerUp={endDrag}
				onPointerLeave={leave}
				onPointerCancel={endDrag}
			/>
		);
	},
);

WarpRun.displayName = "WarpRun";

export default WarpRun;
