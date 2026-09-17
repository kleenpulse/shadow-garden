"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A synthwave horizon — glowing grid floor streaming underfoot, banded sun,
// twin parallax ridges, a pulse rolling out of the vanishing point — computed
// entirely inside one fragment shader on a fullscreen triangle.
//
// One shader instead of geometry: every element here is either infinitely far
// (sky, sun, ridges) or an analytic plane (the floor), so a ray can reach all
// of them in closed form. No marching, no vertex pipeline, no depth buffer.
//
// The drag moves the CAMERA (rays are rotated, not the world), which flips the
// pointer-delta signs relative to the geometry-convention components: negate
// both, or the horizon fights the hand. Verified against the ascii-engine
// derivation.
export interface GridHorizonProps {
	/** Grid line color. */
	lineColor?: string;
	/** Sun disc color. */
	sunColor?: string;
	/** Horizon haze band. */
	hazeColor?: string;
	/** Sky gradient base. */
	backgroundColor?: string;
	/** How fast the floor streams underfoot. */
	scrollSpeed?: number;
	/** Grid spacing multiplier. */
	gridDensity?: number;
	/** Sun disc angular radius. */
	sunSize?: number;
	/** Haze and ridge-rim strength. */
	horizonGlow?: number;
	/** Let the cursor steer the vanishing point. */
	enableMouseInteraction?: boolean;
	/** Halt the loop. The frame freezes mid-stream. */
	paused?: boolean;
	/** Settles the scene: static frame, no drift. */
	reducedMotion?: boolean;
	className?: string;
}

