"use client";

import { useEffect, useRef } from "react";
import { useIsDark } from "../hooks/use-is-dark";
import { useAnimationActive } from "../hooks/use-still";
import { useDimensions } from "../hooks/use-dimensions";

interface SpeedConfig {
	min: number;
	max: number;
}

class Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	radius: number;
	baseRadius: number;
	canvasWidth: number;
	canvasHeight: number;
	getSpeedConfig: () => SpeedConfig;
	particleColor: string;
	activeIndex: number | null;

	constructor(
		canvasWidth: number,
		canvasHeight: number,
		getSpeedConfig: () => SpeedConfig,
		particleColor: string,
		activeIndex: number | null
	) {
		this.canvasWidth = canvasWidth;
		this.canvasHeight = canvasHeight;
		this.getSpeedConfig = getSpeedConfig;
		this.particleColor = particleColor;
		this.activeIndex = activeIndex;

		this.x = Math.random() * canvasWidth;
		this.y = Math.random() * canvasHeight;

		const speeds = getSpeedConfig();
		const speedObj = Math.random() * (speeds.max - speeds.min) + speeds.min;
		const angle = Math.random() * Math.PI * 2;

		this.vx = Math.cos(angle) * speedObj;
		this.vy = Math.sin(angle) * speedObj;

		this.baseRadius = Math.random() * 2 + 1;
		this.radius = this.baseRadius;
	}

	update(mouseX: number, mouseY: number) {
		// Dynamic speed update based on current state
		const speeds = this.getSpeedConfig();

		// Gradually adjust velocity to target speed range
		const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
		const targetSpeed = Math.max(speeds.min, Math.min(currentSpeed, speeds.max));

		if (currentSpeed > 0) {
			this.vx = (this.vx / currentSpeed) * targetSpeed;
			this.vy = (this.vy / currentSpeed) * targetSpeed;
		}

		// Mouse repulsion interaction
		const dx = mouseX - this.x;
		const dy = mouseY - this.y;
		const dist = Math.sqrt(dx * dx + dy * dy);
		const interactionRadius = 150;

		if (dist < interactionRadius) {
			const forceDirectionX = dx / dist;
			const forceDirectionY = dy / dist;
			const force = (interactionRadius - dist) / interactionRadius;
			// Repel particles slightly
			this.x -= forceDirectionX * force * 2;
			this.y -= forceDirectionY * force * 2;
		}

		this.x += this.vx;
		this.y += this.vy;

		// Bounce off walls
		if (this.x < 0 || this.x > this.canvasWidth) this.vx *= -1;
		if (this.y < 0 || this.y > this.canvasHeight) this.vy *= -1;

		// Keep in bounds
		if (this.x < 0) this.x = 0;
		if (this.x > this.canvasWidth) this.x = this.canvasWidth;
		if (this.y < 0) this.y = 0;
		if (this.y > this.canvasHeight) this.y = this.canvasHeight;

		// Pulsing radius effect
		this.radius = this.baseRadius + Math.sin(Date.now() * 0.002 + this.x) * 0.5;
	}

	draw(ctx: CanvasRenderingContext2D) {
		ctx.beginPath();
		ctx.arc(this.x, this.y, Math.max(0.1, this.radius), 0, Math.PI * 2);
		ctx.fillStyle = this.particleColor;

		// Glowing effect
		ctx.shadowBlur = this.activeIndex === 2 ? 15 : 10; // More glow on execute
		ctx.shadowColor = this.particleColor;

		ctx.fill();
		ctx.shadowBlur = 0; // Reset for lines
	}
}

