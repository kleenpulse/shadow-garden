"use client";

import { useEffect, useRef, memo } from "react";

const TWO_PI = Math.PI * 2;

interface ConstellationProps {
	/** Up to three colors distributed across the particles. Connection lines
	 *  blend between their endpoints' colors; cursor links glow toward white. */
	colors?: string[];
	/** Particle density relative to area (particles ≈ area / 10000 × density). */
	density?: number;
	/** Top drift speed of particles, px per frame. */
	speed?: number;
	/** Max distance for particle-to-particle lines, in px. */
	connectDistance?: number;
	/** Cursor link + repel radius, in px. 0 disables cursor interaction. */
	cursorDistance?: number;
	/** Push strength inside the cursor radius. */
	repelForce?: number;
	/** Opacity multiplier on connection lines. */
	lineOpacity?: number;
	/** Particle glow blur. 0 skips the (expensive) shadow pass entirely. */
	glow?: number;
	/** Halt the canvas loop after one static frame (reduced motion / offscreen). */
	paused?: boolean;
	[key: string]: unknown;
}

interface Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	baseRadius: number;
	radius: number;
	colorIndex: number;
}

type Rgb = [number, number, number];

const DEFAULT_COLORS = ["#a855f7", "#ff9207", "#22d3ee"];

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

/** Lift a channel toward white — gives cursor links their glowing hub. */
function lift(c: number): number {
	return Math.round(c + (255 - c) * 0.65);
}