const hexToRgb01 = (hex: string): [number, number, number] => {
	const h = hex.replace("#", "");
	const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
	const n = parseInt(full, 16);
	if (Number.isNaN(n) || full.length !== 6) return [1, 1, 1];
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const vert = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }`;

const frag = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec3 uLine;
uniform vec3 uSun;
uniform vec3 uHaze;
uniform vec3 uBg;
uniform float uTime;
uniform float uAspect;
uniform float uDensity;
uniform float uScroll;
uniform float uSunSize;
uniform float uHorizonGlow;
uniform float uYaw;
uniform float uPitch;
uniform vec2 uPointer;

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
float fbm(vec2 p) {
  return vnoise(p) * 0.65 + vnoise(p * 2.7 + 13.1) * 0.35;
}

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

vec3 rayDir(vec2 uv) {
  // Camera basis straight from the two orbit angles. Rotating RAYS is the
  // inverse of rotating the world, which is exactly what makes this the
  // camera-side of the sign convention.
  vec3 d = normalize(vec3(uv.x * uAspect, uv.y, -1.15));
  d.yz *= rot(-uPitch);
  d.xz *= rot(-uYaw);
  return d;
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  // Slight lens: corners compress a touch, which keeps the sun from clipping
  // flat against the viewport edge on narrow screens.
  uv *= 1.0 - 0.06 * dot(uv, uv) * 0.5;
  vec3 rd = rayDir(uv);
  vec3 ro = vec3(0.0, 0.55, 0.0);
  float elev = asin(clamp(rd.y, -1.0, 1.0));
  float az = atan(rd.x, -rd.z);

  // Sun. Pinned in the WORLD: the rays already carry the camera rotation, so
  // the sun direction must NOT be rotated again — rotating both by the same
  // angles leaves their dot product unchanged, which glued the disc to the
  // glass while the ridges swung past it. Its elevation rides on its radius:
  // the bottom edge always sits at 0.14 rad, level with the ridge tops
  // (typically 0.06–0.14), so the disc rests on the skyline whatever size it
  // is tuned to. A touch right of centre, so it shares the frame with a
  // bottom-left copy block instead of sitting under the headline.
  float sunR = max(uSunSize, 0.02);
  float sunElev = 0.14 + sunR;
  vec3 sunDir = vec3(sin(0.3) * cos(sunElev), sin(sunElev), -cos(0.3) * cos(sunElev));
  float ang = dot(rd, sunDir);
  float theta = acos(clamp(ang, -1.0, 1.0));

  // Sky in three layers rather than one ramp. A cool zenith falling into the
  // background colour; a horizon haze that hugs the skyline and swells on the
  // sun's side (forward scatter); and the sun's bloom — a tight core plus a
  // wide lobe that is strongest low down, where the air is thickest. Together
  // they read as atmosphere lit from behind rather than a gradient with a
  // sticker on it.
  float zenith = smoothstep(-0.05, 0.85, elev);
  vec3 col = uBg * mix(1.3, 0.42, zenith);
  float toward = 0.5 + 0.5 * dot(normalize(rd.xz + 1e-5), normalize(sunDir.xz + 1e-5));
  float haze = exp(-max(elev, 0.0) * 6.0) * (0.45 + 0.55 * toward * toward);
  col += uHaze * haze * uHorizonGlow;
  float bloom = exp(-theta * 9.0) * 0.45
              + exp(-theta * 2.6) * 0.14 * (0.4 + 0.6 * haze);
  col += uSun * bloom * uHorizonGlow;

  // Thin cirrus stretched along the horizon and lit by the sun. A sky with
  // nothing in it reads as a gradient, not as air; kept faint so it stays
  // texture rather than weather.
  float cir = fbm(vec2(az * 2.4 + uTime * 0.008, elev * 11.0 + 5.0));
  cir = smoothstep(0.52, 0.8, cir) * smoothstep(0.02, 0.2, elev)
      * smoothstep(0.75, 0.3, elev);
  col += mix(uHaze, uSun, 0.35 + 0.45 * exp(-theta * 2.0)) * cir * 0.22 * uHorizonGlow;

  // Stars pinned to the SKY, not the screen: cells live on the direction
  // itself (a cube lattice over the unit sphere), so a yaw swings the field
  // with the sun instead of leaving it painted on the glass. Each star is a
  // jittered point inside its cell drawn as a soft dot a pixel or two wide —
  // never a whole square cell.
  vec3 sc = floor(rd * 44.0);
  float sh = hash(sc.xy + sc.z * 17.31);
  vec3 jitter = vec3(hash(sc.xy * 1.7 + sc.z), hash(sc.yz * 2.3 + sc.x), hash(sc.zx * 3.1 + sc.y));
  vec3 sp = normalize((sc + 0.5 + (jitter - 0.5) * 0.7) / 44.0);
  float sd = length(rd - sp);
  float sr = 0.0012 + 0.0022 * pow(hash(sc.xz + sc.y * 7.7), 4.0);
  float sw = fwidth(sd) + 1e-4;
  float star = step(0.94, sh) * (1.0 - smoothstep(sr - sw, sr + sw, sd));
  float twinkle = 0.7 + 0.3 * sin(uTime * 1.7 + sh * 90.0);
  col += vec3(0.88, 0.9, 1.0) * star * twinkle * (0.4 + 0.6 * sh)
       * smoothstep(0.0, 0.2, elev) * (1.0 - min(bloom * 2.5, 1.0))
       * (1.0 - min(cir * 2.0, 1.0));

  // Banded sun disc: bands cut the lower hemisphere only, drifting downward.
  // Keyed off the vertical component difference — linear enough this close
  // to centre.
  float cosR = cos(sunR);
  float disc = smoothstep(cosR, cosR + 0.0022, ang);
  float vOff = (rd.y - sunDir.y) / sunR;
  float bands = 1.0;
  if (vOff < 0.0) {
    float k = fract(vOff * 7.0 + uTime * 0.35);
    bands = smoothstep(0.0, 0.28, k);
  }
  col = mix(col, uSun * (0.85 + 0.3 * bands), disc * bands);

  // Twin ridges. Azimuth drives the profile, so the silhouette wraps the
  // full 360 and survives any yaw; the nearer layer samples a coarser octave
  // and sits higher, which is all "parallax" needs to read. Aerial
  // perspective does the rest: the far ridge is lighter and sunk into haze,
  // the near one a dark cut-out — two tones are what make two ridges read as
  // depth rather than one jagged line drawn twice.
  float ridgeFar = 0.045 + fbm(vec2(az * 3.1, 2.7)) * 0.10;
  float ridgeNear = 0.03 + fbm(vec2(az * 1.9 + 40.0, 8.2)) * 0.14;
  vec3 farCol = mix(uBg * 0.5, uHaze, 0.55);
  vec3 nearCol = mix(uBg * 0.22, uHaze, 0.2);
  float farMask = 1.0 - smoothstep(ridgeFar - 0.004, ridgeFar + 0.004, rd.y);
  col = mix(col, farCol, farMask);
  // Rim light kisses just the ridge line — the haze source behind the sun.
  col += uHaze * uHorizonGlow * smoothstep(ridgeFar - 0.012, ridgeFar, rd.y) * farMask * 0.7;
  float nearMask = 1.0 - smoothstep(ridgeNear - 0.004, ridgeNear + 0.004, rd.y);
  col = mix(col, nearCol, nearMask);
  col += uHaze * uHorizonGlow * smoothstep(ridgeNear - 0.010, ridgeNear, rd.y) * nearMask * 0.45;

  // Floor: analytic intersection, so the grid is exact rather than marched.
  if (rd.y < -0.002) {
    float t = -ro.y / rd.y;
    vec3 p = ro + rd * t;
    p.z += uTime * uScroll * 2.4;

    vec2 g = p.xz * (uDensity / 2.2);
    vec2 w = fwidth(g) * 1.5 + 1e-4;
    vec2 gg = abs(fract(g) - 0.5);
    float lines = 1.0 - min(min(gg.x / w.x, gg.y / w.y), 1.0);
    float att = exp(-t * 0.14);
    vec3 floorCol = uLine * lines * att * 1.15;

    // Pulse expanding from the vanishing point, tied to the same clock as the
    // scroll so the whole floor breathes on one rhythm.
    float r = length(p.xz);
    float ring = fract(uTime * 0.20);
    floorCol += uLine * lines * exp(-abs(r / 34.0 - ring) * 30.0) * 0.9;

    // A soft pool of light where the cursor would land — cheap, but it makes
    // the steering feel physical rather than like a cropped video.
    float pd = distance(uv * vec2(uAspect, 1.0), uPointer * vec2(uAspect, 1.0));
    floorCol += uLine * lines * exp(-pd * pd * 6.0) * 0.5;

    // Fog the floor into the SAME colour the sky paints at the horizon so the
    // seam never reads as a polygon edge.
    col = mix(floorCol + uHaze * uHorizonGlow * 0.08, col, smoothstep(3.0, 26.0, t));
  }

  // Dither: eight-bit output steps a dark sky into visible bands; a third
  // of a level of noise breaks them without being seen.
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(col, 1.0);
}`;

