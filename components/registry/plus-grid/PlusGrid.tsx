"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

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
	color: "#a855f7",
	scrollSensitivity: 0.5,
	waveAmplitude: 12,
	waveFrequency: 0.35,
	waveSpeed: 0.045,
	waveDecay: 0.96,
	opacityVariance: 0.4,
	ambientAmplitude: 1.5,
	ambientSpeed: 0.008,
	cols: undefined,
	rows: undefined,
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

export interface PlusGridProps {
	config?: Partial<PlusGridConfig>;
	className?: string;
	/** Scrollable element whose scrollTop injects wave energy. Defaults to the
	 *  window — pass the overflow container when the grid lives in a pane.
	 *  Must be set before mount. */
	scrollContainerRef?: RefObject<HTMLElement | null>;
	/** Pointer movement over the grid injects wave energy. */
	pointerEnergy?: boolean;
	/** Fire a wave pulse every few seconds so the field demos itself hands-free. */
	autoPulse?: boolean;
	/** Freeze on a static frame (reduced motion / offscreen). */
	paused?: boolean;
}

export default function PlusGrid({
	config: userConfig,
	className,
	scrollContainerRef,
	pointerEnergy = true,
	autoPulse = true,
	paused = false,
}: PlusGridProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	/**
	 * Keep merged config in a ref so the GSAP ticker closure always reads the
	 * latest values without needing to re-register the ticker on prop change.
	 */
	const merged: PlusGridConfig = { ...PLUS_GRID_DEFAULTS, ...userConfig };
	const cfgRef = useRef<PlusGridConfig>(merged);
	cfgRef.current = merged;
	const flagsRef = useRef({ pointerEnergy, paused });
	flagsRef.current = { pointerEnergy, paused };
	const waveRef = useRef<WaveState>({ energy: 0, direction: 1, phase: 0 });
	const rebuildRef = useRef<(() => void) | null>(null);
	const drawRef = useRef<(() => void | false) | null>(null);
	const measureRef = useRef<((m: Metrics) => void) | null>(null);

	const loop = useAnimationLoop({
		target: containerRef,
		halted: paused,
		dpr: "auto",
		onResize: (metrics) => measureRef.current?.(metrics),
		onFrame: () => (drawRef.current ? drawRef.current() : false),
	});

	useEffect(() => {
		const container = containerRef.current;
		const canvas = canvasRef.current;
		if (!container || !canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		// ── Shared mutable state (no re-renders needed) ──────────────────────────
		let particles: Particle[] = [];
		let ambientPhase = 0;
		let fontFamily = "ui-monospace";
		// Applied dpr, kept for the tick's CSS-pixel maths. The host caps it — read
		// window.devicePixelRatio uncapped and a DPR-3 phone does 9x the pixel work.
		let dpr = 1;

		const wave = waveRef.current;
		const scroller = scrollContainerRef?.current ?? null;
		let lastScrollY = scroller ? scroller.scrollTop : window.scrollY;
		let lastPointerY: number | null = null;

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
		measureRef.current = ({ width: w, height: h, dpr: nextDpr, bufferWidth, bufferHeight }) => {
			dpr = nextDpr;
			canvas.width = bufferWidth;
			canvas.height = bufferHeight;
			canvas.style.width = `${w}px`;
			canvas.style.height = `${h}px`;

			// Re-apply dpr scale after resize (replaces the transform matrix)
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

			// Resolve the display font once per resize — getComputedStyle per tick
			// is wasteful.
			fontFamily =
				getComputedStyle(canvas).getPropertyValue("--font-display").trim() ||
				"ui-monospace";

			buildParticles(w, h);
		};

		// ── Energy injection: scroll delta on the scroller (or window) ───────────
		const injectEnergy = (delta: number, sensitivity: number) => {
			if (Math.abs(delta) < 0.5) return;
			wave.energy = Math.min(
				1,
				wave.energy + Math.abs(delta) * cfgRef.current.scrollSensitivity * sensitivity,
			);
			wave.direction = delta > 0 ? 1 : -1;
		};

		const onScroll = () => {
			const y = scroller ? scroller.scrollTop : window.scrollY;
			injectEnergy(y - lastScrollY, 0.038);
			lastScrollY = y;
		};

		// ── Energy injection: pointer movement over the grid ─────────────────────
		const onPointerMove = (e: PointerEvent) => {
			if (!flagsRef.current.pointerEnergy || flagsRef.current.paused) return;
			if (lastPointerY !== null) injectEnergy(e.clientY - lastPointerY, 0.02);
			lastPointerY = e.clientY;
		};
		const onPointerLeave = () => {
			lastPointerY = null;
		};

		const scrollTarget: HTMLElement | Window = scroller ?? window;
		scrollTarget.addEventListener("scroll", onScroll, { passive: true });
		container.addEventListener("pointermove", onPointerMove, { passive: true });
		container.addEventListener("pointerleave", onPointerLeave, {
			passive: true,
		});

		// ── Frame body, scheduled by the runtime host ───────────────────────────
		const tick = () => {
			const cfg = cfgRef.current;
			const isPaused = flagsRef.current.paused;
			const w = canvas.width / dpr;
			const h = canvas.height / dpr;

			ctx.clearRect(0, 0, w, h);

			// Advance wave and ambient phase — frozen while paused so the halt
			// frame below is genuinely static.
			if (!isPaused) {
				wave.energy = wave.energy * cfg.waveDecay;
				wave.phase += cfg.waveSpeed;
				ambientPhase += cfg.ambientSpeed;
			}

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
			ctx.globalAlpha = 1;

			// Paint one frame, then halt while paused — the mottled grid reads
			// well frozen. The host resumes on unpause.
			if (isPaused) return false;
		};
		drawRef.current = tick;

		loop.resize();
		loop.start();

		rebuildRef.current = () => {
			const w = container.clientWidth;
			const h = container.clientHeight;
			if (w > 0 && h > 0) buildParticles(w, h);
		};

		return () => {
			drawRef.current = null;
			measureRef.current = null;
			scrollTarget.removeEventListener("scroll", onScroll);
			container.removeEventListener("pointermove", onPointerMove);
			container.removeEventListener("pointerleave", onPointerLeave);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []); // intentionally runs once — live config reads via cfgRef

	// Auto-pulse: periodically feed the wave so the field demos itself.
	useEffect(() => {
		if (!autoPulse || paused) return;
		const id = setInterval(() => {
			const wave = waveRef.current;
			wave.energy = Math.max(wave.energy, 0.7);
			wave.direction *= -1;
		}, 2800);
		return () => clearInterval(id);
	}, [autoPulse, paused]);

	// Only layout-affecting values reposition the grid — everything else is
	// read live inside the ticker. Rebuilding also reshuffles the mottling,
	// so keep this scoped to real layout changes.
	useEffect(() => {
		rebuildRef.current?.();
	}, [merged.gapX, merged.gapY, merged.cols, merged.rows]);

	return (
		<div ref={containerRef} className={className ?? "h-full w-full"}>
			<canvas
				ref={canvasRef}
				// Absolutely positioned so the explicit pixel size we give the backing
				// store never feeds back into layout. In flow, a wide canvas raises the
				// container's min-content width, the container stops shrinking, the
				// ResizeObserver never fires, and the canvas is stuck at its old size.
				// touch-none: a finger drag drives the pointer wave instead of scrolling the
				// page. The scroll wave still fires from window scroll outside the grid.
				className="absolute inset-0 size-full touch-none"
				style={{ display: "block" }}
			/>
		</div>
	);
}
