"use client";

import { useEffect, useRef } from "react";
import { useIsDark } from "../hooks/use-is-dark";
import { useAnimationActive } from "../hooks/use-still";
import { asset } from "../../_shared/cdn";

const CONFIG = {
	mouseRadius: 120, // px — interaction radius around the cursor
};

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
) {
	const dx = mouseX - p.x;
	const dy = mouseY - p.y;
	const distSq = dx * dx + dy * dy;
	const maxDistance = CONFIG.mouseRadius;
	const maxDistSq = maxDistance * maxDistance;

	if (distSq < maxDistSq) {
		const distance = Math.sqrt(distSq);
		const force = (maxDistance - distance) / maxDistance;
		p.x -= (dx / distance) * force * p.density;
		p.y -= (dy / distance) * force * p.density;
	} else {
		const rx = p.x - p.baseX;
		const ry = p.y - p.baseY;
		if (rx !== 0) p.x -= rx / 15;
		if (ry !== 0) p.y -= ry / 15;
	}

	p.x += Math.sin(t + p.baseY) * 0.05;
	p.y += Math.cos(t + p.baseX) * 0.05;
}

export default function InteractiveWorldMap() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [isDark] = useIsDark();
	// Reduced motion, the host pause control, and scrolling past the hero all mean
	// the same thing to a rAF loop: stop. Ungated this field kept redrawing itself
	// for the whole page.
	const active = useAnimationActive(canvasRef);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext("2d", { alpha: true });
		if (!ctx) return;

		let animationFrameId: number;
		let mouseX = -1000;
		let mouseY = -1000;
		let particles: ParticleData[] = [];

				const fillColor = isDark
			? "rgba(255, 255, 255, 0.5)"
			: "rgba(0, 0, 0, 0.5)";
		const mapImage = new Image();
		// The map is read back with getImageData to build the dot field, and a
		// cross-origin draw taints the canvas — so the CORS request is not
		// optional here, it is the difference between a map and a SecurityError.
		// Cloudinary serves delivery URLs with Access-Control-Allow-Origin: *.
		mapImage.crossOrigin = "anonymous";

		/**
		 * Size the backing store from the canvas box, never from the window.
		 *
		 * The element is `w-full h-full` inside its container, so `window.innerWidth`
		 * was only ever coincidentally the right number — and inside an embedded frame
		 * it is not the right number at all. A backing store that disagrees with the
		 * CSS box gets stretched by the browser, and `offsetX`/`offsetY` stop mapping
		 * to the coordinates the particles live in, so the cursor repulsion drifts
		 * away from the cursor.
		 *
		 * It is also the difference between painting the pixels that are on screen and
		 * painting however many the host viewport happens to imply.
		 */
		const measure = () => {
			const rect = canvas.getBoundingClientRect();
			const width = Math.round(rect.width);
			const height = Math.round(rect.height);
			if (width === 0 || height === 0) return false;
			canvas.width = width;
			canvas.height = height;
			return true;
		};

		/**
		 * The field the hero falls back to when the map bitmap never arrives —
		 * offline, a blocked CDN, a delivery URL that has not been uploaded yet.
		 *
		 * Not a nicety. Everything the section does — the cursor repulsion, the
		 * drift, the depth — is a property of the particle field, not of the
		 * geography. Seeding it procedurally means one failed request costs the
		 * hero its map and nothing else, instead of leaving a blank canvas where
		 * the headline is supposed to sit.
		 */
		const seedFallbackField = () => {
			if (!measure()) return;

			particles = [];
			const res = canvas.width < 768 ? 14 : 18;
			const cx = canvas.width / 2;
			const cy = canvas.height / 2;
			// Elliptical falloff, so the field reads as a deliberate mass in the
			// middle of the stage rather than a full-bleed grid.
			const rx = canvas.width * 0.42;
			const ry = canvas.height * 0.3;

			for (let y = 0; y < canvas.height; y += res) {
				for (let x = 0; x < canvas.width; x += res) {
					const dx = (x - cx) / rx;
					const dy = (y - cy) / ry;
					const d = dx * dx + dy * dy;
					if (d > 1) continue;
					if (Math.random() > 1 - d * 0.8) continue;
					particles.push({
						x,
						y,
						baseX: x,
						baseY: y,
						density: Math.random() * 30 + 10,
					});
				}
			}
		};

		const initMap = () => {
			if (!measure()) return;

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

			// A tainted canvas throws here rather than firing onerror — a CDN that
			// answers without CORS headers takes this path, not the one above.
			let pixels: Uint8ClampedArray;
			try {
				pixels = offscreenCtx.getImageData(
					0,
					0,
					canvas.width,
					canvas.height,
				).data;
			} catch {
				seedFallbackField();
				return;
			}

			const res = canvas.width < 768 ? 3 : 4;

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
			ctx.fillStyle = fillColor;
			ctx.beginPath();
			for (let i = 0; i < len; i++) {
				const p = particles[i];
				updateParticle(p, mouseX, mouseY, t);
				ctx.moveTo(p.x + 0.7, p.y);
				ctx.arc(p.x, p.y, 0.7, 0, Math.PI * 2);
			}
			ctx.fill();

			// One frame is always painted so the map is visible when held still;
			// only the NEXT frame is conditional.
			if (active) animationFrameId = requestAnimationFrame(animate);
		};

		mapImage.onload = () => {
			initMap();
			animationFrameId = requestAnimationFrame(animate);
		};

		mapImage.onerror = () => {
			seedFallbackField();
			animationFrameId = requestAnimationFrame(animate);
		};
		mapImage.src = asset("vellum/world-map", { transform: "w_1600" });

		if (mapImage.complete) {
			requestAnimationFrame(() => {
				initMap();
				animationFrameId = requestAnimationFrame(animate);
			});
		}

		const handleMouseMove = (e: MouseEvent) => {
			mouseX = e.offsetX;
			mouseY = e.offsetY;
		};

		const handleMouseLeave = () => {
			mouseX = -1000;
			mouseY = -1000;
		};

		canvas.addEventListener("mousemove", handleMouseMove);
		canvas.addEventListener("mouseleave", handleMouseLeave);

		let resizeTimer: ReturnType<typeof setTimeout>;
		const handleResize = () => {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => {
				cancelAnimationFrame(animationFrameId);
				initMap();
				animationFrameId = requestAnimationFrame(animate);
			}, 150);
		};

		window.addEventListener("resize", handleResize);

		return () => {
			window.removeEventListener("resize", handleResize);
			canvas.removeEventListener("mousemove", handleMouseMove);
			canvas.removeEventListener("mouseleave", handleMouseLeave);
			cancelAnimationFrame(animationFrameId);
			clearTimeout(resizeTimer);
		};
	}, [isDark, active]);

	return (
		<div className="absolute inset-0 z-0 pointer-events-auto overflow-hidden size-full">
			<canvas
				ref={canvasRef}
				className="w-full h-full"
				style={{
					background: "transparent",
					// Promote the canvas to its own compositor layer.
					//
					// A 2D canvas paints into the page's raster rather than owning a GPU
					// texture the way a WebGL one does. Without this, every frame it
					// repaints dirties the surrounding surface, and any host that is
					// rendering this page through a CSS transform — an embedded, scaled
					// preview — has to re-rasterise and resample that whole surface at
					// 60fps. Same page, same work, but smooth unscaled and visibly
					// stuttering scaled, which is exactly how the symptom presents.
					//
					// Given its own layer, the compositor swaps one texture per frame and
					// the rest of the page stays where it is.
					transform: "translateZ(0)",
					willChange: "transform",
				}}
			/>
		</div>
	);
}
