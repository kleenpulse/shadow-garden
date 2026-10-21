"use client";

import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
	type ReactNode,
} from "react";
import { useAnimationLoop } from "@/hooks/use-animation-loop";

// Hand-drawn marker notes on real text. The words stay ordinary DOM text, so
// selection, find-in-page and screen readers never know the marks exist. The
// marks are measured, not laid out: every <AnnotateMark> is an inline box, and
// getClientRects() hands back one rect per line it occupies. That is the whole
// trick for wrapped marks: an underline that breaks across two lines is two
// underlines, measured where the browser actually put the words. The marks must
// stay inline for this, because a block or inline-block box reports a single
// rect no matter how many lines it holds.
//
// Two SVG layers sit on top of the root with pointer events off. Highlights go
// on the layer *under* the text, so the ink stays readable through the marker;
// pens go on the layer *over* it. `isolate` on the root is what keeps the
// under layer's negative z-index above the page background instead of sliding
// behind it. One consequence: a child that paints its own background covers
// the highlights, so give the background to the Annotate root, not to a child.
//
// The animation host does two jobs and neither of them is a loop. Its
// ResizeObserver tells us when the text may have rewrapped, so the marks are
// measured again and follow their words. Its clock drives the one-shot draw and
// halts itself (returns false) the moment the last mark is down. After that a
// re-measure from a resize or a late font redraws instantly at full length:
// the marks were already drawn once, and drawing them again on every resize
// would be noise.
//
// Every stroke is a path with pathLength=1, so "how much is drawn" is a single
// dash offset between 0 and 1 whatever the real length is. The shaky hand comes
// from a seeded PRNG, so the same seed always draws the same marks: across
// reloads, in Strict Mode and after every re-measure.
//
// Annotate renders a block, so it wraps paragraphs rather than sitting inside
// one. Right-to-left text is not supported: strokes always run left to right.

export type AnnotateMarkType =
	| "underline"
	| "circle"
	| "box"
	| "highlight"
	| "strike"
	| "bracket";

export interface AnnotateProps {
	/** Ink for the pen marks: underline, circle, box, strike and bracket. */
	color?: string;
	/** Marker color for highlights, drawn behind the text. */
	highlightColor?: string;
	/** Time to draw one mark, in ms. */
	duration?: number;
	/** Pause between one mark ending and the next one starting, in ms. */
	gap?: number;
	/** Pen width, in px. */
	strokeWidth?: number;
	/** How shaky the hand is. 0 draws clean lines. */
	roughness?: number;
	/** Space between the words and the mark, in px. */
	padding?: number;
	/** Picks the hand. The same seed always draws the same marks. */
	seed?: number;
	/** Start drawing on mount, or the first time the text scrolls into view. */
	trigger?: "mount" | "inView";
	/** Show every mark fully drawn, with no animation. */
	reducedMotion?: boolean;
	className?: string;
	children?: ReactNode;
}

export interface AnnotateMarkProps {
	/** Which mark to draw around these words. */
	type: AnnotateMarkType;
	/** Overrides the pen (or marker) color for this one mark. */
	color?: string;
	children?: ReactNode;
}

/** One line fragment of a mark, in root-local CSS pixels. */
interface Line {
	x: number;
	y: number;
	w: number;
	h: number;
}

interface MarkGeom {
	type: AnnotateMarkType;
	tint?: string;
	lines: Line[];
}

interface Stroke {
	d: string;
	/** Highlights live on the layer under the text. */
	under: boolean;
	tint?: string;
	width: number;
	/** Position of the owning mark on the timeline. */
	slot: number;
	/** Window inside the owning mark's duration, 0 to 1. */
	from: number;
	to: number;
}

type Phase = "idle" | "drawing" | "done";

const TYPES: readonly AnnotateMarkType[] = [
	"underline",
	"circle",
	"box",
	"highlight",
	"strike",
	"bracket",
];

