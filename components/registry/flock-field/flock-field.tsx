"use client";

import { useEffect, useRef } from "react";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

/**
 * FlockField — a Reynolds boids flock on a Canvas 2D field.
 *
 * Each boid steers by three classic urges — separation, alignment, cohesion —
 * plus an optional cursor attract/repel. Neighbor queries run through a spatial
 * hash (a Map keyed by grid cell), so the O(n²) pairwise pass is replaced by a
 * 3×3 cell scan and the flock scales to a thousand birds.
 *
 * The loop self-halts under `paused`/`reducedMotion` after baking a warmed-up
 * still frame, and re-arms on unpause; a ResizeObserver repaints one corrected
 * frame after a resize even while halted.
 */

interface FlockFieldProps {
	/** Number of boids. Capped at 1000 to keep the spatial hash cheap. */
	count?: number;
	/** Top speed of a boid, px per frame. */
	speed?: number;
	/** Weight of the push-apart urge (avoid crowding close neighbors). */
	separation?: number;
	/** Weight of the match-heading urge (steer toward the local average velocity). */
	alignment?: number;
	/** Weight of the pull-together urge (steer toward the local centroid). */
	cohesion?: number;
	/** Radius for alignment + cohesion neighbor detection, px. */
	neighborRadius?: number;
	/** Radius inside which separation kicks in, px. */
	separationRadius?: number;
	/** How the pointer affects nearby boids. "off" ignores the cursor. */
	cursorMode?: "attract" | "repel" | "off";
	/** Strength of the cursor pull/push. */
	cursorForce?: number;
	/** Cursor influence radius, px. */
	cursorRadius?: number;
	/** Motion-trail persistence, 0 (crisp) → 0.95 (long comet tails). */
	trail?: number;
	/** Slow-boid color (velocity gradient start). */
	color1?: string;
	/** Fast-boid color (velocity gradient end). */
	color2?: string;
	/** Halt the loop after one warmed still frame (manual pause). */
	paused?: boolean;
	/** Force the quiet path regardless of the loop state. */
	reducedMotion?: boolean;
	className?: string;
}

interface Boid {
	x: number;
	y: number;
	vx: number;
	vy: number;
	ax: number;
	ay: number;
}

type Rgb = [number, number, number];

const BG: Rgb = [10, 10, 12];
const WARMUP_STEPS = 120;
const MAX_COUNT = 1000;

