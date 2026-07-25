"use client";

import { useEffect, useRef } from "react";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

interface WorldMapAsciiProps {
	/** Particle color (any CSS color). */
	color: string;
	/** Dot radius in px. */
	particleSize: number;
	/** Particle density — higher packs more particles (heavier). */
	density: number;
	/** Cursor interaction radius in px; 0 disables the scatter. */
	mouseRadius: number;
	/** Idle wobble amplitude; 0 freezes the map. */
	drift: number;
	/** Manually freeze the render loop (pause / reduced motion). */
	paused?: boolean;
}

interface ParticleData {
	x: number;
	y: number;
	baseX: number;
	baseY: number;
	density: number;
}

function updateParticle(
	p: ParticleData,
	mouseX: number,
	mouseY: number,
	t: number,
	mouseRadius: number,
	drift: number,
) {
	const dx = mouseX - p.x;
	const dy = mouseY - p.y;
	const distSq = dx * dx + dy * dy;
	const maxDistSq = mouseRadius * mouseRadius;

	if (mouseRadius > 0 && distSq < maxDistSq) {
		const distance = Math.sqrt(distSq);
		const force = (mouseRadius - distance) / mouseRadius;
		p.x -= (dx / distance) * force * p.density;
		p.y -= (dy / distance) * force * p.density;
	} else {
		const rx = p.x - p.baseX;
		const ry = p.y - p.baseY;
		if (rx !== 0) p.x -= rx / 15;
		if (ry !== 0) p.y -= ry / 15;
	}

	p.x += Math.sin(t + p.baseY) * drift;
	p.y += Math.cos(t + p.baseX) * drift;
}

export default function WorldMapAscii({
	color,
	particleSize,
	density,
	mouseRadius,
	drift,
	paused = false,
}: WorldMapAsciiProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const drawRef = useRef<((now: number) => void | false) | null>(null);
	const measureRef = useRef<((m: Metrics) => void) | null>(null);

	const loop = useAnimationLoop({
		target: containerRef,
		halted: paused,
		// Particle coordinates are in CSS pixels, matching the previous sizing.
		dpr: 1,
		resizeDebounceMs: 150,
		onResize: (metrics) => measureRef.current?.(metrics),
		onFrame: ({ now }) => (drawRef.current ? drawRef.current(now) : false),
	});

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext("2d", { alpha: true });
		if (!ctx) return;

		let mouseX = -1000;
		let mouseY = -1000;
		let particles: ParticleData[] = [];

		const mapImage = new Image();

		const initMap = () => {
			if (canvas.width === 0 || canvas.height === 0) return;

			const imgW = mapImage.naturalWidth || mapImage.width;
			const imgH = mapImage.naturalHeight || mapImage.height;
			if (imgW === 0 || imgH === 0) return;

			particles = [];

			const offscreenCanvas = document.createElement("canvas");
			const offscreenCtx = offscreenCanvas.getContext("2d", {
				willReadFrequently: true,
			});
			if (!offscreenCtx) return;

			const imgRatio = imgW / imgH;
			let drawWidth = canvas.width;
			let drawHeight = drawWidth / imgRatio;

			if (drawHeight > canvas.height) {
				drawHeight = canvas.height;
				drawWidth = drawHeight * imgRatio;
			}

			const offsetX = (canvas.width - drawWidth) / 2;
			const offsetY = (canvas.height - drawHeight) / 2;

			offscreenCanvas.width = canvas.width;
			offscreenCanvas.height = canvas.height;
			offscreenCtx.drawImage(mapImage, offsetX, offsetY, drawWidth, drawHeight);

			const imageData = offscreenCtx.getImageData(
				0,
				0,
				canvas.width,
				canvas.height,
			);
			const pixels = imageData.data;

			// Higher density → smaller sampling gap → more particles. Floor gap at 2.
			const res = Math.max(2, Math.round(11 - density));

			for (let y = 0; y < canvas.height; y += res) {
				for (let x = 0; x < canvas.width; x += res) {
					if (pixels[(y * canvas.width + x) * 4 + 3] > 50) {
						particles.push({
							x,
							y,
							baseX: x,
							baseY: y,
							density: Math.random() * 30 + 10,
						});
					}
				}
			}
		};

		const animate = (now: number) => {
			ctx.clearRect(0, 0, canvas.width, canvas.height);

			const t = now * 0.001;
			const len = particles.length;

			// Batch all draws: set state once, single path, single fill
			ctx.fillStyle = color;
			ctx.beginPath();
			for (let i = 0; i < len; i++) {
				const p = particles[i];
				updateParticle(p, mouseX, mouseY, t, mouseRadius, drift);
				ctx.moveTo(p.x + particleSize, p.y);
				ctx.arc(p.x, p.y, particleSize, 0, Math.PI * 2);
			}
			ctx.fill();

			// Halt while paused — render this frame, then stop issuing draw calls
			// (the loop used to run forever even at drift 0).
			if (paused) return false;
		};
		drawRef.current = animate;

		measureRef.current = ({ width, height }) => {
			canvas.width = width;
			canvas.height = height;
			initMap();
		};

		// The image may resolve after unmount. The old code re-armed a rAF from
		// here with a handle nothing tracked, so cleanup could not cancel it and
		// the loop resurrected itself past teardown.
		mapImage.onload = () => {
			loop.resize();
			loop.start();
		};
		mapImage.src = "/world-map.svg";

		if (mapImage.complete) {
			loop.resize();
			loop.start();
		}

		// Pointer, not mouse: a touch drag emits no `mousemove`, so a mouse-only
		// binding leaves the reveal inert on a phone.
		const handlePointerMove = (e: PointerEvent) => {
			mouseX = e.offsetX;
			mouseY = e.offsetY;
		};

		const handlePointerLeave = () => {
			mouseX = -1000;
			mouseY = -1000;
		};

		canvas.addEventListener("pointermove", handlePointerMove);
		canvas.addEventListener("pointerleave", handlePointerLeave);
		canvas.addEventListener("pointercancel", handlePointerLeave);

		return () => {
			drawRef.current = null;
			measureRef.current = null;
			// Detach so a late-resolving image cannot reach back in.
			mapImage.onload = null;
			canvas.removeEventListener("pointermove", handlePointerMove);
			canvas.removeEventListener("pointerleave", handlePointerLeave);
			canvas.removeEventListener("pointercancel", handlePointerLeave);
		};
	}, [color, particleSize, density, mouseRadius, drift, paused, loop]);

	return (
		<div ref={containerRef} className="absolute inset-0 overflow-hidden">
			{/* touch-none: a finger drag reveals the map instead of scrolling the page. */}
			<canvas ref={canvasRef} className="block h-full w-full touch-none" />
		</div>
	);
}
