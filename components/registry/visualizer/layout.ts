import type { OrbitGroup, OrbitNodeData } from "./types";

/*
 * Orbit geometry. Pure and deterministic: same input → same output, no clocks,
 * no randomness, no DOM. Angles are clock angles (0 = 12 o'clock, clockwise).
 */

export type WeekIndex = 0 | 1 | 2 | 3;
export type Side = "left" | "right";
export type Point = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };

export const MAX_SENDERS = 24;
/** Ring 1 gets crowded past this; extra groups are dropped, their nodes fold into the last kept group. */
export const MAX_GROUPS = 7;
export const WEEKS: readonly WeekIndex[] = [0, 1, 2, 3];

/**
 * The ring's groups in order: the given list (deduped, capped), or — when none
 * is given — the nodes' own group ids in first-seen order.
 */
export function resolveGroups(senders: readonly OrbitNodeData[], groups: readonly OrbitGroup[]): OrbitGroup[] {
	const out: OrbitGroup[] = [];
	const seen = new Set<string>();
	const source = groups.length ? groups : senders.map((s) => ({ id: s.group, label: s.group, count: 0 }));
	for (const g of source) {
		if (!g.id || seen.has(g.id)) continue;
		seen.add(g.id);
		out.push(g);
		if (out.length === MAX_GROUPS) break;
	}
	return out;
}

/** Nodes whose group isn't on the ring join the last group rather than vanish. */
function groupOf(s: OrbitNodeData, ids: ReadonlySet<string>, fallback: string): string {
	return ids.has(s.group) ? s.group : fallback;
}

const TAU = Math.PI * 2;
const HOUR = 3_600_000;
/** Average weeks in the 30-day window, for categories with no sender detail. */
const WEEK_SHARE = 7 / 30;

export const SENDER_NAME_SIZE = 11.5;
export const CHIP_H = 15;
export const CATEGORY_NAME_SIZE = 14;
const CHIP_FONT = 10;
const MONO_EM = 0.6;
const LABEL_H = 15;

/* ─── small math ─── */

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r2 = (n: number) => Math.round(n * 100) / 100;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const norm = (t: number) => ((t % TAU) + TAU) % TAU;

function onEllipse(cx: number, cy: number, rx: number, ry: number, t: number): Point {
	return { x: cx + rx * Math.sin(t), y: cy - ry * Math.cos(t) };
}

/* ─── text metrics (no DOM): per-glyph estimates for Geist / Instrument Sans ─── */

function glyph(ch: string): number {
	if (ch === " ") return 0.27;
	if ("iljI.,:;'|!".includes(ch)) return 0.27;
	if ("tfr()[]-".includes(ch)) return 0.37;
	if ("mwMW@".includes(ch)) return 0.86;
	if (ch >= "0" && ch <= "9") return 0.58;
	if (ch >= "A" && ch <= "Z") return 0.67;
	return 0.56;
}

export function textWidth(text: string, size: number): number {
	let w = 0;
	for (const ch of text) w += glyph(ch);
	return w * size;
}

export function chipWidth(chars: number): number {
	return Math.ceil(chars * CHIP_FONT * MONO_EM + 11);
}

export function shortLabel(text: string, max = 16): string {
	return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/* ─── collision helpers ─── */

function boxHitsCircle(b: Box, c: Point, r: number): boolean {
	const nx = clamp(c.x, b.x, b.x + b.w);
	const ny = clamp(c.y, b.y, b.y + b.h);
	return (c.x - nx) ** 2 + (c.y - ny) ** 2 < r * r;
}

function boxesHit(a: Box, b: Box, pad = 0): boolean {
	return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

function boxInside(b: Box, width: number, height: number, pad: number): boolean {
	return b.x >= pad && b.y >= pad && b.x + b.w <= width - pad && b.y + b.h <= height - pad;
}

function segHitsBox(p: Point, q: Point, b: Box, halfWidth: number): boolean {
	// Sample densely enough for label-sized boxes; beams are short.
	const steps = Math.max(2, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 4));
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		if (boxHitsCircle(b, { x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t) }, halfWidth)) return true;
	}
	return false;
}

/* ─── value helpers ─── */

