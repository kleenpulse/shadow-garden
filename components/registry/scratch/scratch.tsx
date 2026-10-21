"use client";

import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	useSyncExternalStore,
	type ReactNode,
} from "react";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A scratch-off card. Two canvases sit over the content you pass in: the foil,
// which the pointer erases, and an effects layer above it that carries the
// falling flakes and the light that moves across the foil.
//
// **The foil is a canvas you erase, not a mask you rebuild.** Every move strokes
// `destination-out` from the last point to this one with round caps, so the
// scratch stays continuous at any speed. Strokes are kept as segments in
// fractions of the card, because resizing a canvas clears it: on resize the foil
// repaints from its seed and replays the strokes, and the scratch lands where it
// was.
//
// **Coverage is counted, not sampled.** Reading pixels back with getImageData
// stalls the GPU on every move. A coarse grid of cells is marked as each segment
// passes over it, so "how much is gone" costs a handful of distance checks.
//
// **Light only lands on foil that is left.** The glint is drawn on the effects
// layer and then cut with `destination-in` against the foil canvas, so it never
// shines across a hole you already scratched.
//
// **It only ticks when something moves.** Flakes, the reveal fade and the glint
// keep the loop alive; when none of them need a frame, the frame returns `false`
// and the loop sleeps. Pausing stops the glint only. Scratching still works,
// because it is something you do, not something the card does by itself.

export interface ScratchProps {
	/** What the foil hides. */
	children?: ReactNode;
	/** Width of the scratch, in px. */
	brushSize?: number;
	/** Percent of the foil that has to come off before the rest falls away. */
	threshold?: number;
	/** How long the leftover foil takes to fade out, in ms. */
	revealDuration?: number;
	/** Foil flakes fall from where you scratch. */
	flakes?: boolean;
	/** A light sweeps across the foil now and then. */
	glint?: boolean;
	/** The color of the light that sweeps across the foil. */
	glintColor?: string;
	/** The foil. Its flakes take their color from it. */
	foilColor?: string;
	/** Fires once, when the content is fully revealed. */
	onReveal?: () => void;
	/** Accessible name of the covered card. */
	label?: string;
	/** Stops the glint. Scratching still works. */
	paused?: boolean;
	/** No flakes and no glint, and the reveal is instant. */
	reducedMotion?: boolean;
	className?: string;
}

type Phase = "covered" | "clearing" | "revealed";
type Rgb = [number, number, number];
type Stop = [number, string];

/** One stroke, in fractions of the card so it survives a resize. */
interface Segment {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
	/** Brush width as a fraction of the card's width. */
	w: number;
	/** Seeds the ragged edge, so a replay chips the same notches. */
	seed: number;
}

interface Flake {
	alive: boolean;
	x: number;
	y: number;
	vx: number;
	vy: number;
	age: number;
	w: number;
	h: number;
	rot: number;
	rotV: number;
	spin: number;
	spinV: number;
	tone: number;
}

/** Coverage cells across the card; rows follow the aspect ratio. */
const GRID = 40;
/** Strokes kept for replay. Past this the scratch still works, it just stops being remembered. */
const MAX_SEGMENTS = 4000;
const POOL = 140;
const GRAVITY = 1500;
const FLAKE_LIFE = 0.9;
const FLAKE_FADE = 0.3;
/** One flake per this many px of stroke. */
const FLAKE_EVERY = 7;
const FLAKES_PER_SEGMENT = 4;
const GLINT_PERIOD = 3.2;
const GLINT_SWEEP = 0.9;
/** A whole number of glint periods, so the clock can wrap without a jump. */
const SHEEN_PERIOD = GLINT_PERIOD * 3;
/** The torn edge: a dark lip right at the cut, then a bright burr past it, px. */
const LIP = 0.8;
const BURR = 0.9;
/** The light travels along this direction; its bands lean the other way. */
const ANGLE = (20 * Math.PI) / 180;
const NX = Math.cos(ANGLE);
const NY = Math.sin(ANGLE);
const TAU = Math.PI * 2;
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
const FOIL_FALLBACK: Rgb = [201, 195, 214];
const GLINT_FALLBACK: Rgb = [168, 85, 247];

