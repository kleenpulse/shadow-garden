"use client";

import { useEffect, useRef } from "react";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

const TWO_PI = Math.PI * 2;
// Fixed diagonal drift direction — stars stream up-and-to-the-right.
const DRIFT_X = Math.cos(-0.45);
const DRIFT_Y = Math.sin(-0.45);

interface StarfieldProps {
	/** Color of the bulk of the field. */
	starColor?: string;
	/** Accent color sprinkled on a minority of stars and shooting-star streaks. */
	accentColor?: string;
	/** Star population relative to area (count ≈ area / 8000 × density, capped). */
	density?: number;
	/** Number of parallax depth layers. Nearer layers are bigger, brighter, faster. */
	layers?: number;
	/** Base drift speed multiplier. 0 freezes the field. */
	driftSpeed?: number;
	/** Twinkle depth — 0 steady, 1 strong alpha pulsing. */
	twinkle?: number;
	/** Shooting-star frequency, 0 (never) → 1 (frequent). */
	shootingStars?: number;
	/** Star halo blur (canvas shadowBlur). 0 skips the shadow pass. */
	glow?: number;
	/** Halt the loop after one static populated frame (reduced motion / offscreen). */
	paused?: boolean;
	/** Bake a still frame without any motion. */
	reducedMotion?: boolean;
	className?: string;
}

interface Star {
	x: number;
	y: number;
	size: number;
	baseAlpha: number;
	phase: number;
	depth: number;
	accent: boolean;
}