export default function ParticleCanvas({ activeIndex }: { activeIndex: number | null }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [isDark] = useIsDark();
	// Same gate as the world map: this loop is O(n^2) over the particle set, so
	// running it off-screen is the most expensive nothing on the page.
	const active = useAnimationActive(canvasRef);
	const { width, height } = useDimensions();

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		let animationFrameId: number;
		let particles: Particle[] = [];
		let mouseX = -1000;
		let mouseY = -1000;

				const particleColor = isDark ? "rgba(255, 255, 255, 0.4)" : "rgba(0, 0, 0, 0.4)";
		const lineColor = (alpha: number) =>
			isDark ? `rgba(255, 255, 255, ${alpha})` : `rgba(0, 0, 0, ${alpha})`;

		// Configuration based on active tab
		const getSpeedConfig = (): SpeedConfig => {
			switch (activeIndex) {
				case 0: return { min: 0.2, max: 0.5 }; // Assess: Slow, analytical
				case 1: return { min: 0.5, max: 1.0 }; // Plan: Structured movement
				case 2: return { min: 1.5, max: 3.0 }; // Execute: Fast, dynamic
				case 3: return { min: 0.3, max: 0.8 }; // Report: Steady
				default: return { min: 0.3, max: 0.8 };
			}
		};

		const init = () => {
			canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
			canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
			
			const numParticles = Math.floor((canvas.width * canvas.height) / 10000); // Responsive particle count
			particles = [];
			
			for (let i = 0; i < numParticles; i++) {
				particles.push(new Particle(canvas.width, canvas.height, getSpeedConfig, particleColor, activeIndex));
			}
		};

		const animate = () => {
			ctx.clearRect(0, 0, canvas.width, canvas.height);

			// Update & Draw
			particles.forEach((p) => {
				p.update(mouseX, mouseY);
				p.draw(ctx);
			});

			// Draw connections
			const connectDistance = activeIndex === 1 ? 180 : 120; // Plan connects more dots
			const connectDistanceSq = connectDistance * connectDistance;
			const mouseConnectDistance = 150;
			// Four opacity buckets: enough that the falloff still reads as continuous,
			// few enough that the whole link mesh costs four draw calls.
			const BUCKETS = 4;
			const linkPaths = Array.from({ length: BUCKETS }, () => new Path2D());

			for (let i = 0; i < particles.length; i++) {
				// Connect particle to mouse
				const mDx = mouseX - particles[i].x;
				const mDy = mouseY - particles[i].y;
				const mDist = Math.sqrt(mDx * mDx + mDy * mDy);
				
				if (mDist < mouseConnectDistance) {
					const alpha = 1 - mDist / mouseConnectDistance;
					ctx.beginPath();
					ctx.moveTo(particles[i].x, particles[i].y);
					ctx.lineTo(mouseX, mouseY);
					ctx.strokeStyle = lineColor(alpha * 0.8); // Slightly stronger line to mouse
					ctx.lineWidth = 1;
					ctx.stroke();
				}

				// Connect particle to other particles.
				//
				// Batched into a handful of paths rather than stroked per pair. This
				// loop is O(n^2) — at a couple of hundred particles that is tens of
				// thousands of iterations a frame — and a `stroke()` per connection
				// means a style change plus a draw call for each one. Bucketing the
				// opacity keeps the depth cue and collapses hundreds of draw calls
				// into BUCKETS of them.
				for (let j = i + 1; j < particles.length; j++) {
					const dx = particles[i].x - particles[j].x;
					const dy = particles[i].y - particles[j].y;
					// Compare squares: the square root is only needed for the alpha
					// ramp, and most pairs never get that far.
					const distSq = dx * dx + dy * dy;
					if (distSq >= connectDistanceSq) continue;

					const alpha = 1 - Math.sqrt(distSq) / connectDistance;
					const bucket = Math.min(
						BUCKETS - 1,
						Math.floor(alpha * BUCKETS),
					);
					linkPaths[bucket]!.moveTo(particles[i].x, particles[i].y);
					linkPaths[bucket]!.lineTo(particles[j].x, particles[j].y);
				}
			}

			ctx.lineWidth = 1;
			for (let b = 0; b < BUCKETS; b++) {
				// Mid-point of the bucket, so the ramp still reads as a gradient.
				ctx.strokeStyle = lineColor(((b + 0.5) / BUCKETS) * 0.5);
				ctx.stroke(linkPaths[b]!);
			}

			if (active) animationFrameId = requestAnimationFrame(animate);
		};

		const handleMouseMove = (e: MouseEvent) => {
			const rect = canvas.getBoundingClientRect();
			mouseX = e.clientX - rect.left;
			mouseY = e.clientY - rect.top;
		};

		const handleMouseLeave = () => {
			mouseX = -1000;
			mouseY = -1000;
		};

		canvas.addEventListener("mousemove", handleMouseMove);
		canvas.addEventListener("mouseleave", handleMouseLeave);

		init();
		animate();

		const handleResize = () => {
			init();
		};

		window.addEventListener("resize", handleResize);

		return () => {
			window.removeEventListener("resize", handleResize);
			canvas.removeEventListener("mousemove", handleMouseMove);
			canvas.removeEventListener("mouseleave", handleMouseLeave);
			cancelAnimationFrame(animationFrameId);
		};
	}, [isDark, width, height, activeIndex, active]);

	return (
		<canvas
			ref={canvasRef}
			className="absolute inset-0 w-full h-full cursor-crosshair"
			style={{
				background: "transparent",
				// Own compositor layer — see the note on the same pair of properties in
				// miscellaneous/interactive-world-map.tsx. A 2D canvas that repaints
				// every frame otherwise dirties the page raster around it, which is
				// ruinous for any host displaying this page through a CSS transform.
				transform: "translateZ(0)",
				willChange: "transform",
			}}
		/>
	);
}