function hexToRgb(hex: string): Rgb {
	let h = hex.replace("#", "");
	if (h.length === 3)
		h = h
			.split("")
			.map((c) => c + c)
			.join("");
	const n = parseInt(h, 16);
	if (Number.isNaN(n) || h.length !== 6) return [168, 85, 247];
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export default function FlockField({
	count = 300,
	speed = 2.5,
	separation = 1.2,
	alignment = 1,
	cohesion = 1,
	neighborRadius = 60,
	separationRadius = 24,
	cursorMode = "repel",
	cursorForce = 1.5,
	cursorRadius = 160,
	trail = 0.85,
	color1 = "#a855f7",
	color2 = "#22d3ee",
	paused = false,
	reducedMotion = false,
	className = "",
}: FlockFieldProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const boidsRef = useRef<Boid[]>([]);
	const mouseRef = useRef({ x: -1e5, y: -1e5 });
	const sizeRef = useRef({ w: 0, h: 0 });
	const containerRef = useRef<HTMLDivElement>(null);
	const drawRef = useRef<(() => void | false) | null>(null);
	const measureRef = useRef<((m: Metrics) => void) | null>(null);

	// All tunable props mirrored into a ref every render — the loop reads
	// live.current per frame, so dragging a control never rebuilds the canvas
	// context or resets the flock.
	const live = useRef({
		count,
		speed,
		separation,
		alignment,
		cohesion,
		neighborRadius,
		separationRadius,
		cursorMode,
		cursorForce,
		cursorRadius,
		trail,
		color1,
		color2,
		paused: paused || reducedMotion,
	});
	live.current = {
		count,
		speed,
		separation,
		alignment,
		cohesion,
		neighborRadius,
		separationRadius,
		cursorMode,
		cursorForce,
		cursorRadius,
		trail,
		color1,
		color2,
		paused: paused || reducedMotion,
	};

	const rebuildRef = useRef<(() => void) | null>(null);

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
		const ctx = canvas.getContext("2d", { alpha: false });
		if (!ctx) return;
		const grid = new Map<string, number[]>();

		function initBoids() {
			const { w, h } = sizeRef.current;
			const n = Math.max(1, Math.min(MAX_COUNT, Math.floor(live.current.count)));
			const sp = live.current.speed;
			const boids: Boid[] = new Array(n);
			for (let i = 0; i < n; i++) {
				const ang = Math.random() * Math.PI * 2;
				const v = sp * (0.5 + Math.random() * 0.5);
				boids[i] = {
					x: Math.random() * w,
					y: Math.random() * h,
					vx: Math.cos(ang) * v,
					vy: Math.sin(ang) * v,
					ax: 0,
					ay: 0,
				};
			}
			boidsRef.current = boids;
		}

		// One simulation tick: spatial-hash neighbor query → three steering urges
		// + cursor → integrate → wrap. Accelerations are computed from a coherent
		// snapshot (accumulated into ax/ay), then integrated in a second pass.
		function simulate() {
			const { w, h } = sizeRef.current;
			const p = live.current;
			const boids = boidsRef.current;
			const n = boids.length;
			if (n === 0 || w === 0) return;

			const nr = p.neighborRadius;
			const sr = p.separationRadius;
			const cell = Math.max(1, Math.max(nr, sr));
			const nr2 = nr * nr;
			const sr2 = sr * sr;
			const maxSpeed = p.speed;
			const maxForce = maxSpeed * 0.06;
			const minSpeed = maxSpeed * 0.5;

			grid.clear();
			for (let i = 0; i < n; i++) {
				const b = boids[i];
				const key = `${Math.floor(b.x / cell)},${Math.floor(b.y / cell)}`;
				let bucket = grid.get(key);
				if (!bucket) {
					bucket = [];
					grid.set(key, bucket);
				}
				bucket.push(i);
			}

			const m = mouseRef.current;
			const cursorOn = p.cursorMode !== "off" && p.cursorForce > 0 && p.cursorRadius > 0;
			const cr2 = p.cursorRadius * p.cursorRadius;
			const cDir = p.cursorMode === "repel" ? -1 : 1;

			for (let i = 0; i < n; i++) {
				const b = boids[i];
				const cx = Math.floor(b.x / cell);
				const cy = Math.floor(b.y / cell);
				let alignX = 0;
				let alignY = 0;
				let cohX = 0;
				let cohY = 0;
				let sepX = 0;
				let sepY = 0;
				let nCount = 0;
				let sCount = 0;

				for (let gx = cx - 1; gx <= cx + 1; gx++) {
					for (let gy = cy - 1; gy <= cy + 1; gy++) {
						const bucket = grid.get(`${gx},${gy}`);
						if (!bucket) continue;
						for (let k = 0; k < bucket.length; k++) {
							const j = bucket[k];
							if (j === i) continue;
							const o = boids[j];
							const dx = o.x - b.x;
							const dy = o.y - b.y;
							const d2 = dx * dx + dy * dy;
							if (d2 > nr2 || d2 === 0) continue;
							nCount++;
							alignX += o.vx;
							alignY += o.vy;
							cohX += o.x;
							cohY += o.y;
							if (d2 < sr2) {
								// away vector weighted by 1/dist → (b−o)/d²
								sepX += -dx / d2;
								sepY += -dy / d2;
								sCount++;
							}
						}
					}
				}

				let ax = 0;
				let ay = 0;

				if (nCount > 0) {
					// alignment — steer toward the average neighbor heading
					let dvx = alignX / nCount;
					let dvy = alignY / nCount;
					let mag = Math.hypot(dvx, dvy);
					if (mag > 0) {
						dvx = (dvx / mag) * maxSpeed;
						dvy = (dvy / mag) * maxSpeed;
						let sx = dvx - b.vx;
						let sy = dvy - b.vy;
						const sm = Math.hypot(sx, sy);
						if (sm > maxForce) {
							sx = (sx / sm) * maxForce;
							sy = (sy / sm) * maxForce;
						}
						ax += sx * p.alignment;
						ay += sy * p.alignment;
					}

					// cohesion — steer toward the local centroid
					let cxv = cohX / nCount - b.x;
					let cyv = cohY / nCount - b.y;
					mag = Math.hypot(cxv, cyv);
					if (mag > 0) {
						cxv = (cxv / mag) * maxSpeed;
						cyv = (cyv / mag) * maxSpeed;
						let sx = cxv - b.vx;
						let sy = cyv - b.vy;
						const sm = Math.hypot(sx, sy);
						if (sm > maxForce) {
							sx = (sx / sm) * maxForce;
							sy = (sy / sm) * maxForce;
						}
						ax += sx * p.cohesion;
						ay += sy * p.cohesion;
					}
				}

				if (sCount > 0) {
					// separation — steer away from crowding neighbors
					let mag = Math.hypot(sepX, sepY);
					if (mag > 0) {
						let dvx = (sepX / mag) * maxSpeed;
						let dvy = (sepY / mag) * maxSpeed;
						let sx = dvx - b.vx;
						let sy = dvy - b.vy;
						const sm = Math.hypot(sx, sy);
						if (sm > maxForce) {
							sx = (sx / sm) * maxForce;
							sy = (sy / sm) * maxForce;
						}
						ax += sx * p.separation;
						ay += sy * p.separation;
					}
				}

				if (cursorOn) {
					const dx = m.x - b.x;
					const dy = m.y - b.y;
					const d2 = dx * dx + dy * dy;
					if (d2 < cr2 && d2 > 0) {
						const d = Math.sqrt(d2);
						const falloff = (1 - d / p.cursorRadius) * p.cursorForce;
						const s = falloff * maxForce * 3 * cDir;
						ax += (dx / d) * s;
						ay += (dy / d) * s;
					}
				}

				b.ax = ax;
				b.ay = ay;
			}

			// integrate — apply accelerations, clamp speed window, advance, wrap
			for (let i = 0; i < n; i++) {
				const b = boids[i];
				b.vx += b.ax;
				b.vy += b.ay;
				const sp = Math.hypot(b.vx, b.vy);
				if (sp > maxSpeed) {
					b.vx = (b.vx / sp) * maxSpeed;
					b.vy = (b.vy / sp) * maxSpeed;
				} else if (sp > 0 && sp < minSpeed) {
					b.vx = (b.vx / sp) * minSpeed;
					b.vy = (b.vy / sp) * minSpeed;
				} else if (sp === 0) {
					const a = Math.random() * Math.PI * 2;
					b.vx = Math.cos(a) * minSpeed;
					b.vy = Math.sin(a) * minSpeed;
				}
				b.x += b.vx;
				b.y += b.vy;
				if (b.x < 0) b.x += w;
				else if (b.x >= w) b.x -= w;
				if (b.y < 0) b.y += h;
				else if (b.y >= h) b.y -= h;
			}
		}

		function warmUp() {
			for (let i = 0; i < WARMUP_STEPS; i++) simulate();
		}

		// fresh=true paints an opaque background (still frame / first frame /
		// post-resize); otherwise a translucent wash fades the motion trails.
		function render(fresh: boolean) {
			const { w, h } = sizeRef.current;
			const p = live.current;
			const boids = boidsRef.current;

			if (p.trail > 0 && !fresh) {
				ctx!.fillStyle = `rgba(${BG[0]},${BG[1]},${BG[2]},${1 - p.trail})`;
			} else {
				ctx!.fillStyle = `rgb(${BG[0]},${BG[1]},${BG[2]})`;
			}
			ctx!.fillRect(0, 0, w, h);

			const [r1, g1, b1] = hexToRgb(p.color1);
			const [r2, g2, b2] = hexToRgb(p.color2);
			const maxSpeed = p.speed;

			for (let i = 0; i < boids.length; i++) {
				const b = boids[i];
				const sp = Math.hypot(b.vx, b.vy);
				const t = maxSpeed > 0 ? Math.min(sp / maxSpeed, 1) : 0;
				const r = Math.round(r1 + (r2 - r1) * t);
				const g = Math.round(g1 + (g2 - g1) * t);
				const bl = Math.round(b1 + (b2 - b1) * t);
				const ang = Math.atan2(b.vy, b.vx);
				const cos = Math.cos(ang);
				const sin = Math.sin(ang);
				// velocity-oriented triangle, drawn without save/restore (cheaper at
				// 1000 boids): rotate the three local verts by hand.
				const nx = b.x + cos * 5;
				const ny = b.y + sin * 5;
				const lx = b.x + (-cos * 4 - sin * 3);
				const lyv = b.y + (-sin * 4 + cos * 3);
				const rx = b.x + (-cos * 4 + sin * 3);
				const ryv = b.y + (-sin * 4 - cos * 3);
				ctx!.beginPath();
				ctx!.moveTo(nx, ny);
				ctx!.lineTo(lx, lyv);
				ctx!.lineTo(rx, ryv);
				ctx!.closePath();
				ctx!.fillStyle = `rgb(${r},${g},${bl})`;
				ctx!.fill();
			}
		}

		measureRef.current = ({ width, height, dpr, bufferWidth, bufferHeight }) => {
			const w = Math.max(width, 1);
			const h = Math.max(height, 1);
			canvas!.width = bufferWidth;
			canvas!.height = bufferHeight;
			canvas!.style.width = `${w}px`;
			canvas!.style.height = `${h}px`;
			ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
			sizeRef.current = { w, h };
			initBoids();
			warmUp();
			render(true);
		};

		drawRef.current = () => {
			if (!live.current.paused) simulate();
			render(false);
			if (live.current.paused) {
				// bake a crisp still frame (trails would otherwise leave a smear
				// when the loop stops), then halt.
				render(true);
				return false;
			}
		};

		// Rebuild the flock on count change. While the loop runs, skip the warm-up
		// (the flock re-forms live and a 1000-boid warm-up would hitch a slider
		// drag); while paused, warm up so the still frame stays coherent.
		rebuildRef.current = () => {
			if (sizeRef.current.w === 0) return;
			initBoids();
			if (!loop.running) {
				warmUp();
				render(true);
			}
		};

		// Window-level pointer tracking: an overlay above the canvas would keep
		// element listeners from ever firing. Coordinates convert through the rect.
		function onPointerMove(e: PointerEvent) {
			const rect = canvas!.getBoundingClientRect();
			mouseRef.current.x = e.clientX - rect.left;
			mouseRef.current.y = e.clientY - rect.top;
		}
		function onPointerGone() {
			mouseRef.current.x = -1e5;
			mouseRef.current.y = -1e5;
		}
		function onPointerUp(e: PointerEvent) {
			if (e.pointerType !== "mouse") onPointerGone();
		}

		window.addEventListener("pointermove", onPointerMove, { passive: true });
		window.addEventListener("pointerup", onPointerUp, { passive: true });
		document.documentElement.addEventListener("pointerleave", onPointerGone);
		loop.resize();
		loop.start();

		return () => {
			drawRef.current = null;
			measureRef.current = null;
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerup", onPointerUp);
			document.documentElement.removeEventListener("pointerleave", onPointerGone);
			rebuildRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Only the population size rebuilds the boid array; every other prop is read
	// live from the ref inside the loop.
	useEffect(() => {
		rebuildRef.current?.();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [count]);

	return (
		<div ref={containerRef} className={`relative h-full w-full ${className}`}>
			<canvas
				ref={canvasRef}
				// touch-none: a finger drag steers the flock instead of scrolling the page.
				className="cursor-crosshair touch-none"
				style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
			/>
		</div>
	);
}