/** How far the hand's second pass trails the first, as a share of the stroke's time. */
const LAG = 0.12;

// Where the ink sits inside a line fragment. getClientRects() reports an inline
// box's content area (ascent + descent), which has empty room above the
// ascenders and, for most words, below the baseline too. Marks that hug the
// content area look loose vertically and run into the line above, so they
// hug the ink instead. Ratios hold for most text faces.
/** Top of the ascenders. */
const INK_TOP = 0.17;
/** The baseline. */
const BASELINE = 0.78;
/** Bottom of the descenders. */
const INK_BOTTOM = 0.94;
/** The middle of the lowercase letters, where a strike-through crosses. */
const X_MIDDLE = 0.57;

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Deterministic PRNG: the same seed always shakes the same way. */
const mulberry32 = (seed: number) => () => {
	seed |= 0;
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** A pen lands moving and slows as it lifts: half ease-out, half smoothstep. */
const ease = (x: number) => 0.5 * (1 - (1 - x) * (1 - x)) + 0.5 * x * x * (3 - 2 * x);

/** The curve part of a hand-drawn segment: a cubic that bows off the straight line. */
function bowed(
	ax: number,
	ay: number,
	bx: number,
	by: number,
	rand: () => number,
	rough: number,
	scale: number,
): string {
	const dx = bx - ax;
	const dy = by - ay;
	const len = Math.hypot(dx, dy) || 1;
	const nx = -dy / len;
	const ny = dx / len;
	// The two control points share one bend, so the midpoint lands about `bend`
	// off the line. A cubic only moves its midpoint 3/4 as far as its controls.
	const bend = (rand() * 2 - 1) * len * 0.012 * rough * scale * (4 / 3);
	const b1 = bend * (0.7 + rand() * 0.6);
	const b2 = bend * (0.7 + rand() * 0.6);
	const k1 = 0.2 + rand() * 0.2;
	const k2 = 0.6 + rand() * 0.2;
	return `C${r2(ax + dx * k1 + nx * b1)} ${r2(ay + dy * k1 + ny * b1)} ${r2(ax + dx * k2 + nx * b2)} ${r2(ay + dy * k2 + ny * b2)} ${r2(bx)} ${r2(by)}`;
}

/** One pen line. Pass 1 is the hand going back over it, closer to the true line. */
function roughLine(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	rand: () => number,
	rough: number,
	pass: number,
): string {
	const scale = pass ? 0.6 : 1;
	const j = 0.9 * rough * scale;
	const ax = x1 + (rand() * 2 - 1) * j;
	const ay = y1 + (rand() * 2 - 1) * j;
	const bx = x2 + (rand() * 2 - 1) * j;
	const by = y2 + (rand() * 2 - 1) * j;
	return `M${r2(ax)} ${r2(ay)}${bowed(ax, ay, bx, by, rand, rough, scale)}`;
}

/** One continuous pen stroke through a few corners, as a bracket is drawn. */
function roughPoly(
	points: [number, number][],
	rand: () => number,
	rough: number,
	pass: number,
): string {
	const scale = pass ? 0.6 : 1;
	const j = 0.55 * rough * scale;
	const q = points.map(
		([x, y]) => [x + (rand() * 2 - 1) * j, y + (rand() * 2 - 1) * j] as const,
	);
	let d = `M${r2(q[0][0])} ${r2(q[0][1])}`;
	for (let i = 1; i < q.length; i++) {
		d += bowed(q[i - 1][0], q[i - 1][1], q[i][0], q[i][1], rand, rough, scale);
	}
	return d;
}

/** Catmull-Rom through the points, written out as cubic Béziers. */
function smooth(points: [number, number][]): string {
	let d = `M${r2(points[0][0])} ${r2(points[0][1])}`;
	const last = points.length - 1;
	for (let i = 0; i < last; i++) {
		const p0 = points[Math.max(0, i - 1)];
		const p1 = points[i];
		const p2 = points[i + 1];
		const p3 = points[Math.min(last, i + 2)];
		d += `C${r2(p1[0] + (p2[0] - p0[0]) / 6)} ${r2(p1[1] + (p2[1] - p0[1]) / 6)} ${r2(p2[0] - (p3[0] - p1[0]) / 6)} ${r2(p2[1] - (p3[1] - p1[1]) / 6)} ${r2(p2[0])} ${r2(p2[1])}`;
	}
	return d;
}

/**
 * A loop drawn by hand: one stroke from a random point on the top half, all
 * the way round and a little past where it started. The radius wobbles along
 * the stroke, not around the angle, so the overshoot never lands exactly on
 * the start. It runs beside it, which is what a real pen does.
 */
function circlePath(
	cx: number,
	cy: number,
	a: number,
	b: number,
	rand: () => number,
	rough: number,
): { d: string; len: number } {
	const perimeter = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
	const count = Math.max(24, Math.min(48, Math.round(perimeter / 10)));
	const sweep = Math.PI * 2 + 0.35;
	const start = -Math.PI / 2 + (rand() * 2 - 1) * 1.1;
	const turn = rand() < 0.5 ? 1 : -1;
	const waves = [0.03, 0.02, 0.012].map((amp) => ({
		amp: amp * rough * (0.6 + rand() * 0.4),
		freq: 1 + rand() * 2.5,
		phase: rand() * Math.PI * 2,
	}));
	const drift = (rand() < 0.5 ? -1 : 1) * 0.035 * Math.min(rough, 1.5);
	const points: [number, number][] = [];
	for (let i = 0; i < count; i++) {
		const t = i / (count - 1);
		const angle = start + turn * sweep * t;
		let r = 1 + drift * t;
		for (const w of waves) r += w.amp * Math.sin(w.freq * Math.PI * 2 * t + w.phase);
		points.push([cx + Math.cos(angle) * a * r, cy + Math.sin(angle) * b * r]);
	}
	return { d: smooth(points), len: (perimeter * sweep) / (Math.PI * 2) };
}

function union(lines: Line[]): Line {
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	for (const l of lines) {
		x0 = Math.min(x0, l.x);
		y0 = Math.min(y0, l.y);
		x1 = Math.max(x1, l.x + l.w);
		y1 = Math.max(y1, l.y + l.h);
	}
	return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Geometry to strokes. Each mark gets its own PRNG stream, so a resize that
 * rewraps one mark never reshuffles the hand on any other.
 */
function buildStrokes(
	geom: MarkGeom[],
	seed: number,
	roughness: number,
	padding: number,
	strokeWidth: number,
): Stroke[] {
	const rough = Math.max(0, roughness);
	const passes = rough < 0.05 ? 1 : 2;
	const pad = Math.max(0, padding);
	const pen = Math.max(0, strokeWidth);
	const half = pen / 2;
	const out: Stroke[] = [];

	geom.forEach((mark, slot) => {
		const rand = mulberry32(seed * 9973 + slot);
		const segments: { len: number; paths: string[]; width: number; under: boolean }[] = [];
		const add = (len: number, width: number, under: boolean, draw: (pass: number) => string) => {
			const paths: string[] = [];
			for (let pass = 0; pass < passes; pass++) paths.push(draw(pass));
			segments.push({ len: Math.max(len, 1), paths, width, under });
		};

		switch (mark.type) {
			case "underline":
				for (const l of mark.lines) {
					const y = l.y + l.h * (BASELINE + 0.1) + pad * 0.4 + half;
					const x1 = l.x - pad * 0.4;
					const x2 = l.x + l.w + pad * 0.4;
					add(x2 - x1, pen, false, (pass) => roughLine(x1, y, x2, y, rand, rough, pass));
				}
				break;
			case "strike":
				for (const l of mark.lines) {
					const y = l.y + l.h * X_MIDDLE;
					const x1 = l.x - pad * 0.5;
					const x2 = l.x + l.w + pad * 0.5;
					add(x2 - x1, pen, false, (pass) => roughLine(x1, y, x2, y, rand, rough, pass));
				}
				break;
			case "highlight":
				for (const l of mark.lines) {
					// A flat band the exact height of the line reads as a text
					// selection. Two sweeps that each sit a little off, tilt a little
					// and stop in slightly different places read as a marker: the
					// overlap goes darker and the edges stay uneven.
					const hand = Math.min(rough, 2);
					const y = l.y + l.h * ((INK_TOP + INK_BOTTOM) / 2);
					const x1 = l.x - pad * 0.4;
					const x2 = l.x + l.w + pad * 0.4;
					add(x2 - x1, l.h * 0.85, true, (pass) => {
						const dy = (rand() * 2 - 1) * l.h * 0.05 * hand;
						const tilt = (rand() * 2 - 1) * l.h * 0.04 * hand;
						const sx = (rand() * 2 - 1) * pad * 0.3 * Math.min(hand, 1);
						const ex = (rand() * 2 - 1) * pad * 0.3 * Math.min(hand, 1);
						return roughLine(x1 + sx, y + dy - tilt, x2 + ex, y + dy + tilt, rand, rough, pass);
					});
				}
				break;
			case "box":
				for (const l of mark.lines) {
					// The same 0.7 both ways: the sides start from the glyph boxes,
					// the top and bottom from the ink. Full padding sideways lands the
					// pen on the next word over in small text.
					const x0 = l.x - pad * 0.7 - half;
					const x1 = l.x + l.w + pad * 0.7 + half;
					const y0 = l.y + l.h * INK_TOP - pad * 0.7 - half;
					const y1 = l.y + l.h * INK_BOTTOM + pad * 0.7 + half;
					// A hand never stops on the corner, so each side runs a little past it.
					const over = () => (2 + rand() * 2) * Math.min(rough, 1);
					const sides: [number, number, number, number][] = [
						[x0 - over(), y0, x1 + over(), y0],
						[x1, y0 - over(), x1, y1 + over()],
						[x1 + over(), y1, x0 - over(), y1],
						[x0, y1 + over(), x0, y0 - over()],
					];
					for (const [ax, ay, bx, by] of sides) {
						add(Math.hypot(bx - ax, by - ay), pen, false, (pass) =>
							roughLine(ax, ay, bx, by, rand, rough, pass),
						);
					}
				}
				break;
			case "circle": {
				const u = union(mark.lines);
				const first = mark.lines[0].h;
				const last = mark.lines[mark.lines.length - 1].h;
				const top = u.y + first * INK_TOP;
				const bottom = u.y + u.h - last * (1 - INK_BOTTOM);
				// A little taller than the padding alone: a pen circling one word draws
				// a rounder loop than the word's own shape.
				const b = (bottom - top) * 0.62 + pad + half;
				// Wide enough to clear the letters at both ends of the words, not
				// just in the middle: the ellipse passes outside the point `core`
				// above and below center at the far left and right. Any wider and
				// it runs through the next word over.
				const core = (bottom - top) * 0.32;
				const a = u.w / 2 / Math.sqrt(1 - (core * core) / (b * b)) + pad * 0.3 + half;
				const loop = circlePath(u.x + u.w / 2, (top + bottom) / 2, a, b, rand, rough);
				segments.push({ len: loop.len, paths: [loop.d], width: pen, under: false });
				break;
			}
			case "bracket": {
				const u = union(mark.lines);
				const first = mark.lines[0].h;
				const last = mark.lines[mark.lines.length - 1].h;
				const top = u.y + first * INK_TOP - pad * 0.7 - half;
				const bottom = u.y + u.h - last * (1 - INK_BOTTOM) + pad * 0.7 + half;
				const left = u.x - pad - half;
				const right = u.x + u.w + pad + half;
				const arm = Math.min(12, Math.max(4, mark.lines[0].h * 0.32));
				const len = arm * 2 + (bottom - top);
				add(len, pen, false, (pass) =>
					roughPoly(
						[
							[left + arm, top],
							[left, top],
							[left, bottom],
							[left + arm, bottom],
						],
						rand,
						rough,
						pass,
					),
				);
				add(len, pen, false, (pass) =>
					roughPoly(
						[
							[right - arm, top],
							[right, top],
							[right, bottom],
							[right - arm, bottom],
						],
						rand,
						rough,
						pass,
					),
				);
				break;
			}
		}

		// The mark's time is shared out by length, so the pen moves at one speed
		// across every line of a wrapped mark.
		const total = segments.reduce((sum, s) => sum + s.len, 0);
		let acc = 0;
		for (const seg of segments) {
			const from = acc / total;
			acc += seg.len;
			const to = acc / total;
			const lag = seg.paths.length > 1 ? (to - from) * LAG : 0;
			seg.paths.forEach((d, pass) => {
				out.push({
					d,
					under: seg.under,
					tint: mark.tint,
					width: seg.width,
					slot,
					from: pass ? from + lag : from,
					to: pass ? to : to - lag,
				});
			});
		}
	});

	return out;
}

/**
 * Every mark's line fragments in root-local layout pixels, or null while the
 * root has no size (a hidden tab, a collapsed panel). Dividing by the ratio of
 * the painted width to the layout width undoes any scale on an ancestor, so a
 * scaled-down thumbnail still lands each mark on its words.
 */
function measureMarks(root: HTMLElement): MarkGeom[] | null {
	const layoutWidth = root.offsetWidth;
	const layoutHeight = root.offsetHeight;
	const box = root.getBoundingClientRect();
	if (layoutWidth === 0 || box.width === 0) return null;
	const sx = box.width / layoutWidth;
	const sy = layoutHeight > 0 && box.height > 0 ? box.height / layoutHeight : sx;
	// The SVG layers are positioned against the padding box, inside any border.
	const ox = box.left + root.clientLeft * sx;
	const oy = box.top + root.clientTop * sy;

	const out: MarkGeom[] = [];
	root.querySelectorAll<HTMLElement>("[data-annotate]").forEach((el) => {
		// A nested Annotate owns its own marks.
		if (el.closest("[data-annotate-root]") !== root) return;
		const type = el.dataset.annotate as AnnotateMarkType;
		if (!TYPES.includes(type)) return;

		const lines: Line[] = [];
		for (const rect of Array.from(el.getClientRects())) {
			const w = rect.width / sx;
			const h = rect.height / sy;
			// A space left hanging at a line end reports a zero-width fragment.
			if (w < 1 || h < 1) continue;
			const x = (rect.left - ox) / sx + root.scrollLeft;
			const y = (rect.top - oy) / sy + root.scrollTop;
			const prev = lines[lines.length - 1];
			// Bidi runs and nested inline boxes can split one line into several
			// touching fragments. Merge them, or the line gets two underlines.
			if (prev && Math.abs(prev.y - y) < 2 && x <= prev.x + prev.w + 2 && x + w >= prev.x - 2) {
				const right = Math.max(prev.x + prev.w, x + w);
				const bottom = Math.max(prev.y + prev.h, y + h);
				prev.x = Math.min(prev.x, x);
				prev.y = Math.min(prev.y, y);
				prev.w = right - prev.x;
				prev.h = bottom - prev.y;
			} else {
				lines.push({ x, y, w, h });
			}
		}
		if (lines.length === 0) return;
		out.push({
			type,
			tint: el.dataset.annotateColor || undefined,
			lines: lines.map((l) => ({ x: r1(l.x), y: r1(l.y), w: r1(l.w), h: r1(l.h) })),
		});
	});
	return out;
}

const keyOf = (geom: MarkGeom[]) =>
	geom
		.map(
			(m) =>
				`${m.type}:${m.tint ?? ""}:${m.lines.map((l) => `${l.x},${l.y},${l.w},${l.h}`).join(";")}`,
		)
		.join("|");

const subscribeMotion = (onChange: () => void) => {
	const query = window.matchMedia(MOTION_QUERY);
	query.addEventListener("change", onChange);
	return () => query.removeEventListener("change", onChange);
};
const readMotion = () => window.matchMedia(MOTION_QUERY).matches;
const readMotionOnServer = () => false;

export default function Annotate({
	color = "#a855f7",
	highlightColor = "#c084fc",
	duration = 700,
	gap = 250,
	strokeWidth = 2,
	roughness = 1,
	padding = 5,
	seed = 7,
	trigger = "inView",
	reducedMotion = false,
	className = "",
	children,
}: AnnotateProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	const pathEls = useRef<(SVGPathElement | null)[]>([]);
	const drawRef = useRef<((dt: number) => void | false) | null>(null);
	const geomKey = useRef("");
	const [geom, setGeom] = useState<MarkGeom[]>([]);

	const systemReduced = useSyncExternalStore(subscribeMotion, readMotion, readMotionOnServer);
	const still = reducedMotion || systemReduced;

	const strokes = useMemo(
		() => buildStrokes(geom, seed, roughness, padding, strokeWidth),
		[geom, seed, roughness, padding, strokeWidth],
	);

	const live = useRef({ duration, gap, still, strokes });
	const run = useRef<{ phase: Phase; t: number }>({ phase: "idle", t: 0 });
	// Last progress written to each path, so a frame that changes nothing
	// writes nothing. Keyed by element: a re-measure that swaps paths starts clean.
	const written = useRef(new WeakMap<SVGPathElement, number>());

	useLayoutEffect(() => {
		live.current = { duration, gap, still, strokes };
	});

	const remeasure = useCallback(() => {
		const root = rootRef.current;
		if (!root) return;
		const next = measureMarks(root);
		if (!next) return;
		// Only a real change re-renders. This runs after every render, so without
		// the key check a new array each time would render forever.
		const key = keyOf(next);
		if (key === geomKey.current) return;
		geomKey.current = key;
		setGeom(next);
	}, []);

	const paint = useCallback(() => {
		const cfg = live.current;
		const r = run.current;
		const dur = Math.max(cfg.duration, 1) / 1000;
		const beat = dur + Math.max(cfg.gap, 0) / 1000;
		const finished = cfg.still || r.phase === "done";
		const cache = written.current;
		cfg.strokes.forEach((s, k) => {
			const el = pathEls.current[k];
			if (!el) return;
			let p = 1;
			if (!finished) {
				if (r.phase === "idle") {
					p = 0;
				} else {
					const u = (r.t - s.slot * beat) / dur;
					p = ease(Math.min(Math.max((u - s.from) / Math.max(s.to - s.from, 1e-6), 0), 1));
				}
			}
			const last = cache.get(el);
			if (last === p) return;
			cache.set(el, p);
			el.style.strokeDashoffset = String(1 - p);
			// Hidden at zero, not just fully offset: a round cap still paints a dot
			// where a zero-length dash starts.
			if (last === undefined || (last > 0) !== (p > 0)) {
				el.style.visibility = p > 0 ? "visible" : "hidden";
			}
		});
	}, []);

	const step = useCallback(
		(dt: number): void | false => {
			const cfg = live.current;
			const r = run.current;
			// Nothing measured yet (a root mounted hidden): wait without spending
			// the timeline, so the marks still draw once there is something to draw.
			if (cfg.still || r.phase !== "drawing" || cfg.strokes.length === 0) {
				paint();
				return false;
			}
			r.t += dt;
			const dur = Math.max(cfg.duration, 1) / 1000;
			const beat = dur + Math.max(cfg.gap, 0) / 1000;
			const marks = cfg.strokes[cfg.strokes.length - 1].slot + 1;
			if (r.t >= (marks - 1) * beat + dur) r.phase = "done";
			paint();
			if (r.phase === "done") return false;
		},
		[paint],
	);

	useLayoutEffect(() => {
		drawRef.current = step;
		return () => {
			drawRef.current = null;
		};
	}, [step]);

	const loop = useAnimationLoop({
		target: rootRef,
		onResize: () => remeasure(),
		onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
	});

	// After every render: the children may have changed under us.
	useLayoutEffect(() => {
		remeasure();
	});

	// New paths are put at the current point of the timeline before the browser
	// paints them, so they never flash fully drawn for a frame.
	useLayoutEffect(() => {
		paint();
		if (run.current.phase === "drawing") loop.start();
	}, [strokes, paint, loop]);

	// Reduced motion skips straight to the finished marks, and they stay
	// finished if the setting is turned off later.
	useLayoutEffect(() => {
		if (still) run.current.phase = "done";
		paint();
	}, [still, paint]);

	// A web font that lands after the first measure moves every word.
	useEffect(() => {
		if (!("fonts" in document)) return;
		let alive = true;
		const fonts = document.fonts;
		const again = () => {
			if (alive) remeasure();
		};
		fonts.ready.then(again).catch(() => {});
		fonts.addEventListener("loadingdone", again);
		return () => {
			alive = false;
			fonts.removeEventListener("loadingdone", again);
		};
	}, [remeasure]);

	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;
		const begin = () => {
			if (run.current.phase !== "idle") return;
			run.current.phase = "drawing";
			run.current.t = 0;
			loop.start();
		};
		if (trigger === "mount" || typeof IntersectionObserver === "undefined") {
			begin();
			return;
		}
		// No threshold and no negative margin: either can leave a short block at
		// the very bottom of a page waiting for a scroll that never comes.
		const observer = new IntersectionObserver((entries) => {
			if (!entries.some((entry) => entry.isIntersecting)) return;
			observer.disconnect();
			begin();
		});
		observer.observe(root);
		return () => observer.disconnect();
	}, [trigger, loop]);

	return (
		<div ref={rootRef} data-annotate-root="" className={`relative isolate ${className}`.trim()}>
			<div>{children}</div>
			<svg
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 -z-10 h-full w-full overflow-visible"
			>
				{strokes.map((s, k) =>
					s.under ? (
						<path
							key={k}
							ref={(el) => {
								pathEls.current[k] = el;
							}}
							d={s.d}
							fill="none"
							stroke={s.tint ?? highlightColor}
							strokeOpacity={0.35}
							strokeWidth={s.width}
							strokeLinecap="butt"
							strokeLinejoin="round"
							pathLength={1}
							strokeDasharray="1 1"
						/>
					) : null,
				)}
			</svg>
			<svg
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible"
			>
				{strokes.map((s, k) =>
					s.under ? null : (
						<path
							key={k}
							ref={(el) => {
								pathEls.current[k] = el;
							}}
							d={s.d}
							fill="none"
							stroke={s.tint ?? color}
							strokeWidth={s.width}
							strokeLinecap="round"
							strokeLinejoin="round"
							pathLength={1}
							strokeDasharray="1 1"
						/>
					),
				)}
			</svg>
		</div>
	);
}

/**
 * Wraps the words to mark. Always an inline box: getClientRects() only returns
 * one rect per line for inline boxes, and that is what lets a wrapped mark
 * draw on every line it covers.
 */
export function AnnotateMark({ type, color, children }: AnnotateMarkProps) {
	if (type === "highlight") {
		return (
			<mark
				data-annotate={type}
				data-annotate-color={color}
				className="bg-transparent text-inherit"
			>
				{children}
			</mark>
		);
	}
	return (
		<span data-annotate={type} data-annotate-color={color}>
			{children}
		</span>
	);
}
