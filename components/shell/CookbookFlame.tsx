"use client";

import { useEffect, useRef } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";
import { useTheme } from "next-themes";
import { useAnimationLoop } from "@/hooks/use-animation-loop";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { useFlameHydrated, useFlameStore } from "@/lib/cookbook-flame-store";

/**
 * The ambient flame under /cookbook. A deliberate private fork of the
 * Shadowflame registry component — NOT an import of it.
 *
 * Why fork: the shipped component renders opaque (`alpha: false`, `fragColor.a = 1`)
 * because a background you sell is a background that owns its frame. Layering one
 * behind page content needs a real alpha channel, and adding that to the registry
 * entry would mean a new PropSchema, a Controls knob that reads as dead on a dark
 * preview card, and a re-verify of a paid component — all to serve one page.
 * So the alpha path lives here, hardcoded on, and the customer-facing source
 * stays byte-identical.
 *
 * Trimmed against the original: no props, no live-value ref (nothing drags these
 * controls), no CSS-gradient fallback branch, and no IntersectionObserver — a
 * `fixed` layer is always intersecting, so the observer could only ever report
 * true. The `visibilitychange` halt stays; a backgrounded tab is the one halt
 * that actually fires here.
 *
 * The reader's two switches (lib/cookbook-flame-store, surfaced by
 * CookbookFlameControls) arrive through the store, not props: this layer is a
 * sibling of CookbookBrowser under a server component, so there is no tree to
 * pass through. `enabled` gates the mount below; `paused` folds into the frame
 * loop's existing motion scalar.
 */

// Wrap accumulated sim time so iTime stays small — keeps the fbm/domain-warp
// coordinates bounded and float32 precision intact across a long reading session.
const TIME_WRAP = 300.0;

// Baked configuration. Slower and one octave shallower than the preview default:
// this sits behind body text for as long as someone reads, so the frame budget
// matters more than the filigree. detail 4 -> 3 drops 3 of 12 noise evals/px.
const SPEED = 0.25;
const WARP = 1.0;
const DETAIL = 3.0;
const SHIMMER = 0.5;
const HEIGHT = 0.85;
const WIDTH = 1.0;
const SPARK_COUNT = 44;
const SPARK_SIZE = 1.2;
const SPARK_SPEED = 0.4;
/** Ember spawn spread as a fraction of container width, each side of centre. */
const SPARK_SPREAD = 0.42;
/**
 * Where embers detach, as a fraction of band height from the bottom. Real embers
 * break off the flame *tips*, not the floor — spawning them at y=0 made them read
 * as a uniform column of specks rising the full height of the page.
 */
const SPARK_ORIGIN = 0.45;
const SPARK_ORIGIN_JITTER = 0.14;

interface Palette {
	flame: string;
	core: string;
	/** Ember centre. Must contrast with the page, not with the flame. */
	hot: string;
	grain: number;
}

// Both themes burn amethyst. A near-black body was tried on light and reads as a
// grey smoke smudge rather than fire — on paper, value alone can't carry "flame",
// so light gets a saturated violet body under the same accent core. The ember
// centre inverts per theme: lifted amethyst glows on graphite, but on white the
// centre has to go DARKER than its ring or the spark vanishes into the page.
const PALETTE: Record<"light" | "dark", Palette> = {
	dark: { flame: "#630475", core: "#a855f7", hot: "#e9d5ff", grain: 0.05 },
	light: { flame: "#6d28d9", core: "#a855f7", hot: "#3b0764", grain: 0.015 },
};

type Spark = {
	x: number;
	y: number;
	vy: number;
	sway: number;
	size: number;
	life: number;
	maxLife: number;
	seed: number;
};

const hexToRgb = (hex: string): [number, number, number] => {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!result) return [1, 1, 1];
	return [
		parseInt(result[1], 16) / 255,
		parseInt(result[2], 16) / 255,
		parseInt(result[3], 16) / 255,
	];
};

const setRgb = (arr: Float32Array, hex: string) => {
	const c = hexToRgb(hex);
	arr[0] = c[0];
	arr[1] = c[1];
	arr[2] = c[2];
};

const vertex = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

