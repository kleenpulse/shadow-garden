"use client";

import {
	type CSSProperties,
	type ReactNode,
	useEffect,
	useRef,
} from "react";
import { gsap } from "gsap";

import { cn } from "@/lib/utils";

export interface DissolveProps {
	/** The demo content, rendered as live DOM at rest. */
	children: ReactNode;
	/** Deterministic redraw of the `children` look onto a canvas, in CSS px.
	 *  Owns the pixel colors (theme-aware values come from the wrapper). */
	paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
	/** Toggle: false = intact DOM, true = disintegrated into motes. */
	dismissed?: boolean;
	/** Grid stride when sampling pixels into motes (px). */
	particleGap?: number;
	/** Max outward travel of a mote (px). */
	drift?: number;
	/** Per-mote tween length (s). */
	duration?: number;
	/** Directional-sweep spread of per-mote start delays (s). */
	stagger?: number;
	/** Downward (+) / upward-ash (-) bias on the outward path. -2..2. */
	gravity?: number;
	/** Angular jitter on each mote's outward vector. 0..2. */
	swirl?: number;
	/** When dismissed returns to false, tween motes back and restore the DOM. */
	reformOnTrigger?: boolean;
	/** Hex tint blended into every sampled pixel. */
	moteColor?: string;
	reducedMotion?: boolean;
	className?: string;
	style?: CSSProperties;
}

interface Mote {
	x0: number;
	y0: number;
	x: number;
	y: number;
	a: number;
	tx: number;
	ty: number;
	delay: number;
	rdelay: number;
	seed: number;
}

interface Bucket {
	style: string;
	items: Mote[];
}

const MAX_MOTES = 7000;
const OPAQUE = 128;
const MOTE_BLEND = 0.5;