export function senderValue(s: OrbitNodeData, week: WeekIndex | null): number {
	const v = week === null ? s.count : s.weekly?.[week];
	return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

type CategoryAgg = {
	id: string;
	label: string;
	count: number;
	weeks: [number, number, number, number];
	senderCount: number;
	lastAt: number;
};

/** Week volume for a group, scaled from the nodes we can see (top nodes ≠ all volume). */
function aggregateCategories(senders: readonly OrbitNodeData[], groupsIn: readonly OrbitGroup[]): CategoryAgg[] {
	const groups = resolveGroups(senders, groupsIn);
	const ids = new Set(groups.map((g) => g.id));
	const fallback = groups.at(-1)?.id ?? "";
	const bySender = new Map<string, { count: number; weeks: number[]; n: number; lastAt: number }>();
	for (const s of senders) {
		const cat = groupOf(s, ids, fallback);
		const acc = bySender.get(cat) ?? { count: 0, weeks: [0, 0, 0, 0], n: 0, lastAt: -Infinity };
		acc.count += senderValue(s, null);
		for (const w of WEEKS) acc.weeks[w]! += senderValue(s, w);
		acc.n += 1;
		const t = Date.parse(s.lastAt);
		if (!Number.isNaN(t)) acc.lastAt = Math.max(acc.lastAt, t);
		bySender.set(cat, acc);
	}
	const out: CategoryAgg[] = [];
	for (const g of groups) {
		const acc = bySender.get(g.id);
		const given = Number.isFinite(g.count) ? Math.max(0, g.count) : 0;
		const count = Math.max(given, acc?.count ?? 0);
		if (count <= 0 && !acc?.n) continue;
		const weeks = WEEKS.map((w) => {
			if (acc && acc.count > 0) return (count * acc.weeks[w]!) / acc.count;
			return count * WEEK_SHARE;
		}) as CategoryAgg["weeks"];
		out.push({ id: g.id, label: g.label, count, weeks, senderCount: acc?.n ?? 0, lastAt: acc?.lastAt ?? -Infinity });
	}
	return out;
}

export type CategoryShare = { id: string; label: string; count: number; value: number; pct: number; text: string };

/** Group volumes + rounded shares for a mode, in ring order (no geometry). */
export function categoryShares(
	senders: readonly OrbitNodeData[],
	groups: readonly OrbitGroup[],
	week: WeekIndex | null = null,
): CategoryShare[] {
	const aggs = aggregateCategories(normalizeSenders(senders), groups);
	const values = aggs.map((c) => (week === null ? c.count : c.weeks[week]));
	const pcts = sharePercents(values);
	return aggs.map((c, i) => ({
		id: c.id,
		label: c.label,
		count: c.count,
		value: values[i]!,
		pct: pcts[i]!,
		text: formatShare(pcts[i]!, values[i]!),
	}));
}

/** Largest-remainder rounding so badges add up to 100. */
export function sharePercents(values: number[]): number[] {
	const total = values.reduce((a, b) => a + b, 0);
	if (total <= 0) return values.map(() => 0);
	const raw = values.map((v) => (v / total) * 100);
	const floors = raw.map(Math.floor);
	let left = 100 - floors.reduce((a, b) => a + b, 0);
	const order = raw.map((v, i) => ({ i, rem: v - Math.floor(v) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
	for (const { i } of order) {
		if (left <= 0) break;
		floors[i]! += 1;
		left -= 1;
	}
	return floors;
}

export function formatShare(pct: number, value: number): string {
	if (value > 0 && pct < 1) return "<1%";
	return `${pct}%`;
}

/* ─── activity ring ─── */

export type Tick = { x1: number; y1: number; x2: number; y2: number; value: number; day: number };

/**
 * One radial tick per day, oldest at 12 o'clock running clockwise, so the
 * newest day sits just left of 12. Length is linear in volume.
 */
export function activityTicks(
	daily: readonly number[],
	cx: number,
	cy: number,
	inner: number,
	maxLen: number,
): Tick[] {
	const n = daily.length;
	if (!n) return [];
	const max = Math.max(1, ...daily.map((v) => (Number.isFinite(v) ? v : 0)));
	return daily.map((raw, day) => {
		const value = Number.isFinite(raw) && raw > 0 ? raw : 0;
		const t = ((day + 0.5) / n) * TAU;
		const len = value > 0 ? Math.max(2, (maxLen * value) / max) : 0;
		const a = onEllipse(cx, cy, inner, inner, t);
		const b = onEllipse(cx, cy, inner + len, inner + len, t);
		return { x1: r2(a.x), y1: r2(a.y), x2: r2(b.x), y2: r2(b.y), value, day };
	});
}

/** Ticks as one path; zero days become dots (a hairline segment with round caps). */
export function ticksPath(ticks: readonly Tick[]): string {
	return ticks
		.map((t) =>
			t.value > 0 ? `M${t.x1} ${t.y1}L${t.x2} ${t.y2}` : `M${t.x1} ${t.y1}l0.01 0`,
		)
		.join("");
}

/** Sum senders' daily series, right-aligned (newest days line up). */
export function combinedDaily(senders: readonly OrbitNodeData[], days = 30): number[] {
	const out = new Array<number>(days).fill(0);
	for (const s of senders) {
		const d = s.daily ?? [];
		for (let i = 0; i < Math.min(days, d.length); i++) {
			const v = d[d.length - 1 - i];
			if (typeof v === "number" && Number.isFinite(v) && v > 0) out[days - 1 - i]! += v;
		}
	}
	return out;
}

/* ─── curves ─── */

function quad(p0: Point, c: Point, p2: Point, t: number): Point {
	const u = 1 - t;
	return { x: u * u * p0.x + 2 * u * t * c.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p2.y };
}

function quadPath(p0: Point, c: Point, p2: Point): string {
	return `M${r2(p0.x)} ${r2(p0.y)}Q${r2(c.x)} ${r2(c.y)} ${r2(p2.x)} ${r2(p2.y)}`;
}

function quadLength(p0: Point, c: Point, p2: Point): number {
	let len = 0;
	let prev = p0;
	for (let i = 1; i <= 16; i++) {
		const p = quad(p0, c, p2, i / 16);
		len += Math.hypot(p.x - prev.x, p.y - prev.y);
		prev = p;
	}
	return len;
}

/**
 * Points along a quadratic at even arc-length spacing, as "x,y x,y …" from p0
 * to p2 — keyframes for compositor-driven motion (transform, not offset-path).
 */
function quadTrack(p0: Point, c: Point, p2: Point, n = 18): string {
	const fine = Array.from({ length: 65 }, (_, i) => quad(p0, c, p2, i / 64));
	const cum = [0];
	for (let i = 1; i < fine.length; i++) cum.push(cum[i - 1]! + Math.hypot(fine[i]!.x - fine[i - 1]!.x, fine[i]!.y - fine[i - 1]!.y));
	const total = cum.at(-1) || 1;
	const out: string[] = [];
	let k = 1;
	for (let i = 0; i <= n; i++) {
		const target = (total * i) / n;
		while (k < cum.length - 1 && cum[k]! < target) k++;
		const seg = cum[k]! - cum[k - 1]! || 1;
		const f = (target - cum[k - 1]!) / seg;
		const a = fine[k - 1]!;
		const b = fine[k]!;
		out.push(`${r2(lerp(a.x, b.x, f))},${r2(lerp(a.y, b.y, f))}`);
	}
	return out.join(" ");
}

/** Open chevron with its tip at `tip`, pointing along `dir`, arms `len` long at ±28°. */
function chevron(tip: Point, dir: Point, len: number): string {
	const n = Math.hypot(dir.x, dir.y) || 1;
	const ux = dir.x / n;
	const uy = dir.y / n;
	const c = Math.cos(0.49);
	const s = Math.sin(0.49);
	const arm = (sign: number) => ({
		x: tip.x - len * (ux * c - sign * uy * s),
		y: tip.y - len * (uy * c + sign * ux * s),
	});
	const a = arm(1);
	const b = arm(-1);
	return `M${r2(a.x)} ${r2(a.y)}L${r2(tip.x)} ${r2(tip.y)}L${r2(b.x)} ${r2(b.y)}`;
}

/** Cubic with horizontal tangents at both ends — the drilldown's fan. */
export function fanCurve(from: Point, to: Point): string {
	const dx = (to.x - from.x) * 0.55;
	return `M${r2(from.x)} ${r2(from.y)}C${r2(from.x + dx)} ${r2(from.y)} ${r2(to.x - dx)} ${r2(to.y)} ${r2(to.x)} ${r2(to.y)}`;
}

/* ─── ellipse arc-length table (even pixel spacing along ring 2) ─── */

type ArcTable = { total: number; at: (t: number) => number; inverse: (s: number) => number };

function arcTable(rx: number, ry: number): ArcTable {
	const N = 720;
	const cum = new Float64Array(N + 1);
	for (let k = 1; k <= N; k++) {
		const t = ((k - 0.5) / N) * TAU;
		cum[k] = cum[k - 1]! + Math.hypot(rx * Math.cos(t), ry * Math.sin(t)) * (TAU / N);
	}
	const total = cum[N]!;
	const at = (t: number) => {
		const turns = Math.floor(t / TAU);
		const f = ((t - turns * TAU) / TAU) * N;
		const k = Math.min(N - 1, Math.floor(f));
		return turns * total + cum[k]! + (cum[k + 1]! - cum[k]!) * (f - k);
	};
	const inverse = (s: number) => {
		const turns = Math.floor(s / total);
		const rest = s - turns * total;
		let lo = 0;
		let hi = N;
		while (hi - lo > 1) {
			const mid = (lo + hi) >> 1;
			if (cum[mid]! <= rest) lo = mid;
			else hi = mid;
		}
		const seg = cum[lo + 1]! - cum[lo]!;
		const f = seg > 0 ? (rest - cum[lo]!) / seg : 0;
		return turns * TAU + ((lo + f) / N) * TAU;
	};
	return { total, at, inverse };
}

/**
 * Turn the (stable-order) category ring so busy categories sit near 3 and 9
 * o'clock, where ring 2 runs vertically and horizontal labels stack cleanly,
 * and so the load is balanced left/right. Ties keep the canonical start.
 */
export function ringRotation(demand: readonly number[], aspect = 1): number {
	const n = demand.length;
	if (n <= 1) return Math.PI / 2;
	const step = TAU / n;
	const canonical = Math.PI / n;
	const K = 72;
	// Share of ring 2's tangent that runs horizontally at angle t (1 = flat, 0 = vertical).
	const flatness = (t: number) => {
		const hx = aspect * Math.abs(Math.cos(t));
		return hx / Math.hypot(hx, Math.sin(t)) || 0;
	};
	let best = canonical;
	let bestScore = Infinity;
	for (let k = 0; k < K; k++) {
		const t0 = canonical + (k / K) * TAU;
		let flat = 0;
		let lean = 0;
		for (let i = 0; i < n; i++) {
			const t = t0 + i * step;
			flat += demand[i]! * flatness(t);
			lean += demand[i]! * Math.sin(t);
		}
		const score = flat + 0.6 * Math.abs(lean) + 1e-3 * Math.min(k, K - k);
		if (score < bestScore - 1e-9) {
			bestScore = score;
			best = t0;
		}
	}
	return norm(best);
}

/* ─── layout types ─── */

export type OrbitSun = { x: number; y: number; r: number; ringInner: number; ringMax: number; ring: string };

export type CategoryLabel = {
	side: Side;
	anchor: "start" | "middle" | "end";
	/** Text anchor x for both lines. */
	x: number;
	nameY: number;
	/** Font size of the name (smaller on small stages). */
	size: number;
	/** Null when only the name fits. */
	chip: Box | null;
	box: Box;
};

export type OrbitCategory = {
	id: string;
	label: string;
	order: number;
	/** Palette alternation (rose / lavender in Nebula). */
	tone: 0 | 1;
	angle: number;
	x: number;
	y: number;
	r: number;
	/** Largest radius across All/W1…W4 — what the layout reserved. */
	slotR: number;
	count: number;
	value: number;
	share: number;
	sharePct: number;
	shareText: string;
	side: Side;
	sector: { start: number; end: number };
	/** Null when no spot is free (tiny stages); the orb still carries an aria-label. */
	labelPos: CategoryLabel | null;
	beam: {
		d: string;
		filament: string;
		/** Even arc-length samples sun → category ("x,y x,y …"). */
		track: string;
		/** Chevron at the sun end, pointing inbound — the way work flows. */
		arrow: string;
		width: number;
		from: Point;
		to: Point;
		length: number;
	};
	senderCount: number;
	particles: { count: number; dur: number };
};

export type SenderLabel = {
	chip: Box | null;
	name: { text: string; x: number; y: number; anchor: "start" | "end"; box: Box } | null;
};

export type OrbitSender = {
	id: string;
	rank: number;
	/** Clockwise order around the ring, for arrow keys. */
	ring: number;
	category: string;
	person: boolean;
	angle: number;
	x: number;
	y: number;
	r: number;
	slotR: number;
	value: number;
	/** value / mode max, 0…1 */
	weight: number;
	side: Side;
	label: SenderLabel;
	link: string;
};

export type OrbitLayout = {
	width: number;
	height: number;
	cx: number;
	cy: number;
	scale: number;
	rings: { r1: { rx: number; ry: number }; r2: { rx: number; ry: number } };
	sun: OrbitSun;
	categories: OrbitCategory[];
	senders: OrbitSender[];
	week: WeekIndex | null;
	total: number;
};

export type OrbitInput = {
	senders: readonly OrbitNodeData[];
	groups: readonly OrbitGroup[];
};

/** Dedupe by id, keep the top 24 by count (stable for ties). */
export function normalizeSenders(senders: readonly OrbitNodeData[]): OrbitNodeData[] {
	const seen = new Set<string>();
	const out: OrbitNodeData[] = [];
	for (const s of senders) {
		const key = s.id.trim().toLowerCase();
		if (!key || seen.has(key)) continue;
		seen.add(key);
		out.push(s);
	}
	return out
		.map((s, i) => ({ s, i }))
		.sort((a, b) => senderValue(b.s, null) - senderValue(a.s, null) || a.i - b.i)
		.slice(0, MAX_SENDERS)
		.map(({ s }) => s);
}

/* ─── the constellation ─── */

export function layoutOrbit(
	sendersIn: readonly OrbitNodeData[],
	groupsIn: readonly OrbitGroup[],
	widthIn: number,
	heightIn: number,
	week: WeekIndex | null = null,
): OrbitLayout {
	const width = Math.max(120, Math.round(widthIn));
	const height = Math.max(120, Math.round(heightIn));
	const senders = normalizeSenders(sendersIn);
	const aggs = aggregateCategories(senders, groupsIn);
	const ringGroups = resolveGroups(senders, groupsIn);
	const ringIds = new Set(ringGroups.map((g) => g.id));
	const fallbackGroup = ringGroups.at(-1)?.id ?? "";

	const S = Math.min(width, height);
	const cx = width / 2;
	const cy = height / 2;
	const pad = 8;

	const sunR = clamp(S * 0.06, 14, 27);
	const ringInner = sunR + clamp(S * 0.012, 4, 6);
	const ringMax = clamp(S * 0.03, 6, 13);
	const catRMax = clamp(S * 0.04, 9, 18);
	const catRMin = clamp(S * 0.017, 5, 8);
	const sRMax = clamp(S * 0.031, 7, 14);
	const sRMin = clamp(S * 0.009, 3, 4.5);
	/** Largest radial nudge off ring 2 (see baseline clearing below). */
	const wobble = clamp(S * 0.04, 8, 19);
	const labelRoom = width >= 640 ? clamp(width * 0.11, 104, 160) : 0;

	const r2y = Math.max(40, Math.min(S * 0.42, height / 2 - pad - sRMax - wobble - 2));
	const r2xMax = width / 2 - pad - sRMax - wobble - 2;
	const r2x = Math.max(40, Math.min(clamp(width / 2 - pad - sRMax - wobble - labelRoom, r2y, r2y * 2.15), r2xMax));
	const r1x = r2x * (0.27 / 0.42);
	const r1y = r2y * (0.27 / 0.42);

	/* categories: evenly spaced, stable order */
	const n = aggs.length;
	const step = n ? TAU / n : TAU;
	const demand = aggs.map((c) => c.senderCount + 0.35);
	const theta0 = ringRotation(demand, r2x / r2y);
	const catValues = aggs.map((c) => (week === null ? c.count : c.weeks[week]));
	const catAllMax = Math.max(1, ...aggs.map((c) => c.count));
	const catWeekMax = Math.max(1, ...aggs.flatMap((c) => c.weeks));
	const catRadius = (v: number, max: number) => (v > 0 ? Math.max(catRMin, catRMax * Math.sqrt(v / max)) : catRMin * 0.8);
	const percents = sharePercents(catValues);
	const modeTotal = catValues.reduce((a, b) => a + b, 0);
	const modeMaxCat = Math.max(...catValues, 0);

	// Demand-weighted sectors: each gap between neighbours is split by how many senders each side must seat.
	const left = new Array<number>(n).fill(step / 2);
	const right = new Array<number>(n).fill(step / 2);
	if (n > 1) {
		for (let i = 0; i < n; i++) {
			const j = (i + 1) % n;
			right[i] = (step * demand[i]!) / (demand[i]! + demand[j]!);
			left[j] = step - right[i]!;
		}
	} else if (n === 1) {
		left[0] = Math.PI;
		right[0] = Math.PI;
	}

	const catGeo = aggs.map((c, i) => {
		const angle = norm(theta0 + i * step);
		const p = onEllipse(cx, cy, r1x, r1y, angle);
		const slotR = Math.max(catRadius(c.count, catAllMax), ...c.weeks.map((w) => catRadius(w, catWeekMax)));
		return { angle, ...p, slotR };
	});

	/* senders: clustered on their category's axis, evenly spaced by arc length */
	const arc = arcTable(r2x, r2y);
	const spacing = clamp(S * 0.14, 26, 70);
	type Slot = { s: OrbitNodeData; rank: number; cat: number; angle: number };
	const slots: Slot[] = [];
	const rankOf = new Map(senders.map((s, i) => [s, i]));
	aggs.forEach((c, ci) => {
		const members = senders.filter((s) => groupOf(s, ringIds, fallbackGroup) === c.id);
		const k = members.length;
		if (!k) return;
		const theta = catGeo[ci]!.angle;
		// arc.at is monotonic over all reals, so sectors that straddle 12 o'clock need no special case.
		const la = arc.at(theta - left[ci]!);
		const lb = arc.at(theta + right[ci]!);
		const sp = Math.min(spacing, (lb - la) / k);
		const axis = arc.at(theta);
		const half = ((k - 1) * sp) / 2;
		const lc = clamp(axis, la + sp / 2 + half, lb - sp / 2 - half);
		const positions = Array.from({ length: k }, (_, j) => lc - half + j * sp);
		// Biggest sender takes the slot nearest the category axis, then alternate outward.
		const order = positions
			.map((pos, j) => ({ pos, j, d: Math.abs(pos - axis) }))
			.sort((x, y) => x.d - y.d || x.j - y.j);
		members.forEach((s, m) => {
			slots.push({ s, rank: rankOf.get(s)!, cat: ci, angle: norm(arc.inverse(order[m]!.pos)) });
		});
	});

	const ringOrder = [...slots].sort((a, b) => a.angle - b.angle || a.rank - b.rank);
	const ringIndex = new Map(ringOrder.map((sl, i) => [sl, i]));

	// Labels run horizontally, so neighbours on the same side need different baselines.
	// Where the ring is flat (top/bottom) nudge a node in or out until it clears the
	// baselines of nearby nodes; on the steep sides the spacing already does it.
	const baseline = LABEL_H + 5;
	const nudged = new Map<Slot, Point>();
	const settled: { x: number; y: number; side: Side }[] = [];
	for (const sl of ringOrder) {
		const t = sl.angle;
		const base = onEllipse(cx, cy, r2x, r2y, t);
		const side: Side = base.x >= cx - 0.5 ? "right" : "left";
		const c = Math.cos(t);
		const near = settled.filter((p) => p.side === side && Math.abs(p.x - base.x) < 150).map((p) => base.y - p.y);
		let off = 0;
		if (near.some((dy) => Math.abs(dy) < baseline) && Math.abs(c) > 0.08) {
			const clears = (o: number) => Math.min(...near.map((dy) => Math.abs(dy - o * c)));
			const candidates = [0, -wobble, wobble, ...near.flatMap((dy) => [(dy - baseline) / c, (dy + baseline) / c])]
				.filter((o) => Math.abs(o) <= wobble + 1e-9)
				.sort((a, b) => Math.abs(a) - Math.abs(b) || b - a);
			const ok = candidates.find((o) => clears(o) >= baseline - 1e-6);
			off = ok ?? candidates.reduce((best, o) => (clears(o) > clears(best) + 1e-9 ? o : best), 0);
		}
		const p = onEllipse(cx, cy, r2x + off, r2y + off, t);
		nudged.set(sl, p);
		settled.push({ ...p, side });
	}
	const allMax = Math.max(1, ...senders.map((s) => senderValue(s, null)));
	const weekMax = Math.max(1, ...senders.flatMap((s) => WEEKS.map((w) => senderValue(s, w))));
	const radius = (v: number, max: number) => (v > 0 ? Math.max(sRMin, sRMax * Math.sqrt(v / max)) : sRMin * 0.75);

	type Node = {
		slot: Slot;
		ring: number;
		x: number;
		y: number;
		rAll: number;
		rWeeks: number[];
		slotR: number;
	};
	const nodes: Node[] = slots.map((slot) => {
		const ring = ringIndex.get(slot)!;
		const p = nudged.get(slot)!;
		const rAll = radius(senderValue(slot.s, null), allMax);
		const rWeeks = WEEKS.map((w) => radius(senderValue(slot.s, w), weekMax));
		const slotR = Math.max(rAll, ...rWeeks);
		return {
			slot,
			ring,
			x: clamp(p.x, pad + slotR, width - pad - slotR),
			y: clamp(p.y, pad + slotR, height - pad - slotR),
			rAll,
			rWeeks,
			slotR,
		};
	});

	// Shrink (never move) until no two orbs touch — the guarantee the tests check.
	const minGap = 3;
	const scaleNode = (nd: Node, f: number) => {
		nd.rAll *= f;
		nd.rWeeks = nd.rWeeks.map((r) => r * f);
		nd.slotR *= f;
	};
	for (let pass = 0; pass < 6; pass++) {
		let changed = false;
		for (let i = 0; i < nodes.length; i++) {
			for (let j = i + 1; j < nodes.length; j++) {
				const a = nodes[i]!;
				const b = nodes[j]!;
				const d = Math.hypot(a.x - b.x, a.y - b.y);
				if (d < a.slotR + b.slotR + minGap) {
					const f = Math.max(0.05, (d - minGap) / (a.slotR + b.slotR));
					scaleNode(a, f);
					scaleNode(b, f);
					changed = true;
				}
			}
			const a = nodes[i]!;
			for (const c of catGeo) {
				const d = Math.hypot(a.x - c.x, a.y - c.y);
				if (d < a.slotR + c.slotR + minGap) {
					scaleNode(a, Math.max(0.05, (d - minGap - c.slotR) / a.slotR));
					changed = true;
				}
			}
		}
		if (!changed) break;
	}

	/* beams */
	const sunRingOuter = ringInner + ringMax;
	const modeMaxSenderValue = Math.max(0, ...senders.map((s) => senderValue(s, week)));
	const wMax = clamp(S * 0.017, 3.5, 8);
	const beamGeo = catGeo.map((c, i) => {
		const dx = c.x - cx;
		const dy = c.y - cy;
		const len = Math.hypot(dx, dy) || 1;
		const ux = dx / len;
		const uy = dy / len;
		const from = { x: cx + ux * (sunR + 2), y: cy + uy * (sunR + 2) };
		const to = { x: c.x - ux * (c.slotR + 3), y: c.y - uy * (c.slotR + 3) };
		const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
		const bl = Math.hypot(to.x - from.x, to.y - from.y);
		// Consistent swirl: every beam bends the same rotational way.
		const ctrl = { x: mid.x - uy * bl * 0.13, y: mid.y + ux * bl * 0.13 };
		const ctrl2 = { x: mid.x - uy * bl * 0.3, y: mid.y + ux * bl * 0.3 };
		const value = catValues[i]!;
		const width = r2(1.25 + (wMax - 1.25) * (modeMaxCat > 0 ? value / modeMaxCat : 0));
		// The chevron sits where the beam clears the sun's tick ring, pointing back along it.
		let tipT = 0;
		let tip = from;
		while (tipT < 0.5 && Math.hypot(tip.x - cx, tip.y - cy) < sunRingOuter + 5) {
			tipT += 0.01;
			tip = quad(from, ctrl, to, tipT);
		}
		const inbound = {
			x: -(2 * (1 - tipT) * (ctrl.x - from.x) + 2 * tipT * (to.x - ctrl.x)),
			y: -(2 * (1 - tipT) * (ctrl.y - from.y) + 2 * tipT * (to.y - ctrl.y)),
		};
		return {
			d: quadPath(from, ctrl, to),
			filament: quadPath(from, ctrl2, to),
			track: quadTrack(from, ctrl, to),
			arrow: chevron(tip, inbound, 3.5 + width),
			width,
			from,
			ctrl,
			to,
			length: quadLength(from, ctrl, to),
		};
	});

	/* labels: categories first (they are essential), then senders by rank */
	const sunObstacle = { c: { x: cx, y: cy }, r: sunRingOuter + 4 };
	const catCircles = catGeo.map((c) => ({ c: { x: c.x, y: c.y }, r: c.slotR + 4 }));
	const senderCircles = nodes.map((nd) => ({ c: { x: nd.x, y: nd.y }, r: nd.slotR + 2 }));
	const beamSegments = beamGeo.flatMap((b) => {
		const segs: { p: Point; q: Point; hw: number }[] = [];
		let prev = b.from;
		for (let i = 1; i <= 10; i++) {
			const p = quad(b.from, b.ctrl, b.to, i / 10);
			segs.push({ p: prev, q: p, hw: wMax / 2 + 2 });
			prev = p;
		}
		return segs;
	});

	// Biggest categories choose first. Hard constraints (bounds, the sun, other
	// category orbs and labels) are never broken; sender orbs and beams are
	// avoided when possible. Fallbacks: drop the % chip, then the label.
	const placed: Box[] = [];
	const catFont = S < 420 ? 12.5 : CATEGORY_NAME_SIZE;
	const catLabels: (CategoryLabel | null)[] = new Array(catGeo.length).fill(null);
	const catPriority = catGeo.map((_, i) => i).sort((a, b) => aggs[b]!.count - aggs[a]!.count || a - b);
	for (const i of catPriority) {
		const c = catGeo[i]!;
		const name = aggs[i]!.label;
		const nameW = textWidth(name, catFont);
		const nameH = Math.round(catFont + 3);
		const chipW = chipWidth(4);
		const side: Side = c.x >= cx - 0.5 ? "right" : "left";
		const out = side === "right" ? 1 : -1;
		const gap = c.slotR + 8;
		const diag = c.slotR * 0.7 + 4;
		const variants = [
			{ withChip: true, w: Math.max(nameW, chipW), h: nameH + 3 + 16 },
			{ withChip: false, w: nameW, h: nameH },
		];
		const hard = (b: Box) =>
			!boxInside(b, width, height, 2) ||
			boxHitsCircle(b, sunObstacle.c, sunObstacle.r) ||
			catCircles.some((o, k) => k !== i && boxHitsCircle(b, o.c, o.r)) ||
			placed.some((p) => boxesHit(p, b, 4));
		const soft = (b: Box) =>
			senderCircles.filter((o) => boxHitsCircle(b, o.c, o.r)).length +
			(beamSegments.some((sg) => segHitsBox(sg.p, sg.q, b, sg.hw)) ? 1 : 0);
		type Cand = { box: Box; anchor: CategoryLabel["anchor"]; x: number };
		// Anchored beside the orb (outward first), above/below it, then off its diagonals.
		const beside = (dir: number, w: number, h: number, dy = 0): Cand => ({
			box: { x: dir > 0 ? c.x + gap : c.x - gap - w, y: c.y - h / 2 + dy, w, h },
			anchor: dir > 0 ? "start" : "end",
			x: c.x + dir * gap,
		});
		const corner = (dir: number, up: boolean, w: number, h: number): Cand => ({
			box: { x: dir > 0 ? c.x + diag : c.x - diag - w, y: up ? c.y - diag - h : c.y + diag, w, h },
			anchor: dir > 0 ? "start" : "end",
			x: c.x + dir * diag,
		});
		let chosen: (Cand & { withChip: boolean }) | null = null;
		for (const v of variants) {
			const { w, h } = v;
			const candidates: Cand[] = [
				beside(out, w, h),
				{ box: { x: c.x - w / 2, y: c.y - c.slotR - 6 - h, w, h }, anchor: "middle", x: c.x },
				{ box: { x: c.x - w / 2, y: c.y + c.slotR + 6, w, h }, anchor: "middle", x: c.x },
				corner(out, true, w, h),
				corner(out, false, w, h),
				beside(-out, w, h),
				corner(-out, true, w, h),
				corner(-out, false, w, h),
			];
			let bestSoft = Infinity;
			for (const cand of candidates) {
				if (hard(cand.box)) continue;
				const sc = soft(cand.box);
				if (sc < bestSoft) {
					bestSoft = sc;
					chosen = { ...cand, withChip: v.withChip };
				}
				if (sc === 0) break;
			}
			if (chosen) break;
		}
		if (!chosen) continue;
		const box = chosen.box;
		placed.push(box);
		const chipX = chosen.anchor === "start" ? box.x : chosen.anchor === "end" ? box.x + box.w - chipW : chosen.x - chipW / 2;
		catLabels[i] = {
			side,
			anchor: chosen.anchor,
			x: chosen.anchor === "start" ? box.x : chosen.anchor === "end" ? box.x + box.w : chosen.x,
			nameY: box.y + nameH / 2,
			size: catFont,
			chip: chosen.withChip ? { x: chipX, y: box.y + nameH + 3, w: chipW, h: 16 } : null,
			box,
		};
	}

	const catBoxes = [...placed];
	const unitBoxes: Box[] = [];
	const byRank = [...nodes].sort((a, b) => a.slot.rank - b.slot.rank);
	const labels = new Map<Node, SenderLabel>();
	for (const nd of byRank) {
		const s = nd.slot.s;
		const side: Side = nd.x >= cx - 0.5 ? "right" : "left";
		const out = side === "right" ? 1 : -1;
		const digits = String(Math.round(Math.max(senderValue(s, null), ...WEEKS.map((w) => senderValue(s, w))))).length;
		const cw = chipWidth(digits);
		const text = shortLabel(displayNameOf(s));
		const nw = textWidth(text, SENDER_NAME_SIZE);
		const others = senderCircles.filter((_, k) => nodes[k] !== nd);
		const clear = (b: Box) =>
			boxInside(b, width, height, 2) &&
			!boxHitsCircle(b, sunObstacle.c, sunObstacle.r) &&
			!catCircles.some((o) => boxHitsCircle(b, o.c, o.r)) &&
			!others.some((o) => boxHitsCircle(b, o.c, o.r)) &&
			!catBoxes.some((p) => boxesHit(p, b, 3)) &&
			!unitBoxes.some((p) => boxesHit(p, b, 3));

		const chipAt = (dy: number, inset: number): Box => {
			const x0 = out > 0 ? nd.x + inset : nd.x - inset - cw;
			return { x: x0, y: nd.y + dy - CHIP_H / 2, w: cw, h: CHIP_H };
		};
		const nameAfter = (chip: Box): Box => {
			const x0 = out > 0 ? chip.x + chip.w + 5 : chip.x - 5 - nw;
			return { x: x0, y: chip.y + (CHIP_H - LABEL_H) / 2, w: nw, h: LABEL_H };
		};
		const lift = nd.slotR * 0.8 + CHIP_H / 2 + 1;
		const chipCandidates = [
			chipAt(0, nd.slotR + 4),
			chipAt(-lift, nd.slotR * 0.45),
			chipAt(lift, nd.slotR * 0.45),
		];

		let label: SenderLabel = { chip: null, name: null };
		for (const chip of chipCandidates) {
			const name = nameAfter(chip);
			if (clear(chip) && clear(name) && !boxesHit(chip, name)) {
				label = {
					chip,
					name: {
						text,
						x: out > 0 ? name.x : name.x + name.w,
						y: name.y + LABEL_H / 2,
						anchor: out > 0 ? "start" : "end",
						box: name,
					},
				};
				break;
			}
		}
		if (!label.chip) {
			const chip = chipCandidates.find(clear);
			if (chip) label = { chip, name: null };
		}
		if (label.chip) unitBoxes.push(label.chip);
		if (label.name) unitBoxes.push(label.name.box);
		labels.set(nd, label);
	}

	/* recency → particle speed (relative to the newest activity in the data, not the clock) */
	const newest = Math.max(...aggs.map((c) => c.lastAt), -Infinity);
	const maxShare = Math.max(...catValues, 0);

	const categoriesOut: OrbitCategory[] = aggs.map((c, i) => {
		const g = catGeo[i]!;
		const value = catValues[i]!;
		const ageH = Number.isFinite(c.lastAt) && Number.isFinite(newest) ? (newest - c.lastAt) / HOUR : 96;
		const fresh = 1 - clamp(ageH / 96, 0, 1);
		const speed = lerp(38, 115, fresh);
		const b = beamGeo[i]!;
		return {
			id: c.id,
			label: c.label,
			order: i,
			tone: (i % 2) as 0 | 1,
			angle: g.angle,
			x: r2(g.x),
			y: r2(g.y),
			r: r2(week === null ? catRadius(c.count, catAllMax) : catRadius(value, catWeekMax)),
			slotR: r2(g.slotR),
			count: c.count,
			value,
			share: modeTotal > 0 ? value / modeTotal : 0,
			sharePct: percents[i]!,
			shareText: formatShare(percents[i]!, value),
			side: g.x >= cx - 0.5 ? "right" : "left",
			sector: { start: g.angle - left[i]!, end: g.angle + right[i]! },
			labelPos: catLabels[i] ?? null,
			beam: { d: b.d, filament: b.filament, track: b.track, arrow: b.arrow, width: b.width, from: b.from, to: b.to, length: r2(b.length) },
			senderCount: c.senderCount,
			particles: {
				count: value > 0 ? 1 + Math.round((2 * value) / (maxShare || 1)) : 0,
				dur: r2(clamp(b.length / speed, 1.2, 9)),
			},
		};
	});

	const sendersOut: OrbitSender[] = byRank.map((nd) => {
		const s = nd.slot.s;
		const value = senderValue(s, week);
		const cat = catGeo[nd.slot.cat]!;
		return {
			id: s.id,
			rank: nd.slot.rank,
			ring: nd.ring,
			category: aggs[nd.slot.cat]!.id,
			person: s.kind === "agent",
			angle: nd.slot.angle,
			x: r2(nd.x),
			y: r2(nd.y),
			r: r2(week === null ? nd.rAll : nd.rWeeks[week]!),
			slotR: r2(nd.slotR),
			value,
			weight: modeMaxSenderValue > 0 ? value / modeMaxSenderValue : 0,
			side: nd.x >= cx - 0.5 ? "right" : "left",
			label: labels.get(nd)!,
			link: `M${r2(cat.x)} ${r2(cat.y)}L${r2(nd.x)} ${r2(nd.y)}`,
		};
	});

	const sunTicks = activityTicks(combinedDaily(senders), cx, cy, ringInner, ringMax);

	return {
		width,
		height,
		cx,
		cy,
		scale: S,
		rings: { r1: { rx: r2(r1x), ry: r2(r1y) }, r2: { rx: r2(r2x), ry: r2(r2y) } },
		sun: { x: cx, y: cy, r: r2(sunR), ringInner: r2(ringInner), ringMax: r2(ringMax), ring: ticksPath(sunTicks) },
		categories: categoriesOut,
		senders: sendersOut,
		week,
		total: modeTotal,
	};
}

function displayNameOf(s: OrbitNodeData): string {
	return s.name?.trim() || s.id;
}

/** True when angle t lies in [start, end] on the circle (inclusive, wrap-aware). */
export function inSector(t: number, sector: { start: number; end: number }): boolean {
	const span = sector.end - sector.start;
	if (span >= TAU - 1e-9) return true;
	const rel = norm(t - sector.start);
	return rel <= span + 1e-9;
}

/* ─── drilldown ─── */

export type FocusCardId = "rows" | "flagged" | "timing" | "recency" | "extra";
export type FocusCard = Box & { id: FocusCardId; cy: number };

export type FocusLayout = {
	compact: boolean;
	width: number;
	height: number;
	orb: { x: number; y: number; r: number };
	ring: { inner: number; maxLen: number; outer: number };
	cards: FocusCard[];
	curves: string[];
	detail: Box;
};

export const FOCUS_MIN_WIDTH = 720;
export const CARD_H = 60;
const CARD_GAP = 10;

export function layoutFocus(widthIn: number, heightIn: number, cardIds: readonly FocusCardId[]): FocusLayout {
	const width = Math.max(120, Math.round(widthIn));
	const height = Math.max(120, Math.round(heightIn));
	const S = Math.min(width, height);
	const r = clamp(S * 0.066, 22, 32);
	const inner = r + 9;
	const maxLen = clamp(S * 0.05, 16, 24);
	const outer = inner + maxLen;

	if (width < FOCUS_MIN_WIDTH) {
		const size = 2 * (outer + 10);
		return {
			compact: true,
			width,
			height: size,
			orb: { x: size / 2, y: size / 2, r },
			ring: { inner, maxLen, outer },
			cards: [],
			curves: [],
			detail: { x: 0, y: 0, w: width, h: 0 },
		};
	}

	const margin = 20;
	let orbX = clamp(width * 0.14, outer + 44, 176);
	let gap1 = clamp(width * 0.085, 52, 128);
	const cardW = clamp(width * 0.17, 176, 216);
	let gap2 = clamp(width * 0.06, 44, 100);
	const detailMax = 460;
	const used = orbX + outer + gap1 + cardW + gap2;
	const detailW = clamp(width - used - margin, 240, detailMax);
	const free = width - margin - (used + detailW);
	if (free > 0) {
		orbX += free * 0.2;
		gap1 += free * 0.35;
		gap2 += free * 0.25;
	}
	const orbY = height / 2;
	const cardsX = orbX + outer + gap1;
	const total = cardIds.length * CARD_H + Math.max(0, cardIds.length - 1) * CARD_GAP;
	const top = orbY - total / 2;
	const cards: FocusCard[] = cardIds.map((id, i) => {
		const y = top + i * (CARD_H + CARD_GAP);
		return { id, x: r2(cardsX), y: r2(y), w: r2(cardW), h: CARD_H, cy: r2(y + CARD_H / 2) };
	});
	const from = { x: orbX + outer + 6, y: orbY };
	const curves = cards.map((c) => fanCurve(from, { x: c.x - 2, y: c.cy }));
	const detailX = cardsX + cardW + gap2;
	return {
		compact: false,
		width,
		height,
		orb: { x: r2(orbX), y: r2(orbY), r },
		ring: { inner, maxLen, outer },
		cards,
		curves,
		detail: { x: r2(detailX), y: 12, w: r2(Math.min(detailW, width - detailX - 12)), h: height - 24 },
	};
}

export const ROW_H = 54;
export const ROW_GAP = 8;
export const ROWS_HEADER = 30;

/** Vertical stack of `count` rows in the detail column, centred in the stage. */
export function stackRows(detail: Box, count: number): { top: number; centers: number[] } {
	const total = ROWS_HEADER + count * ROW_H + Math.max(0, count - 1) * ROW_GAP;
	const top = clamp(detail.y + (detail.h - total) / 2, detail.y, Math.max(detail.y, detail.y + detail.h - total));
	const first = top + ROWS_HEADER;
	return { top: r2(top), centers: Array.from({ length: count }, (_, i) => r2(first + i * (ROW_H + ROW_GAP) + ROW_H / 2)) };
}

/**
 * How far right each row sits so the stack bows along a circle centred level
 * with `originY` — rows far from the fan's origin tuck back toward it.
 */
export function arcOffsets(centers: readonly number[], originY: number, radius: number): number[] {
	if (centers.length < 2) return centers.map(() => 0);
	const offs = centers.map((y) => {
		const dy = Math.min(Math.abs(y - originY), radius);
		return radius - Math.sqrt(radius * radius - dy * dy);
	});
	const max = Math.max(...offs);
	// Bow outward: the row nearest the origin reaches furthest right.
	return offs.map((o) => r2(max - o));
}

/** Where a single detail panel sits: level with its card, kept inside the stage. */
export function panelTop(detail: Box, anchorY: number, estimatedH: number): number {
	return r2(clamp(anchorY - 28, detail.y, Math.max(detail.y, detail.y + detail.h - estimatedH)));
}