// Same flame field as the registry component. The divergence is the last four
// lines: no background term at all, and a coverage alpha so the void composites
// away instead of painting a rectangle over the page.
const fragment = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uSpeed;
uniform float uWarp;
uniform float uDetail;
uniform float uShimmer;
uniform float uHeight;
uniform float uWidth;
uniform float uGrain;
uniform vec3 uCoreColor;
uniform vec3 uFlameColor;
out vec4 fragColor;

vec2 hash(vec2 p){
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  float n = mix(
    mix(dot(-1.0 + 2.0 * hash(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
        dot(-1.0 + 2.0 * hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(-1.0 + 2.0 * hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
        dot(-1.0 + 2.0 * hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y);
  return 0.5 + 0.5 * n;
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++){
    if (float(i) >= uDetail) break;
    v += a * noise(p);
    p = p * 2.0 + vec2(37.1, 17.7);
    a *= 0.5;
  }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  float t = iTime;
  float vy = uv.y;                      // 0 bottom, 1 top

  float shim = sin(vy * 22.0 - t * uSpeed * 1.5) * uShimmer * 0.03 * vy;
  vec2 p = vec2((uv.x - 0.5) * aspect + shim, vy);

  vec2 fp = vec2(p.x * 3.0, p.y * 3.2 - t * uSpeed * 1.2);

  vec2 warped = fp + uWarp * vec2(
    fbm(fp + vec2(0.0, t * uSpeed * 0.6)),
    fbm(fp + vec2(7.0, t * uSpeed * 0.6 + 7.0))
  );
  float density = fbm(warped);

  float taper = 1.0 - smoothstep(0.0, uHeight, vy);
  taper = max(taper, (1.0 - smoothstep(0.0, 0.12, vy)) * 0.9);

  // Envelope in uv space, NOT the aspect-corrected p.x the noise field uses:
  // a fixed aspect-corrected width would cover a different fraction of the
  // container at every viewport. hx is 0 at centre, 1 at either edge, so a base
  // of 1.05 means "reaches both edges, softly" on a phone and on a 4K monitor.
  float hx = abs(uv.x - 0.5) * 2.0;
  // Base 2.4 puts the falloff band (1.32 -> 2.4) entirely off-frame, so horiz is
  // a flat 1.0 across the full width at the base — the flame is shaped by the
  // noise and the vertical taper, not clipped by an envelope. It still narrows
  // to 0.6 at the tip so it reads as fire rather than a gradient.
  float wide = mix(2.4, 0.6, smoothstep(0.0, uHeight, vy)) * uWidth;
  float horiz = 1.0 - smoothstep(wide * 0.55, wide, hx);

  float flame = clamp(density * taper * horiz, 0.0, 1.0);
  flame = pow(flame, 1.25);

  float baseWeight = 1.0 - smoothstep(uHeight * 0.35, uHeight * 0.95, vy);
  float coreMask = smoothstep(0.45, 0.9, flame) * baseWeight;

  // Clean slate: the colour is the flame, never a void mixed toward a flame.
  vec3 col = mix(uFlameColor, uCoreColor, coreMask);
  col += uCoreColor * (pow(flame, 1.6) * 0.32 + pow(coreMask, 2.0) * 0.35);

  float g = fract(sin(dot(gl_FragCoord.xy + fract(iTime), vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * uGrain;
  col = clamp(col, 0.0, 1.0);

  // Coverage alpha. Multiplying grain through it too is why empty space stays
  // empty instead of speckling over the page.
  float a = clamp(smoothstep(0.06, 0.5, flame) + coreMask, 0.0, 1.0);
  fragColor = vec4(col * a, a);   // premultiplied — see Renderer options
}
`;

/**
 * One ember, drawn once into an offscreen canvas and blitted per spark.
 *
 * A radial falloff rather than two stacked discs: a hard-edged dot with a bright
 * centre reads as a white pixel at ember scale no matter what colour it is. The
 * hot centre is held to the inner 22% so the surrounding coreColor is what the
 * eye actually picks up.
 */
const SPRITE_PX = 32;
function buildSprite(core: string, hot: string): HTMLCanvasElement {
	const c = document.createElement("canvas");
	c.width = SPRITE_PX;
	c.height = SPRITE_PX;
	const g = c.getContext("2d");
	if (!g) return c;
	const mid = SPRITE_PX / 2;
	const [r, gr, b] = hexToRgb(core).map((v) => Math.round(v * 255));

	const grad = g.createRadialGradient(mid, mid, 0, mid, mid, mid);
	grad.addColorStop(0, hot);
	grad.addColorStop(0.22, `rgba(${r},${gr},${b},1)`);
	grad.addColorStop(0.5, `rgba(${r},${gr},${b},0.55)`);
	grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
	g.fillStyle = grad;
	g.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
	return c;
}

/**
 * Mount gate. Kept separate from FlameCanvas because the GL effect below is
 * mount-once (`[]` deps) — an early `return null` inside it would bail that
 * effect forever and re-enabling would never rebuild the renderer. Unmounting
 * the whole subtree instead runs the existing teardown (WEBGL_lose_context), so
 * "off" actually releases the context rather than hiding a live canvas.
 */
export default function CookbookFlame() {
	const enabled = useFlameStore((s) => s.enabled);
	const hydrated = useFlameHydrated();
	if (hydrated && !enabled) return null;
	return <FlameCanvas />;
}

function FlameCanvas() {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const sparkCanvasRef = useRef<HTMLCanvasElement | null>(null);

	const { resolvedTheme } = useTheme();
	const reducedMotion = usePrefersReducedMotion();
	const paused = useFlameStore((s) => s.paused);

	// resolvedTheme is undefined until next-themes has read the DOM. Falling back
	// to dark costs nothing: the app's defaultTheme is dark, so the pre-resolve
	// palette already matches what the page is about to be. No mount gate needed —
	// the wrapper below is inert markup that renders identically on both sides.
	const palette = PALETTE[resolvedTheme === "light" ? "light" : "dark"];

	// The only values the frame loop reads live: the theme can flip mid-session.
	// Mirrored in an effect rather than during render — this runs before the
	// loop.start() effect below, so a re-armed frame always sees the new palette.
	const live = useRef({ palette, reducedMotion, paused });
	useEffect(() => {
		live.current = { palette, reducedMotion, paused };
	}, [palette, reducedMotion, paused]);

	const drawRef = useRef<((dt: number) => void | false) | null>(null);
	const measureRef = useRef<
		((w: number, h: number, dpr: number) => void) | null
	>(null);
	const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(
		null,
	);

	const loop = useAnimationLoop({
		target: containerRef,
		halted: false,
		dpr: "auto",
		onResize: ({ width, height, dpr }) =>
			measureRef.current?.(width, height, dpr),
		// Literal-false halt: the null-guard form would hand the host `false` on
		// every successful frame and freeze after one.
		onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
		gl: () => glRef.current,
	});

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		// No CSS fallback here — an ambient decoration that can't render should
		// render nothing, not a second art direction to maintain.
		if (!document.createElement("canvas").getContext("webgl2")) return;

		let renderer: Renderer;
		try {
			renderer = new Renderer({
				webgl: 2,
				alpha: true,
				// ogl defaults this to false; the shader emits premultiplied colour, so
				// leaving it unset composites the flame washed-out and edge-fringed.
				premultipliedAlpha: true,
				depth: false,
				antialias: false,
				dpr: Math.min(window.devicePixelRatio || 1, 2),
			});
		} catch {
			return;
		}

		const gl = renderer.gl;
		const canvas = gl.canvas as HTMLCanvasElement;
		canvas.style.width = "100%";
		canvas.style.height = "100%";
		canvas.style.display = "block";
		// Out of flow — an in-flow canvas with an explicit pixel width holds the
		// container open, so it never shrinks and the observer never fires.
		canvas.style.position = "absolute";
		canvas.style.top = "0";
		canvas.style.left = "0";
		container.appendChild(canvas);

		const p0 = live.current.palette;
		const geometry = new Triangle(gl);
		const program = new Program(gl, {
			vertex,
			fragment,
			depthTest: false,
			depthWrite: false,
			uniforms: {
				iTime: { value: 0 },
				iResolution: { value: new Float32Array([1, 1]) },
				uSpeed: { value: SPEED },
				uWarp: { value: WARP },
				uDetail: { value: DETAIL },
				uShimmer: { value: SHIMMER },
				uHeight: { value: HEIGHT },
				uWidth: { value: WIDTH },
				uGrain: { value: p0.grain },
				uCoreColor: { value: new Float32Array(hexToRgb(p0.core)) },
				uFlameColor: { value: new Float32Array(hexToRgb(p0.flame)) },
			},
		});
		const mesh = new Mesh(gl, { geometry, program });
		const u = program.uniforms as Record<string, { value: unknown }>;

		// --- Embers. `source-over`, not `lighter`: additive compositing is invisible
		// against a light page, and this layer has to work on both themes. Each spark
		// is one drawImage of a pre-rendered sprite rather than two arc fills, so the
		// per-frame CPU cost is a blit instead of path construction. ---
		const sparkCanvas = sparkCanvasRef.current;
		const sctx = sparkCanvas ? sparkCanvas.getContext("2d") : null;
		const sparkDpr = Math.min(window.devicePixelRatio || 1, 2);
		let sparkW = 0;
		let sparkH = 0;
		let sparks: Spark[] = [];
		let sprite: HTMLCanvasElement | null = null;
		let spriteKey = "";

		const makeSpark = (fresh: boolean): Spark => {
			const halfW = sparkW * SPARK_SPREAD;
			const rx = Math.random() + Math.random() - 1; // triangular, centre-biased
			const originVy =
				SPARK_ORIGIN + (Math.random() * 2 - 1) * SPARK_ORIGIN_JITTER;
			const s: Spark = {
				x: sparkW / 2 + rx * halfW,
				// Canvas y grows downward, so a vy fraction measured from the bottom of
				// the band inverts. Embers appear at the flame tips and climb from there.
				y: sparkH * (1 - originVy),
				vy: 0.5 + Math.random() * 1.2,
				sway: Math.random() * Math.PI * 2,
				// Squared random: mostly near-invisible motes with an occasional bright
				// one, which is what makes a spark field read as embers instead of stars.
				size: SPARK_SIZE * (0.35 + Math.random() * Math.random() * 1.9),
				life: fresh ? 0 : Math.random(),
				maxLife: 70 + Math.random() * 110,
				seed: Math.random() * Math.PI * 2,
			};
			// Initial fill only: scatter along the flight path so the field doesn't
			// start as one synchronised pulse at the origin line.
			if (!fresh) s.y -= Math.random() * sparkH * 0.35;
			return s;
		};

		const stepAndDrawSparks = (dt: number, m: number) => {
			if (!sctx) return;
			sctx.clearRect(0, 0, sparkW, sparkH);
			while (sparks.length < SPARK_COUNT) sparks.push(makeSpark(false));

			const pal = live.current.palette;
			const key = `${pal.core}|${pal.hot}`;
			if (key !== spriteKey) {
				sprite = buildSprite(pal.core, pal.hot);
				spriteKey = key;
			}
			if (!sprite) return;

			const rise = SPARK_SPEED * m;
			const fscale = Math.min(3, dt * 60); // normalise toward per-frame at 60fps
			sctx.globalCompositeOperation = "source-over";
			for (let i = 0; i < sparks.length; i++) {
				const s = sparks[i];
				s.y -= s.vy * rise * 1.4 * fscale;
				s.x += Math.sin(s.sway + s.y * 0.03) * 0.6 * rise * fscale;
				s.life += (1 / s.maxLife) * (0.4 + m) * fscale;
				if (s.y < -6 || s.life >= 1) {
					sparks[i] = makeSpark(true);
					continue;
				}
				// Burn curve: snap alight, hold, then die out over the back half. The old
				// fade keyed off distance from the canvas floor, which is meaningless now
				// that embers are born mid-band rather than off the bottom edge.
				const fadeIn = Math.min(1, s.life * 9);
				const fadeOut = Math.max(0, 1 - Math.max(0, s.life - 0.4) / 0.6);
				const flick = 0.55 + 0.45 * Math.sin(s.seed + s.y * 0.2);
				const a = fadeIn * fadeOut * flick * (0.45 + 0.55 * m);
				if (a <= 0.01) continue;
				// Embers shrink as they cool.
				const rad = (s.size * (1 - s.life * 0.35) + 0.5) * 1.9;
				sctx.globalAlpha = Math.min(1, a);
				sctx.drawImage(sprite, s.x - rad, s.y - rad, rad * 2, rad * 2);
			}
			sctx.globalAlpha = 1;
		};

		let simTime = 0;
		// Eased motion scalar: 1 = running, 0 = fully still.
		let motion = live.current.reducedMotion ? 0 : 1;
		let isPageVisible = !document.hidden;

		const syncUniforms = () => {
			const pal = live.current.palette;
			u.iTime.value = simTime;
			u.uGrain.value = pal.grain;
			setRgb(u.uCoreColor.value as Float32Array, pal.core);
			setRgb(u.uFlameColor.value as Float32Array, pal.flame);
		};

		glRef.current = gl;
		measureRef.current = (width, height, dpr) => {
			const w = Math.max(1, Math.floor(width));
			const h = Math.max(1, Math.floor(height));
			renderer.dpr = dpr;
			renderer.setSize(w, h);
			const res = (u.iResolution as { value: Float32Array }).value;
			res[0] = gl.drawingBufferWidth;
			res[1] = gl.drawingBufferHeight;
			if (sparkCanvas && sctx) {
				sparkCanvas.width = Math.floor(w * sparkDpr);
				sparkCanvas.height = Math.floor(h * sparkDpr);
				sparkW = w;
				sparkH = h;
				sctx.setTransform(sparkDpr, 0, 0, sparkDpr, 0, 0);
			}
			// Bake one corrected still so a halted canvas is never stale.
			syncUniforms();
			renderer.render({ scene: mesh });
			stepAndDrawSparks(0, motion);
		};

		drawRef.current = (dt: number) => {
			// One choke point for every reason to stop: the reader's pause switch
			// rides the same eased fade-to-still as a backgrounded tab, so pausing
			// settles the flame instead of snapping it.
			const wantMotion =
				!isPageVisible || live.current.reducedMotion || live.current.paused
					? 0
					: 1;
			motion += (wantMotion - motion) * Math.min(1, dt * 4);
			if (wantMotion === 0 && motion < 0.001) motion = 0;

			simTime += dt * motion;
			if (simTime > TIME_WRAP) simTime -= TIME_WRAP;

			syncUniforms();
			renderer.render({ scene: mesh });
			stepAndDrawSparks(dt, motion);

			// Self-halt: once eased to a full stop, stop scheduling frames.
			if (wantMotion === 0 && motion === 0) return false;
		};

		const onVisibility = () => {
			isPageVisible = !document.hidden;
			if (isPageVisible) loop.start();
		};
		document.addEventListener("visibilitychange", onVisibility);

		loop.resize();
		loop.start();

		return () => {
			drawRef.current = null;
			measureRef.current = null;
			document.removeEventListener("visibilitychange", onVisibility);
			sparks = [];
			sprite = null;
			try {
				container.removeChild(canvas);
			} catch {
				/* ignore */
			}
		};
		// Renderer is created once, on mount. Theme reaches the loop via `live`.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Theme, reduced-motion or the pause switch flipped. start() is idempotent;
	// re-armed under a still state it bakes exactly one frame with the new palette
	// and self-halts. This is also the only thing that revives a self-halted loop
	// when the reader un-pauses.
	useEffect(() => {
		loop.start();
	}, [resolvedTheme, reducedMotion, paused, loop]);

	return (
		<div
			aria-hidden
			// -z-10 paints above the body's measurement-grid background-image but under
			// every in-flow element, so the grid reads through the flame's alpha and the
			// opaque cards still occlude it cleanly. Offset past the sidebar so the
			// flame centres on the column the reader is actually looking at.
			className="pointer-events-none fixed bottom-0 left-0 right-0 -z-10 h-svh overflow-hidden lg:left-(--sg-sidebar-w,18rem) opacity-20 dark:opacity-50"
			style={{
				maskImage: "linear-gradient(to top, black 55%, transparent 100%)",
				WebkitMaskImage: "linear-gradient(to top, black 55%, transparent 100%)",
			}}
		>
			<div ref={containerRef} className="relative h-full w-full">
				<canvas
					ref={sparkCanvasRef}
					style={{
						position: "absolute",
						inset: 0,
						width: "100%",
						height: "100%",
						zIndex: 2,
						pointerEvents: "none",
					}}
				/>
			</div>
		</div>
	);
}