// Camera home: looking up a little, so the horizon settles in the lower
// third and the sun has the sky to itself. The clamp is centred on that,
// not on level — pitch is the one axis whose range should feel asymmetric
// here, since below the horizon there is only grid.
const PITCH_HOME = -0.28;
const PITCH_MIN = -0.55;
const PITCH_MAX = 0.2;

const GridHorizon = memo(
	({
		lineColor = "#a855f7",
		sunColor = "#f0abfc",
		hazeColor = "#2e1065",
		backgroundColor = "#070312",
		scrollSpeed = 0.35,
		gridDensity = 1,
		sunSize = 0.22,
		horizonGlow = 1,
		enableMouseInteraction = true,
		paused = false,
		reducedMotion = false,
		className,
	}: GridHorizonProps) => {
		const containerRef = useRef<HTMLDivElement>(null);
		const drawRef = useRef<((dt: number) => void | false) | null>(null);
		const measureRef = useRef<((m: Metrics) => void) | null>(null);
		const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(
			null,
		);
		const orbit = useRef({
			yaw: 0,
			pitch: PITCH_HOME,
			vYaw: 0,
			vPitch: 0,
			dragging: false,
			pointerId: -1,
			lastX: 0,
			lastY: 0,
			lastT: 0,
		});
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
			lineColor, sunColor, hazeColor, backgroundColor,
			scrollSpeed, gridDensity, sunSize, horizonGlow,
			enableMouseInteraction, reducedMotion,
		});
		live.current = {
			lineColor, sunColor, hazeColor, backgroundColor,
			scrollSpeed, gridDensity, sunSize, horizonGlow,
			enableMouseInteraction, reducedMotion,
		};

		useEffect(() => {
			const container = containerRef.current;
			if (fallback || !container) return;

			let renderer: Renderer;
			try {
				renderer = new Renderer({
					dpr: Math.min(window.devicePixelRatio || 1, 2),
					alpha: false,
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

			const program = new Program(glc, {
				vertex: vert,
				fragment: frag,
				cullFace: false,
				depthTest: false,
				depthWrite: false,
				uniforms: {
					uLine: { value: new Float32Array(hexToRgb01(lineColor)) },
					uSun: { value: new Float32Array(hexToRgb01(sunColor)) },
					uHaze: { value: new Float32Array(hexToRgb01(hazeColor)) },
					uBg: { value: new Float32Array(hexToRgb01(backgroundColor)) },
					uTime: { value: 0 },
					uAspect: { value: 1 },
					uDensity: { value: gridDensity },
					uScroll: { value: scrollSpeed },
					uSunSize: { value: sunSize },
					uHorizonGlow: { value: horizonGlow },
					uYaw: { value: 0 },
					uPitch: { value: PITCH_HOME },
					uPointer: { value: new Float32Array([10, 10]) },
				},
			});
			const mesh = new Mesh(glc, { geometry: new Triangle(glc), program });
			const u = program.uniforms as Record<string, { value: unknown }>;

			let time = 0;

			drawRef.current = (dt) => {
				const l = live.current;
				const o = orbit.current;
				const step = Math.min(dt, 1 / 30);
				const still = pausedRef.current || l.reducedMotion;

				if (!still) {
					time = (time + step) % 1000;
					if (!o.dragging) {
						o.yaw += o.vYaw * step;
						o.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, o.pitch + o.vPitch * step));
						const decay = Math.pow(0.92, step * 60);
						o.vYaw *= decay;
						o.vPitch *= decay;
					}
					o.yaw %= Math.PI * 2;
					// Pointer steering eases rather than snaps — a hard-follow makes the
					// horizon feel bolted to the cursor instead of piloted.
					const ease = Math.min(1, step * 4.5);
					pointer.current.x += (pointer.current.tx - pointer.current.x) * ease;
					pointer.current.y += (pointer.current.ty - pointer.current.y) * ease;
				}

				const steer = l.enableMouseInteraction && !l.reducedMotion ? 1 : 0;
				((u.uLine as { value: Float32Array }).value).set(hexToRgb01(l.lineColor));
				((u.uSun as { value: Float32Array }).value).set(hexToRgb01(l.sunColor));
				((u.uHaze as { value: Float32Array }).value).set(hexToRgb01(l.hazeColor));
				((u.uBg as { value: Float32Array }).value).set(hexToRgb01(l.backgroundColor));
				(u.uTime as { value: number }).value = time;
				(u.uDensity as { value: number }).value = l.gridDensity;
				(u.uScroll as { value: number }).value =
					l.reducedMotion ? 0 : l.scrollSpeed;
				(u.uSunSize as { value: number }).value = l.sunSize;
				(u.uHorizonGlow as { value: number }).value = l.horizonGlow;
				(u.uYaw as { value: number }).value = o.yaw + pointer.current.x * 0.22 * steer;
				(u.uPitch as { value: number }).value =
					o.pitch - pointer.current.y * 0.12 * steer;
				const pv = u.uPointer.value as Float32Array;
				pv[0] = l.enableMouseInteraction ? pointer.current.tx : 10;
				pv[1] = l.enableMouseInteraction ? pointer.current.ty : 10;

				renderer.render({ scene: mesh });
			};

			measureRef.current = ({ width, height, dpr }: Metrics) => {
				renderer.dpr = dpr;
				renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
				(u.uAspect as { value: number }).value =
					Math.max(width, 1) / Math.max(height, 1);
				drawRef.current?.(0.016);
			};

			loop.resize();
			loop.start();

			return () => {
				drawRef.current = null;
				measureRef.current = null;
				if (container.contains(canvas)) container.removeChild(canvas);
			};
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [fallback]);

		useEffect(() => {
			loop.paint();
		}, [
			lineColor, sunColor, hazeColor, backgroundColor, scrollSpeed,
			gridDensity, sunSize, horizonGlow, enableMouseInteraction, loop,
		]);

		const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
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
			const r = e.currentTarget.getBoundingClientRect();
			if (r.width === 0 || r.height === 0) return;
			pointer.current.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
			pointer.current.ty = -(((e.clientY - r.top) / r.height) * 2 - 1);

			const o = orbit.current;
			if (!o.dragging || e.pointerId !== o.pointerId) return;
			const dx = e.clientX - o.lastX;
			const dy = e.clientY - o.lastY;
			const dt = (e.timeStamp - o.lastT) / 1000;
			// Camera convention — NEGATED on both axes (this shader rotates rays).
			// Dragging down drops the gaze toward the foreground grid.
			const dYaw = dx * 0.008;
			const dPitch = -dy * 0.006;
			o.yaw += dYaw;
			o.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, o.pitch + dPitch));
			if (dt > 0.001) {
				o.vYaw = dYaw / dt;
				o.vPitch = dPitch / dt;
			}
			o.lastX = e.clientX;
			o.lastY = e.clientY;
			o.lastT = e.timeStamp;
			loop.start();
		};

		const release = () => {
			orbit.current.dragging = false;
			orbit.current.pointerId = -1;
		};

		const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
			const o = orbit.current;
			if (o.pointerId !== -1 && e.currentTarget.hasPointerCapture(o.pointerId)) {
				e.currentTarget.releasePointerCapture(o.pointerId);
			}
			release();
			loop.start();
		};

		if (fallback) {
			return (
				<div
					className={className ?? "relative h-full w-full overflow-hidden"}
					style={{
						backgroundColor,
						backgroundImage: `radial-gradient(circle at 50% 62%, ${lineColor}66 0%, transparent 55%), radial-gradient(circle at 60% 46%, ${sunColor}88 0%, transparent 24%), linear-gradient(to bottom, ${backgroundColor}, ${hazeColor})`,
					}}
				/>
			);
		}

		return (
			<div
				ref={containerRef}
				className={
					className ??
					"relative h-full w-full cursor-default overflow-hidden [&_canvas]:touch-none"
				}
				onPointerDown={onPointerDown}
				onPointerMove={track}
				onPointerUp={endDrag}
				onPointerLeave={release}
				onPointerCancel={endDrag}
			/>
		);
	},
);

GridHorizon.displayName = "GridHorizon";

export default GridHorizon;