const Constellation = memo(
	({
		colors = DEFAULT_COLORS,
		density = 1,
		speed = 0.8,
		connectDistance = 120,
		cursorDistance = 150,
		repelForce = 2,
		lineOpacity = 0.5,
		glow = 10,
		paused = false,
		...rest
	}: ConstellationProps) => {
		const canvasRef = useRef<HTMLCanvasElement>(null);
		const particlesRef = useRef<Particle[]>([]);
		const mouseRef = useRef({ x: -1000, y: -1000 });
		const sizeRef = useRef({ w: 0, h: 0 });
		const rafRef = useRef<number | null>(null);
		const propsRef = useRef({
			colors,
			density,
			speed,
			connectDistance,
			cursorDistance,
			repelForce,
			lineOpacity,
			glow,
			paused,
		});
		propsRef.current = {
			colors,
			density,
			speed,
			connectDistance,
			cursorDistance,
			repelForce,
			lineOpacity,
			glow,
			paused,
		};
		const rebuildRef = useRef<(() => void) | null>(null);
		const startLoopRef = useRef<(() => void) | null>(null);

		useEffect(() => {
			const canvas = canvasRef.current;
			if (!canvas) return;
			const ctx = canvas.getContext("2d", { alpha: true });
			if (!ctx) return;
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			let resizeTimer: ReturnType<typeof setTimeout>;
			let frame = 0;
			let running = false;

			function initParticles() {
				const { w, h } = sizeRef.current;
				const p = propsRef.current;
				// Cap guards the O(n²) connection pass on large panes.
				const count = Math.max(
					8,
					Math.min(250, Math.floor(((w * h) / 10000) * p.density)),
				);
				const max = p.speed;
				const min = p.speed * 0.4;
				const particles: Particle[] = new Array(count);
				for (let i = 0; i < count; i++) {
					const v = Math.random() * (max - min) + min;
					const angle = Math.random() * TWO_PI;
					const baseRadius = Math.random() * 2 + 1;
					particles[i] = {
						x: Math.random() * w,
						y: Math.random() * h,
						vx: Math.cos(angle) * v,
						vy: Math.sin(angle) * v,
						baseRadius,
						radius: baseRadius,
						colorIndex: Math.floor(Math.random() * 3),
					};
				}
				particlesRef.current = particles;
			}

			function doResize() {
				const rect = canvas!.parentElement!.getBoundingClientRect();
				const w = rect.width;
				const h = rect.height;
				canvas!.width = w * dpr;
				canvas!.height = h * dpr;
				canvas!.style.width = `${w}px`;
				canvas!.style.height = `${h}px`;
				ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
				sizeRef.current = { w, h };
				initParticles();
			}

			function tick() {
				frame++;
				const p = propsRef.current;
				const { w, h } = sizeRef.current;
				const particles = particlesRef.current;
				const m = mouseRef.current;
				const animate = !p.paused;
				const maxSpeed = p.speed;
				const minSpeed = p.speed * 0.4;
				const t = frame * 0.033;

				ctx!.clearRect(0, 0, w, h);

				for (let i = 0; i < particles.length; i++) {
					const pt = particles[i];
					if (animate) {
						// Steer the drift back into the live speed window so the speed
						// slider takes effect without rebuilding the field.
						const cur = Math.sqrt(pt.vx * pt.vx + pt.vy * pt.vy);
						if (cur > 0) {
							const target = Math.max(minSpeed, Math.min(cur, maxSpeed));
							pt.vx = (pt.vx / cur) * target;
							pt.vy = (pt.vy / cur) * target;
						}

						if (p.cursorDistance > 0) {
							const dx = m.x - pt.x;
							const dy = m.y - pt.y;
							const dist = Math.sqrt(dx * dx + dy * dy);
							if (dist < p.cursorDistance && dist > 0) {
								const force = (p.cursorDistance - dist) / p.cursorDistance;
								pt.x -= (dx / dist) * force * p.repelForce;
								pt.y -= (dy / dist) * force * p.repelForce;
							}
						}

						pt.x += pt.vx;
						pt.y += pt.vy;

						if (pt.x < 0 || pt.x > w) pt.vx *= -1;
						if (pt.y < 0 || pt.y > h) pt.vy *= -1;
						if (pt.x < 0) pt.x = 0;
						if (pt.x > w) pt.x = w;
						if (pt.y < 0) pt.y = 0;
						if (pt.y > h) pt.y = h;

						pt.radius = pt.baseRadius + Math.sin(t + pt.x) * 0.5;
					} else {
						pt.radius = pt.baseRadius;
					}
				}

				const palette: Rgb[] =
					p.colors.length > 0
						? p.colors.map(hexToRgb)
						: [hexToRgb(DEFAULT_COLORS[0])];
				const colorOf = (pt: Particle) => palette[pt.colorIndex % palette.length];

				for (let i = 0; i < particles.length; i++) {
					const pt = particles[i];
					const [r, g, b] = colorOf(pt);
					ctx!.beginPath();
					ctx!.arc(pt.x, pt.y, Math.max(0.1, pt.radius), 0, TWO_PI);
					ctx!.fillStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
					if (p.glow > 0) {
						// shadowBlur alone is faint on 1–3px dots — amplify the radius
						// and stamp the fill twice so the halo actually reads.
						ctx!.shadowBlur = p.glow * 2.5;
						ctx!.shadowColor = `rgb(${r}, ${g}, ${b})`;
						ctx!.fill();
						ctx!.fill();
						ctx!.shadowBlur = 0;
					} else {
						ctx!.fill();
					}
				}

				const connect = p.connectDistance;
				ctx!.lineWidth = 1;
				for (let i = 0; i < particles.length; i++) {
					const pi = particles[i];
					const [ri, gi, bi] = colorOf(pi);

					if (p.cursorDistance > 0) {
						const mDx = m.x - pi.x;
						const mDy = m.y - pi.y;
						const mDist = Math.sqrt(mDx * mDx + mDy * mDy);
						if (mDist < p.cursorDistance) {
							const alpha = Math.min(
								1,
								(1 - mDist / p.cursorDistance) * p.lineOpacity * 1.6,
							);
							// Particle color at the particle, lifted toward white at the
							// pointer — the cursor reads as a bright hub the lines feed.
							const grad = ctx!.createLinearGradient(pi.x, pi.y, m.x, m.y);
							grad.addColorStop(0, `rgba(${ri}, ${gi}, ${bi}, ${alpha})`);
							grad.addColorStop(
								1,
								`rgba(${lift(ri)}, ${lift(gi)}, ${lift(bi)}, ${alpha})`,
							);
							ctx!.beginPath();
							ctx!.moveTo(pi.x, pi.y);
							ctx!.lineTo(m.x, m.y);
							ctx!.strokeStyle = grad;
							ctx!.stroke();
						}
					}

					for (let j = i + 1; j < particles.length; j++) {
						const pj = particles[j];
						const dx = pi.x - pj.x;
						const dy = pi.y - pj.y;
						const distSq = dx * dx + dy * dy;
						if (distSq < connect * connect) {
							const alpha =
								(1 - Math.sqrt(distSq) / connect) * p.lineOpacity;
							ctx!.beginPath();
							ctx!.moveTo(pi.x, pi.y);
							ctx!.lineTo(pj.x, pj.y);
							if (pi.colorIndex === pj.colorIndex) {
								ctx!.strokeStyle = `rgba(${ri}, ${gi}, ${bi}, ${alpha})`;
							} else {
								// Mixed-color pair: blend the line between both endpoint hues.
								const [rj, gj, bj] = colorOf(pj);
								const grad = ctx!.createLinearGradient(pi.x, pi.y, pj.x, pj.y);
								grad.addColorStop(0, `rgba(${ri}, ${gi}, ${bi}, ${alpha})`);
								grad.addColorStop(1, `rgba(${rj}, ${gj}, ${bj}, ${alpha})`);
								ctx!.strokeStyle = grad;
							}
							ctx!.stroke();
						}
					}
				}

				// Paint one frame, then halt while paused — reduced-motion still shows
				// a populated constellation. startLoop resumes on unpause.
				if (propsRef.current.paused) {
					running = false;
					return;
				}
				rafRef.current = requestAnimationFrame(tick);
			}

			function startLoop() {
				if (running) return;
				running = true;
				rafRef.current = requestAnimationFrame(tick);
			}
			startLoopRef.current = startLoop;

			// Window-level pointer tracking (DotField pattern) — the showcase stage
			// overlays the canvas, so element-level listeners never fire there.
			// Coordinates convert through the canvas rect; a pointer outside the
			// pane is simply too far from every particle to matter.
			function onPointerMove(e: PointerEvent) {
				const rect = canvas!.getBoundingClientRect();
				mouseRef.current.x = e.clientX - rect.left;
				mouseRef.current.y = e.clientY - rect.top;
			}
			function onPointerGone() {
				mouseRef.current.x = -1000;
				mouseRef.current.y = -1000;
			}
			// A lifted finger leaves no hover — release the field. Mouse buttons
			// releasing don't move the pointer, so they keep the link.
			function onPointerUp(e: PointerEvent) {
				if (e.pointerType !== "mouse") onPointerGone();
			}

			const parent = canvas.parentElement!;
			const observer = new ResizeObserver(() => {
				clearTimeout(resizeTimer);
				resizeTimer = setTimeout(doResize, 100);
			});

			doResize();
			observer.observe(parent);
			window.addEventListener("pointermove", onPointerMove, { passive: true });
			window.addEventListener("pointerup", onPointerUp, { passive: true });
			document.documentElement.addEventListener("pointerleave", onPointerGone);
			startLoop();

			rebuildRef.current = () => {
				if (sizeRef.current.w > 0) initParticles();
			};

			return () => {
				running = false;
				if (rafRef.current) cancelAnimationFrame(rafRef.current);
				clearTimeout(resizeTimer);
				observer.disconnect();
				window.removeEventListener("pointermove", onPointerMove);
				window.removeEventListener("pointerup", onPointerUp);
				document.documentElement.removeEventListener(
					"pointerleave",
					onPointerGone,
				);
			};
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, []);

		// Only density changes the particle population — everything else is read
		// live from propsRef inside the loop.
		useEffect(() => {
			rebuildRef.current?.();
		}, [density]);

		// Resume the canvas loop when unpausing — tick self-halts while paused.
		useEffect(() => {
			if (!paused) startLoopRef.current?.();
		}, [paused]);

		return (
			<div className="relative h-full w-full" {...rest}>
				<canvas
					ref={canvasRef}
					className="cursor-crosshair"
					style={{
						position: "absolute",
						inset: 0,
						width: "100%",
						height: "100%",
					}}
				/>
			</div>
		);
	},
);

Constellation.displayName = "Constellation";

export default Constellation;
