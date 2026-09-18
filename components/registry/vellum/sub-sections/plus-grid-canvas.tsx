"use client";

import gsap from "gsap";
import { useEffect, useRef } from "react";

// ── Tunable Config ────────────────────────────────────────────────────────────
export interface PlusGridConfig {
	/** Horizontal gap between particles (px) */
	gapX: number;
	/** Vertical gap between particles (px) */
	gapY: number;
	fontSize: number;
	fontWeight: number;
	baseOpacity: number;
	color: string;
	scrollSensitivity: number;
	/** Peak Y displacement per particle at full energy (px) */
	waveAmplitude: number;
	/** Spatial frequency of wave across columns — higher = tighter ripples */
	waveFrequency: number;
	/** Phase advance per GSAP tick — controls ripple travel speed */
	waveSpeed: number;
	/** Energy decay multiplier per tick (0.90 = snappy, 0.99 = lingering) */
	waveDecay: number;
	/** Opacity oscillation magnitude during wave (0–1) */
	opacityVariance: number;
	/** Subtle idle drift even when not scrolling */
	ambientAmplitude: number;
	/** Idle drift speed */
	ambientSpeed: number;
	cols?: number;
	rows?: number;
}

export const PLUS_GRID_DEFAULTS: PlusGridConfig = {
	gapX: 42,
	gapY: 38,
	fontSize: 20,
	fontWeight: 400,
	baseOpacity: 0.5,
	color: "#242424",
	scrollSensitivity: 0.5,
	waveAmplitude: 12,
	waveFrequency: 0.35,
	waveSpeed: 0.045,
	waveDecay: 0.96,
	opacityVariance: 0.4,
	ambientAmplitude: 0,
	ambientSpeed: 0.008,
	cols: undefined,
	rows: 6,
};
// ─────────────────────────────────────────────────────────────────────────────

interface Particle {
	x: number;
	y: number;
	col: number;
	row: number;
	/** Static per-particle opacity variation — gives the depth illusion */
	opacityMod: number;
}

interface WaveState {
	energy: number; // 0–1, decays each tick
	direction: number; // +1 = scroll down, -1 = scroll up
	phase: number; // advances each tick
}

export interface PlusGridCanvasProps {
	config?: Partial<PlusGridConfig>;
	className?: string;
}

export default function PlusGridCanvas({
	config: userConfig,
	className,
}: PlusGridCanvasProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	/**
	 * Keep merged config in a ref so the GSAP ticker closure always reads the
	 * latest values without needing to re-register the ticker on prop change.
	 */
	const cfgRef = useRef<PlusGridConfig>({
		...PLUS_GRID_DEFAULTS,
		...userConfig,
	});

	// Sync config ref when props change
	useEffect(() => {
		cfgRef.current = { ...PLUS_GRID_DEFAULTS, ...userConfig };
	}, [userConfig]);

	useEffect(() => {
		const container = containerRef.current;
		const canvas = canvasRef.current;
		if (!container || !canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;

		// ── Shared mutable state (no re-renders needed) ──────────────────────────
		let particles: Particle[] = [];
		let ambientPhase = 0;

		const wave: WaveState = { energy: 0, direction: 1, phase: 0 };
		let lastScrollY = window.scrollY;

		// ── Build / rebuild particle positions to fill container ─────────────────
		const buildParticles = (w: number, h: number) => {
			const { gapX, gapY, cols: manualCols, rows: manualRows } = cfgRef.current;
			const cols = manualCols ?? Math.max(1, Math.floor(w / gapX));
			const rows = manualRows ?? Math.max(1, Math.floor(h / gapY));
			const offsetX = (w - (cols - 1) * gapX) / 2;
			const offsetY = (h - (rows - 1) * gapY) / 2;

			particles = [];
			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < cols; c++) {
					particles.push({
						x: offsetX + c * gapX,
						y: offsetY + r * gapY,
						col: c,
						row: r,
						/**
						 * Create a "mottled" effect by using a skewed random distribution.
						 * Most particles will be faint, some will be crisp.
						 */
						opacityMod:
							Math.random() > 0.45
								? 0.9 + Math.random() * 0.1
								: 0.08 + Math.random() * 0.15,
					});
				}
			}
		};

		// ── HiDPI-aware resize + particle rebuild ────────────────────────────────
		const handleResize = () => {
			const w = container.clientWidth;
			const h = container.clientHeight;

			canvas.width = w * dpr;
			canvas.height = h * dpr;
			canvas.style.width = `${w}px`;
			canvas.style.height = `${h}px`;

			// Re-apply dpr scale after resize (replaces the transform matrix)
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

			buildParticles(w, h);
		};

		const ro = new ResizeObserver(handleResize);
		ro.observe(container);
		handleResize();

		// ── Scroll → wave energy injection ───────────────────────────────────────
		const onScroll = () => {
			const delta = window.scrollY - lastScrollY;
			lastScrollY = window.scrollY;
			if (Math.abs(delta) < 0.5) return;

			const cfg = cfgRef.current;
			wave.energy = Math.min(
				1,
				wave.energy + Math.abs(delta) * cfg.scrollSensitivity * 0.038,
			);
			wave.direction = delta > 0 ? 1 : -1;
		};

		window.addEventListener("scroll", onScroll, { passive: true });

		// ── GSAP ticker — single rAF-synced loop ──────────────────────────────────
		const tick = () => {
			const cfg = cfgRef.current;
			const w = canvas.width / dpr;
			const h = canvas.height / dpr;

			ctx.clearRect(0, 0, w, h);

			// Advance wave and ambient phase
			wave.energy = wave.energy * cfg.waveDecay;
			wave.phase += cfg.waveSpeed;
			ambientPhase += cfg.ambientSpeed;

			// Resolve font family from CSS variable
			const fontFamily =
				getComputedStyle(canvas).getPropertyValue("--font-body") ||
				"ui-monospace";
			ctx.font = `${cfg.fontWeight} ${cfg.fontSize}px ${fontFamily}, ui-monospace, SFMono-Regular, monospace`;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillStyle = cfg.color;

			for (const p of particles) {
				const spatialArg = p.col * cfg.waveFrequency + wave.phase;

				// Scroll-driven wave displacement
				const scrollY =
					Math.sin(spatialArg) *
					cfg.waveAmplitude *
					wave.energy *
					wave.direction;

				// Subtle idle drift (always-on, very small)
				const idleY =
					Math.sin(p.col * 0.3 + p.row * 0.4 + ambientPhase) *
					cfg.ambientAmplitude;

				// Opacity pulse follows scroll wave with a phase offset
				const opacityDelta =
					Math.cos(spatialArg) * cfg.opacityVariance * wave.energy;

				const opacity = Math.max(
					0.04,
					Math.min(0.95, cfg.baseOpacity * p.opacityMod + opacityDelta),
				);

				ctx.globalAlpha = opacity;
				ctx.fillText("+", p.x, p.y + scrollY + idleY);
			}
		};

		gsap.ticker.add(tick);

		return () => {
			gsap.ticker.remove(tick);
			ro.disconnect();
			window.removeEventListener("scroll", onScroll);
		};
	}, []); // intentionally runs once — live config reads via cfgRef

	return (
		<div ref={containerRef} className={className}>
			<canvas
				ref={canvasRef}
				className="size-full"
				style={{ display: "block" }}
			/>
		</div>
	);
}