interface Shot {
	x: number;
	y: number;
	vx: number;
	vy: number;
	len: number;
	life: number;
	alive: boolean;
}

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
	const h = hex.replace("#", "");
	const full =
		h.length === 3
			? h
					.split("")
					.map((c) => c + c)
					.join("")
			: h;
	const n = parseInt(full, 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export default function Starfield({
	starColor = "#ffffff",
	accentColor = "#a855f7",
	density = 1,
	layers = 3,
	driftSpeed = 0.5,
	twinkle = 0.5,
	shootingStars = 0.4,
	glow = 8,
	paused = false,
	reducedMotion = false,
	className,
}: StarfieldProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const starsRef = useRef<Star[]>([]);
	const shotsRef = useRef<Shot[]>([]);
	const sizeRef = useRef({ w: 0, h: 0 });

	// Live props mirror — read per-frame so dragging a control never rebuilds GL.
	const live = useRef({
		starColor,
		accentColor,
		density,
		layers,
		driftSpeed,
		twinkle,
		shootingStars,
		glow,
		paused,
		reducedMotion,
	});
	live.current = {
		starColor,
		accentColor,
		density,
		layers,
		driftSpeed,
		twinkle,
		shootingStars,
		glow,
		paused,
		reducedMotion,
	};

	const rebuildRef = useRef<(() => void) | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const drawRef = useRef<(() => void | false) | null>(null);
	const measureRef = useRef<((m: Metrics) => void) | null>(null);

	const loop = useAnimationLoop({
		target: containerRef,
		halted: paused || reducedMotion,
		dpr: 2,
		resizeDebounceMs: 100,
		onResize: (metrics) => measureRef.current?.(metrics),
		onFrame: () => (drawRef.current ? drawRef.current() : false),
	});

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d", { alpha: true });
		if (!ctx) return;
		// Bounded accumulator feeding trig — kept small to avoid float32 decay.
		let t = 0;

		function depthOf(index: number, total: number) {
			// Layer 0 = farthest (0.3), last = nearest (1.0).
			return total <= 1 ? 1 : 0.3 + (0.7 * index) / (total - 1);
		}

		function initStars() {
			const { w, h } = sizeRef.current;
			const p = live.current;
			const total = Math.max(
				20,
				Math.min(600, Math.floor(((w * h) / 8000) * p.density)),
			);
			const layerCount = Math.max(1, Math.round(p.layers));
			const stars: Star[] = new Array(total);
			for (let i = 0; i < total; i++) {
				const layer = i % layerCount;
				const depth = depthOf(layer, layerCount);
				stars[i] = {
					x: Math.random() * w,
					y: Math.random() * h,
					size: (Math.random() * 0.9 + 0.4) * (0.5 + depth),
					baseAlpha: (Math.random() * 0.5 + 0.4) * (0.4 + depth * 0.6),
					phase: Math.random() * TWO_PI,
					depth,
					// ~14% of stars carry the accent hue.
					accent: Math.random() < 0.14,
				};
			}
			starsRef.current = stars;
			shotsRef.current = [];
			for (let i = 0; i < 4; i++) {
				shotsRef.current.push({
					x: 0,
					y: 0,
					vx: 0,
					vy: 0,
					len: 0,
					life: 0,
					alive: false,
				});
			}
		}

		measureRef.current = ({ width: w, height: h, dpr, bufferWidth, bufferHeight }) => {
			canvas!.width = bufferWidth;
			canvas!.height = bufferHeight;
			canvas!.style.width = `${w}px`;
			canvas!.style.height = `${h}px`;
			ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
			sizeRef.current = { w, h };
			initStars();
		};

		function spawnShot(shot: Shot) {
			const { w, h } = sizeRef.current;
			// Enter from the top edge or the right edge, streaking down-left.
			const fromTop = Math.random() < 0.6;
			const speed = 7 + Math.random() * 6;
			const angle = 2.3 + Math.random() * 0.5; // down-left-ish
			shot.vx = Math.cos(angle) * speed;
			shot.vy = Math.sin(angle) * speed;
			shot.x = fromTop ? Math.random() * w : w + 20;
			shot.y = fromTop ? -20 : Math.random() * h * 0.5;
			shot.len = 80 + Math.random() * 120;
			shot.life = 1;
			shot.alive = true;
		}

		function drawStars(animate: boolean) {
			const { w, h } = sizeRef.current;
			const p = live.current;
			const stars = starsRef.current;
			const [sr, sg, sb] = hexToRgb(p.starColor);
			const [ar, ag, ab] = hexToRgb(p.accentColor);
			const drift = animate ? p.driftSpeed : 0;

			for (let i = 0; i < stars.length; i++) {
				const st = stars[i];
				if (animate && drift > 0) {
					// Parallax: nearer (higher depth) layers drift faster.
					const s = drift * (0.2 + st.depth) * 0.6;
					st.x += DRIFT_X * s;
					st.y += DRIFT_Y * s;
					if (st.x < 0) st.x += w;
					else if (st.x > w) st.x -= w;
					if (st.y < 0) st.y += h;
					else if (st.y > h) st.y -= h;
				}

				let alpha = st.baseAlpha;
				if (animate && p.twinkle > 0) {
					alpha *= 1 + Math.sin(t + st.phase) * p.twinkle;
				}
				alpha = Math.max(0, Math.min(1, alpha));

				const r = st.accent ? ar : sr;
				const g = st.accent ? ag : sg;
				const b = st.accent ? ab : sb;
				ctx!.beginPath();
				ctx!.arc(st.x, st.y, Math.max(0.2, st.size), 0, TWO_PI);
				ctx!.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
				if (p.glow > 0) {
					ctx!.shadowBlur = p.glow * st.depth;
					ctx!.shadowColor = `rgb(${r}, ${g}, ${b})`;
					ctx!.fill();
					ctx!.shadowBlur = 0;
				} else {
					ctx!.fill();
				}
			}
		}

		function drawShots() {
			const p = live.current;
			const { w, h } = sizeRef.current;
			const shots = shotsRef.current;
			const [ar, ag, ab] = hexToRgb(p.accentColor);

			// Poisson-ish spawn: probability scales with the shootingStars control.
			if (p.shootingStars > 0 && Math.random() < p.shootingStars * 0.02) {
				const free = shots.find((s) => !s.alive);
				if (free) spawnShot(free);
			}

			for (let i = 0; i < shots.length; i++) {
				const sh = shots[i];
				if (!sh.alive) continue;
				sh.x += sh.vx;
				sh.y += sh.vy;
				const mag = Math.sqrt(sh.vx * sh.vx + sh.vy * sh.vy) || 1;
				const tx = sh.x - (sh.vx / mag) * sh.len;
				const ty = sh.y - (sh.vy / mag) * sh.len;
				const grad = ctx!.createLinearGradient(sh.x, sh.y, tx, ty);
				grad.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, ${0.9 * sh.life})`);
				grad.addColorStop(1, `rgba(${ar}, ${ag}, ${ab}, 0)`);
				ctx!.strokeStyle = grad;
				ctx!.lineWidth = 2;
				ctx!.lineCap = "round";
				ctx!.beginPath();
				ctx!.moveTo(sh.x, sh.y);
				ctx!.lineTo(tx, ty);
				ctx!.stroke();
				// Retire once fully off-screen.
				if (sh.x < -sh.len || sh.x > w + sh.len || sh.y > h + sh.len) {
					sh.alive = false;
				}
			}
		}

		function tick() {
			const p = live.current;
			const still = p.paused || p.reducedMotion;
			const { w, h } = sizeRef.current;
			ctx!.clearRect(0, 0, w, h);

			if (still) {
				// One static populated frame — no drift, no twinkle, no streaks.
				drawStars(false);
				return false;
			}

			t += 0.04;
			if (t > TWO_PI) t -= TWO_PI;
			drawStars(true);
			drawShots();
		}
		drawRef.current = tick;

		loop.resize();
		loop.start();

		rebuildRef.current = () => {
			// paint() is idempotent. The old code set `running = false` and then
			// re-armed, which left the previous frame pending and ran two rAF
			// chains at once — the field drifted at double speed.
			if (sizeRef.current.w > 0) {
				initStars();
				loop.paint();
			}
		};

		return () => {
			drawRef.current = null;
			measureRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Population depends on density + layer count; everything else reads live.
	useEffect(() => {
		rebuildRef.current?.();
	}, [density, layers]);

	return (
		<div
			ref={containerRef}
			className={className}
			style={{ position: "relative", height: "100%", width: "100%" }}
		>
			<canvas
				ref={canvasRef}
				style={{
					position: "absolute",
					inset: 0,
					width: "100%",
					height: "100%",
				}}
			/>
		</div>
	);
}