function hexToRgb(hex: string): [number, number, number] {
	let h = hex.replace("#", "").trim();
	if (h.length === 3)
		h = h
			.split("")
			.map((c) => c + c)
			.join("");
	const n = Number.parseInt(h || "a855f7", 16);
	if (Number.isNaN(n)) return [168, 85, 247];
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Cheap deterministic hash → [0,1) so per-mote jitter is reproducible per seed.
function rand(seed: number): number {
	const x = Math.sin(seed * 127.1 + 11.7) * 43758.5453;
	return x - Math.floor(x);
}

export default function Dissolve({
	children,
	paint,
	dismissed = false,
	particleGap = 6,
	drift = 60,
	duration = 1,
	stagger = 0.4,
	gravity = 0.4,
	swirl = 0.6,
	reformOnTrigger = true,
	moteColor = "#a855f7",
	reducedMotion = false,
	className,
	style,
}: DissolveProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const wrapperRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
	const dprRef = useRef(1);
	const sizeRef = useRef({ w: 0, h: 0, gap: 6 });
	const motesRef = useRef<Mote[] | null>(null);
	const bucketsRef = useRef<Bucket[]>([]);
	const tlRef = useRef<gsap.core.Timeline | null>(null);
	const prevRef = useRef<boolean | null>(null);

	// Tuned props live in a ref, reassigned every render and read only when a
	// trigger fires — a slider drag never rebuilds the canvas context.
	const propsRef = useRef({
		particleGap,
		drift,
		duration,
		stagger,
		gravity,
		swirl,
		reformOnTrigger,
		moteColor,
		paint,
	});
	propsRef.current = {
		particleGap,
		drift,
		duration,
		stagger,
		gravity,
		swirl,
		reformOnTrigger,
		moteColor,
		paint,
	};

	// --- canvas helpers (ref-only reads → safe to close over from any effect) ---

	function sizeCanvas(w: number, h: number) {
		const canvas = canvasRef.current;
		const ctx = ctxRef.current;
		if (!canvas || !ctx) return;
		const dpr = dprRef.current;
		canvas.width = Math.max(1, Math.round(w * dpr));
		canvas.height = Math.max(1, Math.round(h * dpr));
		canvas.style.width = `${w}px`;
		canvas.style.height = `${h}px`;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	}

	function render() {
		const ctx = ctxRef.current;
		if (!ctx) return;
		const { w, h, gap } = sizeRef.current;
		ctx.clearRect(0, 0, w, h);
		const size = gap;
		for (const bk of bucketsRef.current) {
			ctx.fillStyle = bk.style;
			for (const m of bk.items) {
				if (m.a <= 0.02) continue;
				ctx.globalAlpha = m.a;
				ctx.fillRect(m.x, m.y, size, size);
			}
		}
		ctx.globalAlpha = 1;
	}

	function buildMotes(w: number, h: number): Mote[] {
		const ctx = ctxRef.current;
		if (!ctx) return [];
		const p = propsRef.current;
		const dpr = dprRef.current;

		// Author the pixels ourselves — no snapshot library.
		ctx.clearRect(0, 0, w, h);
		p.paint(ctx, w, h);

		const dw = Math.max(1, Math.round(w * dpr));
		const dh = Math.max(1, Math.round(h * dpr));
		const data = ctx.getImageData(0, 0, dw, dh).data;

		// Clamp mote count by raising the stride on large elements.
		let gap = Math.max(2, Math.round(p.particleGap));
		while ((w / gap) * (h / gap) > MAX_MOTES) gap++;

		const [mr, mg, mb] = hexToRgb(p.moteColor);
		const half = gap / 2;
		const cx = w / 2;
		const cy = h / 2;
		const motes: Mote[] = [];
		const buckets = new Map<number, Bucket>();
		let seed = 0;

		for (let gy = 0; gy < h; gy += gap) {
			for (let gx = 0; gx < w; gx += gap) {
				const dx = Math.min(dw - 1, Math.floor((gx + half) * dpr));
				const dy = Math.min(dh - 1, Math.floor((gy + half) * dpr));
				const idx = (dy * dw + dx) * 4;
				if (data[idx + 3] < OPAQUE) continue;

				// Blend the mote tint into the sampled pixel.
				const r = Math.round(data[idx] * (1 - MOTE_BLEND) + mr * MOTE_BLEND);
				const g = Math.round(
					data[idx + 1] * (1 - MOTE_BLEND) + mg * MOTE_BLEND,
				);
				const b = Math.round(
					data[idx + 2] * (1 - MOTE_BLEND) + mb * MOTE_BLEND,
				);

				const s = seed++;
				const ang0 = Math.atan2(gy + half - cy, gx + half - cx);
				const ang = ang0 + (rand(s * 1.7) - 0.5) * p.swirl * 1.6;
				const dist = p.drift * (0.45 + 0.55 * rand(s * 3.1));
				const tx = gx + Math.cos(ang) * dist;
				const ty =
					gy + Math.sin(ang) * dist + p.gravity * p.drift * 0.45;

				// Directional (left→right) sweep of start delays.
				const jit = rand(s * 5.3) * p.stagger * 0.15;
				const delay = (gx / w) * p.stagger + jit;
				const rdelay = (1 - gx / w) * p.stagger + jit;

				const m: Mote = {
					x0: gx,
					y0: gy,
					x: gx,
					y: gy,
					a: 1,
					tx,
					ty,
					delay,
					rdelay,
					seed: s,
				};
				motes.push(m);

				// Bucket by quantized color so fillStyle changes at most once per
				// bucket; per-mote alpha rides on globalAlpha instead.
				const qr = r & 0xf0;
				const qg = g & 0xf0;
				const qb = b & 0xf0;
				const key = (qr << 16) | (qg << 8) | qb;
				let bk = buckets.get(key);
				if (!bk) {
					bk = { style: `rgb(${qr},${qg},${qb})`, items: [] };
					buckets.set(key, bk);
				}
				bk.items.push(m);
			}
		}

		bucketsRef.current = [...buckets.values()];
		sizeRef.current = { w, h, gap };
		return motes;
	}

	function dissolve() {
		const wrap = wrapperRef.current;
		const canvas = canvasRef.current;
		if (!wrap || !canvas) return;
		const rect = wrap.getBoundingClientRect();
		const w = rect.width;
		const h = rect.height;
		if (w < 1 || h < 1) return;

		sizeCanvas(w, h);
		const motes = buildMotes(w, h);
		motesRef.current = motes;

		canvas.style.display = "block";
		wrap.style.visibility = "hidden";
		render();

		tlRef.current?.kill();
		if (motes.length === 0) return;

		const dur = propsRef.current.duration;
		const tl = gsap.timeline({ onUpdate: render });
		for (const m of motes) {
			tl.to(
				m,
				{ x: m.tx, y: m.ty, a: 0, duration: dur, ease: "power2.out" },
				m.delay,
			);
		}
		tlRef.current = tl;
	}

	function reform() {
		const motes = motesRef.current;
		const wrap = wrapperRef.current;
		const canvas = canvasRef.current;
		if (!wrap || !canvas) return;

		// Nothing to reverse — just restore the resting DOM.
		if (!motes || motes.length === 0) {
			wrap.style.visibility = "visible";
			canvas.style.display = "none";
			return;
		}

		tlRef.current?.kill();
		const dur = propsRef.current.duration;
		const tl = gsap.timeline({
			onUpdate: render,
			onComplete: () => {
				wrap.style.visibility = "visible";
				canvas.style.display = "none";
				const ctx = ctxRef.current;
				const { w, h } = sizeRef.current;
				if (ctx) ctx.clearRect(0, 0, w, h);
			},
		});
		for (const m of motes) {
			tl.to(
				m,
				{ x: m.x0, y: m.y0, a: 1, duration: dur, ease: "power2.inOut" },
				m.rdelay,
			);
		}
		tlRef.current = tl;
	}

	// One-time canvas setup + resize repaint (holds size even while halted).
	useEffect(() => {
		const canvas = canvasRef.current;
		const wrap = wrapperRef.current;
		if (!canvas || !wrap) return;
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) return;
		ctxRef.current = ctx;
		dprRef.current = Math.min(window.devicePixelRatio || 1, 2);

		const ro = new ResizeObserver(() => {
			// Only repaint when the canvas is the visible layer.
			if (canvas.style.display === "none" || !motesRef.current) return;
			const rect = wrap.getBoundingClientRect();
			if (rect.width < 1 || rect.height < 1) return;
			sizeCanvas(rect.width, rect.height);
			sizeRef.current = {
				...sizeRef.current,
				w: rect.width,
				h: rect.height,
			};
			render();
		});
		ro.observe(wrap);

		return () => {
			ro.disconnect();
			tlRef.current?.kill();
			tlRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Trigger: dissolve / reform on `dismissed`, honoring reduced motion.
	useEffect(() => {
		const wrap = wrapperRef.current;
		const canvas = canvasRef.current;
		if (!wrap) return;

		const prev = prevRef.current;
		prevRef.current = dismissed;

		if (reducedMotion) {
			// No motes: instant cross-fade of the DOM element.
			tlRef.current?.kill();
			tlRef.current = null;
			motesRef.current = null;
			if (canvas) canvas.style.display = "none";
			wrap.style.transition = "opacity 0.3s ease";
			wrap.style.visibility = "visible";
			wrap.style.opacity = dismissed ? "0" : "1";
			wrap.style.pointerEvents = dismissed ? "none" : "";
			return;
		}

		// Clear any reduced-motion remnants when animating.
		wrap.style.transition = "";
		wrap.style.opacity = "";
		wrap.style.pointerEvents = "";

		if (dismissed) {
			dissolve();
		} else if (prev !== null && propsRef.current.reformOnTrigger) {
			reform();
		} else if (prev === null) {
			// Fresh mount, intact: ensure resting state.
			wrap.style.visibility = "visible";
			if (canvas) canvas.style.display = "none";
		}
		// If reformOnTrigger is false, stay dissolved until re-toggled.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [dismissed, reducedMotion]);

	return (
		<div
			ref={containerRef}
			className={cn("relative inline-block", className)}
			style={style}
		>
			<div ref={wrapperRef}>{children}</div>
			<canvas
				ref={canvasRef}
				aria-hidden
				style={{
					position: "absolute",
					inset: 0,
					display: "none",
					pointerEvents: "none",
				}}
			/>
		</div>
	);
}