export default function Scratch({
	children,
	brushSize = 34,
	threshold = 55,
	revealDuration = 450,
	flakes = true,
	glint = true,
	glintColor = "#a855f7",
	foilColor = "#c9c3d6",
	onReveal,
	label = "Scratch to reveal",
	paused = false,
	reducedMotion = false,
	className = "",
}: ScratchProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const fxRef = useRef<HTMLCanvasElement>(null);
	const foilRef = useRef<HTMLCanvasElement>(null);

	const systemReduced = useSyncExternalStore(
		subscribeReducedMotion,
		readReducedMotion,
		readReducedMotionOnServer,
	);
	const still = reducedMotion || systemReduced;

	const [revealed, setRevealed] = useState(false);
	// The foil's stand-in until the canvas has painted. It is in the server HTML,
	// so the content never flashes uncovered before hydration, and it is frozen at
	// its first value so React never writes it back over a scratched foil.
	const [veil] = useState(() => veilFor(foilColor));

	const live = useRef({
		brushSize,
		threshold,
		revealDuration,
		flakes,
		glint,
		glintColor,
		foilColor,
		paused,
		still,
		onReveal,
	});
	useLayoutEffect(() => {
		live.current = {
			brushSize,
			threshold,
			revealDuration,
			flakes,
			glint,
			glintColor,
			foilColor,
			paused,
			still,
			onReveal,
		};
	});

	const drawRef = useRef<((dt: number) => void | false) | null>(null);
	const measureRef = useRef<((m: Metrics) => void) | null>(null);
	const refoilRef = useRef<(() => void) | null>(null);
	const focusOnReveal = useRef(false);

	const loop = useAnimationLoop({
		target: rootRef,
		dpr: "auto",
		onResize: (m) => measureRef.current?.(m),
		onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
	});

	useEffect(() => {
		const root = rootRef.current;
		const fx = fxRef.current;
		const foil = foilRef.current;
		if (!root || !fx || !foil) return;
		const fxCtx = fx.getContext("2d");
		const foilCtx = foil.getContext("2d");
		if (!fxCtx || !foilCtx) return;

		let W = 0;
		let H = 0;
		let dpr = 1;
		let phase: Phase = "covered";
		let fadeT = 0;
		// Starts just short of a sweep, so the first glint arrives within a second.
		let clock = GLINT_PERIOD - 0.6;

		const segments: Segment[] = [];
		let scratched = false;
		let gridRows = 0;
		let cells = new Uint8Array(0);
		let marked = 0;

		let pointer: number | null = null;
		let lastX = 0;
		let lastY = 0;
		let carry = 0;

		const pool: Flake[] = Array.from({ length: POOL }, () => ({
			alive: false,
			x: 0,
			y: 0,
			vx: 0,
			vy: 0,
			age: 0,
			w: 0,
			h: 0,
			rot: 0,
			rotV: 0,
			spin: 0,
			spinV: 0,
			tone: 1,
		}));
		let nextFlake = 0;
		let flying = 0;
		const rand = mulberry32(0x9e3779b9);

		let foilRgb = FOIL_FALLBACK;
		let lipStyle = "#000";
		let burrStyle = "#fff";
		let grain: CanvasPattern | null = null;

		let lightFor = "";
		let sheen: Stop[] = [];
		let shade: Stop[] = [];
		let halo: Stop[] = [];
		let core: Stop[] = [];
		let trail: Stop[] = [];
		let flashRgb = WHITE;
		const tune = () => {
			const key = live.current.glintColor;
			if (key === lightFor) return;
			lightFor = key;
			const g = parseColor(key, GLINT_FALLBACK);
			sheen = soft(WHITE, 0.1);
			shade = soft(BLACK, 0.07);
			halo = soft(g, 0.3);
			core = soft(mix(g, WHITE, 0.72), 0.78);
			trail = soft(mix(g, WHITE, 0.5), 0.42);
			flashRgb = mix(g, WHITE, 0.65);
		};

		const makeGrain = (): CanvasPattern | null => {
			const tile = document.createElement("canvas");
			tile.width = 96;
			tile.height = 96;
			const t = tile.getContext("2d");
			if (!t) return null;
			const img = t.createImageData(96, 96);
			const r = mulberry32(0x51f15e);
			for (let i = 0; i < img.data.length; i += 4) {
				const v = Math.floor(r() * 256);
				img.data[i] = v;
				img.data[i + 1] = v;
				img.data[i + 2] = v;
				img.data[i + 3] = 255;
			}
			t.putImageData(img, 0, 0);
			return foilCtx.createPattern(tile, "repeat");
		};

		const paintFoil = () => {
			const base = parseColor(live.current.foilColor, FOIL_FALLBACK);
			foilRgb = base;
			lipStyle = rgba(mix(base, BLACK, 0.45), 1);
			burrStyle = rgba(mix(base, WHITE, 0.7), 1);
			const ctx = foilCtx;
			ctx.globalCompositeOperation = "source-over";
			ctx.globalAlpha = 1;
			ctx.clearRect(0, 0, W, H);

			// Metal reads as metal because of its banding: the bright and dark
			// streaks of the room it reflects, running across the sheet on a slant.
			const band = ctx.createLinearGradient(0, 0, W, H);
			band.addColorStop(0, rgba(mix(base, WHITE, 0.32), 1));
			band.addColorStop(0.17, rgba(mix(base, BLACK, 0.05), 1));
			band.addColorStop(0.36, rgba(mix(base, WHITE, 0.45), 1));
			band.addColorStop(0.52, rgba(mix(base, BLACK, 0.16), 1));
			band.addColorStop(0.69, rgba(mix(base, WHITE, 0.24), 1));
			band.addColorStop(0.85, rgba(mix(base, BLACK, 0.1), 1));
			band.addColorStop(1, rgba(mix(base, WHITE, 0.28), 1));
			ctx.fillStyle = band;
			ctx.fillRect(0, 0, W, H);

			const fall = ctx.createLinearGradient(0, 0, 0, H);
			fall.addColorStop(0, "rgba(255,255,255,0.12)");
			fall.addColorStop(0.45, "rgba(255,255,255,0)");
			fall.addColorStop(1, "rgba(0,0,0,0.12)");
			ctx.fillStyle = fall;
			ctx.fillRect(0, 0, W, H);

			grain ??= makeGrain();
			if (grain) {
				ctx.globalCompositeOperation = "overlay";
				ctx.globalAlpha = 0.08;
				ctx.fillStyle = grain;
				ctx.fillRect(0, 0, W, H);
				ctx.globalAlpha = 1;
				ctx.globalCompositeOperation = "source-over";
			}

			// Brushed grain: short, fine parallel streaks of uneven strength, seeded
			// so a repaint is identical. Long even lines read as ruled paper.
			const r = mulberry32(0x2c1b3c6d);
			ctx.lineCap = "butt";
			for (let i = 0; i < 140; i++) {
				const y = r() * H;
				const len = W * (0.12 + r() * 0.45);
				const x = r() * (W + len) - len;
				const drift = (r() - 0.5) * 2;
				const alpha = (0.03 + r() * 0.04).toFixed(3);
				ctx.strokeStyle = r() < 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
				ctx.lineWidth = 0.35 + r() * 0.5;
				ctx.beginPath();
				ctx.moveTo(x, y);
				ctx.lineTo(x + len, y + drift);
				ctx.stroke();
			}

			// A faint pressed diamond lattice: a light line with a dark one a pixel
			// under it, so the pattern looks stamped into the foil, not printed on.
			const k = Math.tan((32 * Math.PI) / 180);
			const reach = W * k;
			ctx.lineWidth = 1;
			for (let pass = 0; pass < 2; pass++) {
				const dy = pass;
				ctx.strokeStyle = pass === 0 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
				ctx.beginPath();
				for (let b = -reach; b < H + reach; b += 15) {
					ctx.moveTo(0, b + dy);
					ctx.lineTo(W, b + reach + dy);
					ctx.moveTo(0, b + dy);
					ctx.lineTo(W, b - reach + dy);
				}
				ctx.stroke();
			}

			ctx.fillStyle = "rgba(255,255,255,0.4)";
			ctx.fillRect(0, 0, W, 1);
			ctx.fillStyle = "rgba(255,255,255,0.18)";
			ctx.fillRect(0, 0, 1, H);
			ctx.fillStyle = "rgba(0,0,0,0.16)";
			ctx.fillRect(0, H - 1, W, 1);
			ctx.fillRect(W - 1, 0, 1, H);
		};

		// Erase one segment. Shared by the live stroke and the resize replay, so
		// both cut the same shape.
		const carve = (s: Segment) => {
			const x0 = s.x0 * W;
			const y0 = s.y0 * H;
			// A zero-length path draws no caps, so a tap is nudged into a dot.
			const x1 = s.x1 * W + (s.x1 === s.x0 && s.y1 === s.y0 ? 0.01 : 0);
			const y1 = s.y1 * H;
			const lw = s.w * W;
			const ctx = foilCtx;
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			ctx.beginPath();
			ctx.moveTo(x0, y0);
			ctx.lineTo(x1, y1);
			// The torn lip: a dark line at the edge with a bright burr outside it,
			// so the foil reads as a sheet with thickness over light content and
			// dark content alike. Both are painted only onto foil that is left,
			// then the cut hollows out the middle.
			ctx.globalCompositeOperation = "source-atop";
			ctx.strokeStyle = burrStyle;
			ctx.lineWidth = lw + (LIP + BURR) * 2;
			ctx.stroke();
			ctx.strokeStyle = lipStyle;
			ctx.lineWidth = lw + LIP * 2;
			ctx.stroke();
			ctx.globalCompositeOperation = "destination-out";
			ctx.lineWidth = lw;
			ctx.stroke();

			// Pinhead nibbles right at the edge, so the cut is torn rather than a
			// clean vector stroke. Kept at a pixel or so: any bigger and they read
			// as a row of beads.
			const r = mulberry32(s.seed);
			const dx = x1 - x0;
			const dy = y1 - y0;
			const len = Math.hypot(dx, dy);
			const ux = len > 0 ? dx / len : 1;
			const uy = len > 0 ? dy / len : 0;
			const n = Math.min(4, 1 + Math.floor(len / 6));
			ctx.fillStyle = "#000";
			ctx.beginPath();
			for (let i = 0; i < n; i++) {
				const t = r();
				const side = r() < 0.5 ? -1 : 1;
				const off = (lw * 0.5 + 0.1 + r() * 0.9) * side;
				const nib = 0.45 + r() * 0.75;
				const cx = x0 + dx * t - uy * off;
				const cy = y0 + dy * t + ux * off;
				ctx.moveTo(cx + nib, cy);
				ctx.arc(cx, cy, nib, 0, TAU);
			}
			ctx.fill();
			ctx.globalCompositeOperation = "source-over";
		};

		// Mark every coverage cell whose centre the cut reached. 0.9 of the
		// radius, so a cell only counts once it is properly cleared.
		const mark = (s: Segment) => {
			if (W <= 0 || gridRows <= 0) return;
			const x0 = s.x0 * W;
			const y0 = s.y0 * H;
			const x1 = s.x1 * W;
			const y1 = s.y1 * H;
			const reach = s.w * W * 0.45;
			const cw = W / GRID;
			const ch = H / gridRows;
			const c0 = Math.max(0, Math.floor((Math.min(x0, x1) - reach) / cw));
			const c1 = Math.min(GRID - 1, Math.floor((Math.max(x0, x1) + reach) / cw));
			const r0 = Math.max(0, Math.floor((Math.min(y0, y1) - reach) / ch));
			const r1 = Math.min(gridRows - 1, Math.floor((Math.max(y0, y1) + reach) / ch));
			const dx = x1 - x0;
			const dy = y1 - y0;
			const len2 = dx * dx + dy * dy;
			const reach2 = reach * reach;
			for (let row = r0; row <= r1; row++) {
				const cy = (row + 0.5) * ch;
				for (let col = c0; col <= c1; col++) {
					const i = row * GRID + col;
					if (cells[i]) continue;
					const cx = (col + 0.5) * cw;
					let t = len2 > 0 ? ((cx - x0) * dx + (cy - y0) * dy) / len2 : 0;
					t = t < 0 ? 0 : t > 1 ? 1 : t;
					const ex = x0 + dx * t - cx;
					const ey = y0 + dy * t - cy;
					if (ex * ex + ey * ey <= reach2) {
						cells[i] = 1;
						marked++;
					}
				}
			}
		};

		const spawn = (x0: number, y0: number, x1: number, y1: number, radius: number) => {
			const l = live.current;
			if (!l.flakes || l.still) return;
			const dx = x1 - x0;
			const dy = y1 - y0;
			const len = Math.hypot(dx, dy);
			carry += len;
			const n = Math.min(FLAKES_PER_SEGMENT, Math.floor(carry / FLAKE_EVERY));
			if (n <= 0) return;
			// Capped, so one fast flick cannot bank a burst for the next stroke.
			carry = Math.min(carry - n * FLAKE_EVERY, FLAKE_EVERY);
			const ux = len > 0 ? dx / len : 0;
			const uy = len > 0 ? dy / len : 0;
			for (let i = 0; i < n; i++) {
				// Oldest first when the pool is full: a long scrub keeps shedding.
				const f = pool[nextFlake];
				nextFlake = (nextFlake + 1) % POOL;
				if (!f.alive) flying++;
				const t = rand();
				const side = (rand() - 0.5) * radius * 1.4;
				f.alive = true;
				f.x = x0 + dx * t - uy * side;
				f.y = y0 + dy * t + ux * side;
				f.vx = -ux * 60 + (rand() * 2 - 1) * 80;
				f.vy = -40 + (rand() * 2 - 1) * 60;
				f.age = 0;
				f.w = 3 + rand() * 3;
				f.h = 3 + rand() * 3;
				f.rot = rand() * TAU;
				f.rotV = (rand() * 2 - 1) * 7;
				f.spin = rand() * TAU;
				f.spinV = (rand() < 0.5 ? -1 : 1) * (7 + rand() * 9);
				f.tone = 0.82 + rand() * 0.3;
			}
		};

		const stepFlakes = (dt: number) => {
			flying = 0;
			for (const f of pool) {
				if (!f.alive) continue;
				f.age += dt;
				if (f.age >= FLAKE_LIFE || f.y > H + 12) {
					f.alive = false;
					continue;
				}
				f.vy += GRAVITY * dt;
				f.x += f.vx * dt;
				f.y += f.vy * dt;
				f.rot += f.rotV * dt;
				f.spin += f.spinV * dt;
				flying++;
			}
		};

		const quad = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
			fxCtx.beginPath();
			fxCtx.moveTo(x + ax + bx, y + ay + by);
			fxCtx.lineTo(x - ax + bx, y - ay + by);
			fxCtx.lineTo(x - ax - bx, y - ay - by);
			fxCtx.lineTo(x + ax - bx, y + ay - by);
			fxCtx.closePath();
			fxCtx.fill();
		};

		const drawFlakes = () => {
			const [fr, fg, fb] = foilRgb;
			for (const f of pool) {
				if (!f.alive) continue;
				const fade = f.age > FLAKE_LIFE - FLAKE_FADE ? (FLAKE_LIFE - f.age) / FLAKE_FADE : 1;
				// A tumbling flake brightens as it turns to face you and thins to
				// a sliver edge-on. That flicker is what sells it as foil.
				const face = Math.abs(Math.cos(f.spin));
				const lit = (0.6 + 0.4 * face) * f.tone;
				const spark = face > 0.9 ? (face - 0.9) * 6 : 0;
				const r = Math.min(255, fr * lit + (255 - fr * lit) * spark);
				const g = Math.min(255, fg * lit + (255 - fg * lit) * spark);
				const b = Math.min(255, fb * lit + (255 - fb * lit) * spark);
				const cos = Math.cos(f.rot);
				const sin = Math.sin(f.rot);
				const hw = f.w / 2;
				const hh = (f.h / 2) * Math.max(0.15, face);
				const ax = hw * cos;
				const ay = hw * sin;
				const bx = -hh * sin;
				const by = hh * cos;
				// A hard little shadow, so a pale flake still separates from the
				// pale foil it falls across.
				fxCtx.fillStyle = `rgba(0,0,0,${(0.3 * fade).toFixed(3)})`;
				quad(f.x + 0.8, f.y + 1.2, ax, ay, bx, by);
				fxCtx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${fade.toFixed(3)})`;
				quad(f.x, f.y, ax, ay, bx, by);
			}
		};

		// Fill only the slanted strip a band touches, with a gradient across it.
		const sweep = (center: number, half: number, stops: Stop[]) => {
			const a = center - half;
			const b = center + half;
			const xa = Math.max(0, (a - H * NY) / NX);
			const xb = Math.min(W, b / NX);
			if (xb <= xa) return;
			const g = fxCtx.createLinearGradient(NX * a, NY * a, NX * b, NY * b);
			for (const [t, c] of stops) g.addColorStop(t, c);
			fxCtx.fillStyle = g;
			fxCtx.fillRect(xa, 0, xb - xa, H);
		};

		const paintLight = () => {
			const P = W * NX + H * NY;
			// A slow, wide drift of light and shadow keeps the foil alive between
			// glints, the way metal shifts as you move your head.
			const drift = (clock / SHEEN_PERIOD) * TAU;
			sweep(P * (0.5 + 0.45 * Math.sin(drift)), P * 0.45, sheen);
			sweep(P * (0.5 - 0.45 * Math.sin(drift + 1.1)), P * 0.32, shade);
			const t = clock % GLINT_PERIOD;
			if (t < GLINT_SWEEP) {
				const u = 0.5 - 0.5 * Math.cos((t / GLINT_SWEEP) * Math.PI);
				const half = P * 0.2;
				const c = -half + u * (P + half * 2);
				sweep(c, half, halo);
				sweep(c + P * 0.012, P * 0.04, core);
				sweep(c - P * 0.1, P * 0.016, trail);
			}
		};

		const finish = () => {
			phase = "revealed";
			pointer = null;
			foil.style.opacity = "0";
			foil.style.visibility = "hidden";
			focusOnReveal.current = root.contains(document.activeElement);
			setRevealed(true);
			live.current.onReveal?.();
		};

		const reveal = () => {
			if (phase !== "covered") return;
			pointer = null;
			const l = live.current;
			if (l.still || l.revealDuration <= 0) finish();
			else {
				phase = "clearing";
				fadeT = 0;
			}
			loop.start();
		};

		drawRef.current = (dt) => {
			if (W <= 0 || H <= 0) return false;
			const l = live.current;
			tune();
			if (phase === "clearing" && l.still) finish();

			stepFlakes(dt);

			let foilAlpha = phase === "revealed" ? 0 : 1;
			let flash = 0;
			if (phase === "clearing") {
				fadeT += dt;
				const e = Math.min(1, fadeT / Math.max(0.001, l.revealDuration / 1000));
				foilAlpha = 1 - e * e * (3 - 2 * e);
				// A brief flare as the foil lets go, on its own short clock so a
				// long fade does not stretch it into a glow.
				flash = fadeT < 0.07 ? fadeT / 0.07 : Math.max(0, 1 - (fadeT - 0.07) / 0.28);
				foil.style.opacity = foilAlpha.toFixed(3);
				if (e >= 1) {
					finish();
					foilAlpha = 0;
				}
			}

			const showGlint = l.glint && !l.still && phase !== "revealed";
			const runGlint = showGlint && !l.paused && phase === "covered";
			if (runGlint) clock = (clock + dt) % SHEEN_PERIOD;

			fxCtx.clearRect(0, 0, W, H);
			if (foilAlpha > 0 && (showGlint || flash > 0)) {
				fxCtx.globalAlpha = foilAlpha;
				if (showGlint) paintLight();
				if (flash > 0) {
					fxCtx.fillStyle = rgba(flashRgb, 0.6 * flash);
					fxCtx.fillRect(0, 0, W, H);
				}
				fxCtx.globalAlpha = 1;
				if (scratched) {
					fxCtx.globalCompositeOperation = "destination-in";
					fxCtx.setTransform(1, 0, 0, 1, 0, 0);
					fxCtx.drawImage(foil, 0, 0);
					fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
					fxCtx.globalCompositeOperation = "source-over";
				}
			}
			if (flying > 0) drawFlakes();

			if (runGlint || flying > 0 || phase === "clearing") return;
			return false;
		};

		measureRef.current = ({ width, height, dpr: ratio, bufferWidth, bufferHeight }) => {
			if (width <= 0 || height <= 0) return;
			// A stroke in progress carries on from the same spot on the card.
			if (W > 0 && H > 0) {
				lastX *= width / W;
				lastY *= height / H;
			}
			W = width;
			H = height;
			dpr = ratio;
			fx.width = bufferWidth;
			fx.height = bufferHeight;
			foil.width = bufferWidth;
			foil.height = bufferHeight;
			fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
			foilCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
			const rows = Math.max(1, Math.round((GRID * H) / W));
			if (rows !== gridRows) {
				gridRows = rows;
				cells = new Uint8Array(GRID * rows);
				marked = 0;
				for (const s of segments) mark(s);
			}
			if (phase === "revealed") return;
			paintFoil();
			for (const s of segments) carve(s);
			foil.style.backgroundImage = "none";
		};

		refoilRef.current = () => {
			if (W <= 0 || phase === "revealed") return;
			paintFoil();
			for (const s of segments) carve(s);
			loop.paint();
		};

		const scratchTo = (x: number, y: number) => {
			const l = live.current;
			const seg: Segment = {
				x0: lastX / W,
				y0: lastY / H,
				x1: x / W,
				y1: y / H,
				w: l.brushSize / W,
				seed: (Math.imul(segments.length + 1, 0x9e3779b1) ^ 0x5bd1e995) >>> 0,
			};
			carve(seg);
			if (segments.length < MAX_SEGMENTS) segments.push(seg);
			scratched = true;
			mark(seg);
			spawn(lastX, lastY, x, y, l.brushSize / 2);
			lastX = x;
			lastY = y;
			if ((marked / cells.length) * 100 >= l.threshold) reveal();
		};

		const onDown = (e: PointerEvent) => {
			if (phase !== "covered" || pointer !== null || W <= 0) return;
			if (e.pointerType === "mouse" && e.button !== 0) return;
			pointer = e.pointerId;
			try {
				root.setPointerCapture(e.pointerId);
			} catch {
				// A synthetic or already-released pointer cannot be captured; the
				// stroke still works while it stays over the card.
			}
			const box = root.getBoundingClientRect();
			lastX = (e.clientX - box.left) * (box.width > 0 ? W / box.width : 1);
			lastY = (e.clientY - box.top) * (box.height > 0 ? H / box.height : 1);
			carry = 0;
			scratchTo(lastX, lastY);
			loop.start();
		};

		const onMove = (e: PointerEvent) => {
			if (e.pointerId !== pointer || phase !== "covered") return;
			const box = root.getBoundingClientRect();
			const sx = box.width > 0 ? W / box.width : 1;
			const sy = box.height > 0 ? H / box.height : 1;
			// Coalesced points keep a fast curve round instead of a polygon.
			const batch = e.getCoalescedEvents?.() ?? [];
			const points = batch.length > 0 ? batch : [e];
			const minStep = Math.max(2, live.current.brushSize * 0.12);
			for (const p of points) {
				if (phase !== "covered") break;
				const x = (p.clientX - box.left) * sx;
				const y = (p.clientY - box.top) * sy;
				if (Math.hypot(x - lastX, y - lastY) < minStep) continue;
				scratchTo(x, y);
			}
			loop.start();
		};

		const onUp = (e: PointerEvent) => {
			if (e.pointerId !== pointer) return;
			pointer = null;
			if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);
		};

		const onKey = (e: KeyboardEvent) => {
			if (phase !== "covered" || e.target !== root) return;
			if (e.key !== "Enter" && e.key !== " ") return;
			e.preventDefault();
			reveal();
		};

		// A finger held still mid-scratch would otherwise open the image menu.
		const onMenu = (e: Event) => {
			if (pointer !== null) e.preventDefault();
		};

		root.addEventListener("pointerdown", onDown);
		root.addEventListener("pointermove", onMove);
		root.addEventListener("pointerup", onUp);
		root.addEventListener("pointercancel", onUp);
		root.addEventListener("lostpointercapture", onUp);
		root.addEventListener("keydown", onKey);
		root.addEventListener("contextmenu", onMenu);

		loop.resize();
		loop.start();

		return () => {
			drawRef.current = null;
			measureRef.current = null;
			refoilRef.current = null;
			root.removeEventListener("pointerdown", onDown);
			root.removeEventListener("pointermove", onMove);
			root.removeEventListener("pointerup", onUp);
			root.removeEventListener("pointercancel", onUp);
			root.removeEventListener("lostpointercapture", onUp);
			root.removeEventListener("keydown", onKey);
			root.removeEventListener("contextmenu", onMenu);
		};
	}, [loop]);

	// A new foil color repaints the sheet and replays the scratches on it.
	useLayoutEffect(() => {
		refoilRef.current?.();
	}, [foilColor]);

	// Wake the loop for anything that changes what the glint does. While paused
	// this paints one frame and the loop goes back to sleep.
	useEffect(() => {
		loop.start();
	}, [paused, glint, glintColor, flakes, still, loop]);

	// Once the content is live, hand it the focus the card had, so keyboard and
	// screen reader users land on what they just revealed.
	useEffect(() => {
		if (!revealed || !focusOnReveal.current) return;
		focusOnReveal.current = false;
		contentRef.current?.focus({ preventScroll: true });
	}, [revealed]);

	const surface = revealed
		? ""
		: "cursor-crosshair touch-none select-none [-webkit-touch-callout:none]";

	return (
		<div
			ref={rootRef}
			role={revealed ? undefined : "button"}
			tabIndex={revealed ? undefined : 0}
			aria-label={revealed ? undefined : label}
			className={`relative isolate overflow-hidden outline-offset-2 focus-visible:outline-2 has-[>div:focus-visible]:outline-2 ${surface} ${className}`.trim()}
			style={{ outlineColor: glintColor }}
		>
			<div
				ref={contentRef}
				tabIndex={-1}
				aria-hidden={revealed ? undefined : true}
				inert={!revealed}
				className="relative h-full w-full outline-none"
			>
				{children}
			</div>
			<canvas
				ref={fxRef}
				aria-hidden
				className="pointer-events-none absolute inset-0 z-20 block size-full"
			/>
			<canvas
				ref={foilRef}
				aria-hidden
				className={`absolute inset-0 z-10 block size-full ${revealed ? "pointer-events-none" : ""}`}
				style={{ backgroundImage: veil }}
			/>
			<span aria-live="polite" className="sr-only">
				{revealed ? "Revealed" : ""}
			</span>
		</div>
	);
}

function subscribeReducedMotion(onChange: () => void) {
	const query = window.matchMedia("(prefers-reduced-motion: reduce)");
	query.addEventListener("change", onChange);
	return () => query.removeEventListener("change", onChange);
}

function readReducedMotion() {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function readReducedMotionOnServer() {
	return false;
}

/** Deterministic PRNG: the same seed always lays the same foil. */
function mulberry32(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function parseColor(value: string, fallback: Rgb): Rgb {
	const hex = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(value.trim());
	if (hex) {
		const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
		const n = parseInt(h, 16);
		return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
	}
	const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(value.trim());
	if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3])];
	return fallback;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
	return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function rgba(c: Rgb, alpha: number) {
	return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha.toFixed(3)})`;
}

/** A soft band profile: clear at both edges, `peak` in the middle. */
function soft(c: Rgb, peak: number): Stop[] {
	return [
		[0, rgba(c, 0)],
		[0.22, rgba(c, peak * 0.3)],
		[0.5, rgba(c, peak)],
		[0.78, rgba(c, peak * 0.3)],
		[1, rgba(c, 0)],
	];
}

/** CSS approximation of the painted foil, shown until the canvas takes over. */
function veilFor(color: string) {
	return `linear-gradient(135deg, color-mix(in oklab, ${color} 68%, white), ${color} 50%, color-mix(in oklab, ${color} 84%, black))`;
}
