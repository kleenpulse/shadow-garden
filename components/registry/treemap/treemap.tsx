"use client";

import {
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
	type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useAnimationLoop } from "@/hooks/use-animation-loop";
import {
	layoutTree,
	type LayoutOptions,
	type Rect,
	type TreemapCell,
	type TreemapNode,
} from "./treemap-layout";

// A treemap you can walk into. Every node is a rectangle whose area is its
// share of the whole, and a node with children is a frame with its children
// packed inside it. Click a frame and it grows to fill the view.
//
// ONE PARENT. Every cell at every level is a child of the same element and is
// moved with a transform. A nested DOM would have to reparent a cell whenever
// the view changes, and reparenting is a remount: the transition dies and so
// does keyboard focus. Kept flat, a cell that is on screen before and after a
// zoom is the same element, and the browser tweens it for free.
//
// THE ZOOM. A zoom is a new layout, not a scale: gaps and label strips stay
// the same size in px at every level. What makes it read as one camera move is
// how cells arrive and leave. One node is on screen in both layouts (the frame
// you clicked, or the view you are backing out of), so its two rectangles give
// a mapping between the old picture and the new one. A cell that is new starts
// where that mapping says it would have been, and a cell that is leaving is
// sent to where it would have ended up.
//
// LIVE. With `live` on, leaf values wander and the map is laid out again every
// beat. Siblings are ordered by their starting size, not their current one, so
// a value that overtakes its neighbour changes two areas and never swaps two
// positions.
//
// Size comes from the animation host, which also runs the beat. Arrow keys
// move between cells by where they are on screen, not by order in the tree.

export type { TreemapNode } from "./treemap-layout";

export type TreemapColorBy = "branch" | "size" | "depth";

export interface TreemapProps {
	/** The root. Its children are the first thing you see. */
	data: TreemapNode;
	/** Space between cells, in px. */
	gap?: number;
	/** How many levels are drawn below the node in view. */
	depth?: number;
	/** Let leaf values wander, and lay the map out again as they do. */
	live?: boolean;
	/** How often the live values change. */
	speed?: number;
	/** Print a name and a value in every cell that has room. */
	labels?: boolean;
	/** What a cell's shade means. */
	colorBy?: TreemapColorBy;
	/** How long a zoom or a reflow takes, in ms. */
	duration?: number;
	/** Corner radius of a cell, in px. */
	radius?: number;
	/** The strong end of the color ramp. */
	accentColor?: string;
	/** The weak end of the ramp, and the ground under the cells. */
	baseColor?: string;
	/** How a value is printed. */
	formatValue?: (value: number) => string;
	/** Called for a cell that has nothing inside it to zoom into. */
	onSelect?: (node: TreemapNode) => void;
	/** Name read out for the map. */
	label?: string;
	/** Hold the live values where they are. */
	paused?: boolean;
	/** No live changes, and zooms cut instead of moving. */
	reducedMotion?: boolean;
	className?: string;
}

type RGB = [number, number, number];

interface Entry {
	node: TreemapNode;
	parent: string | null;
	/** Position in a walk of the whole tree, parents first. */
	order: number;
	/** Size before any live change. */
	base: number;
}

interface Exit {
	cell: TreemapCell;
	to: Rect;
}

/** Height of the label strip on a group, in px. */
const HEADER = 20;
/** Seconds between live changes at speed 1. */
const BEAT = 1.6;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const compact =
	typeof Intl !== "undefined"
		? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })
		: null;
const defaultFormat = (value: number) =>
	compact ? compact.format(value) : String(Math.round(value));

export default function Treemap({
	data,
	gap = 3,
	depth = 2,
	live = true,
	speed = 1,
	labels = true,
	colorBy = "branch",
	duration = 520,
	radius = 4,
	accentColor = "#a855f7",
	baseColor = "#16121f",
	formatValue = defaultFormat,
	onSelect,
	label = "Treemap",
	paused = false,
	reducedMotion = false,
	className = "",
}: TreemapProps) {
	const mapRef = useRef<HTMLDivElement>(null);
	const els = useRef(new Map<string, HTMLDivElement>());
	const enters = useRef<Map<string, Rect> | null>(null);
	const refocus = useRef(false);
	const calm = useRef<number | null>(null);
	const beat = useRef(0);

	const systemStill = useSyncExternalStore(
		subscribeMotion,
		readMotion,
		readMotionOnServer,
	);
	const still = reducedMotion || systemStill;

	const [size, setSize] = useState({ w: 0, h: 0 });
	const [instant, setInstant] = useState(false);
	const [factors, setFactors] = useState<Map<string, number>>(() => new Map());
	const [view, setView] = useState<{ focus: string; key: number; exits: Exit[] }>({
		focus: data.id,
		key: 0,
		exits: [],
	});
	const [active, setActive] = useState<string | null>(null);
	const [hover, setHover] = useState<string | null>(null);
	const [keyboard, setKeyboard] = useState(false);

	const index = useMemo(() => {
		const map = new Map<string, Entry>();
		let order = 0;
		const walk = (node: TreemapNode, parent: string | null): number => {
			const entry: Entry = { node, parent, order: order++, base: 0 };
			map.set(node.id, entry);
			entry.base = node.children?.length
				? node.children.reduce((sum, kid) => sum + walk(kid, node.id), 0)
				: Math.max(0, node.value ?? 0);
			return entry.base;
		};
		walk(data, null);
		return map;
	}, [data]);

	const leaves = useMemo(
		() =>
			[...index.values()]
				.filter((entry) => !entry.node.children?.length)
				.map((entry) => entry.node.id),
		[index],
	);

	const totals = useMemo(() => {
		const map = new Map<string, number>();
		const walk = (node: TreemapNode): number => {
			const value = node.children?.length
				? node.children.reduce((sum, kid) => sum + walk(kid), 0)
				: Math.max(0, node.value ?? 0) * (factors.get(node.id) ?? 1);
			map.set(node.id, value);
			return value;
		};
		walk(data);
		return map;
	}, [data, factors]);

	const levels = clamp(Math.round(depth), 1, 4);
	const space = Math.max(0, gap);
	const options = useMemo<LayoutOptions>(
		() => ({
			depth: levels,
			gap: space,
			header: HEADER,
			valueOf: (node) => totals.get(node.id) ?? 0,
			orderOf: (node) => index.get(node.id)?.base ?? 0,
		}),
		[levels, space, totals, index],
	);

	const focusId = index.has(view.focus) ? view.focus : data.id;
	const focusNode = index.get(focusId)?.node ?? data;

	const cells = useMemo(
		() =>
			size.w > 0 && size.h > 0
				? layoutTree(focusNode, size.w, size.h, options)
				: [],
		[focusNode, size, options],
	);

	useAnimationLoop({
		target: mapRef,
		halted: paused || still || !live,
		dpr: 1,
		onResize: (m) => {
			setSize((s) =>
				s.w === m.width && s.h === m.height ? s : { w: m.width, h: m.height },
			);
			// A resize is not a zoom: the cells follow the box at once, and
			// tweening is switched back on once the drag has stopped.
			setInstant(true);
			if (calm.current !== null) window.clearTimeout(calm.current);
			calm.current = window.setTimeout(() => {
				calm.current = null;
				setInstant(false);
			}, 140);
		},
		onFrame: ({ dt }) => {
			beat.current += dt * Math.max(0, speed);
			if (beat.current < BEAT) return;
			beat.current = 0;
			setFactors((prev) => wander(prev, leaves));
		},
	});

	useEffect(
		() => () => {
			if (calm.current !== null) window.clearTimeout(calm.current);
		},
		[],
	);

	const ms = still || instant ? 0 : Math.max(0, duration);
	const transition =
		ms > 0
			? `transform ${ms}ms ${EASE}, width ${ms}ms ${EASE}, height ${ms}ms ${EASE}, opacity ${ms}ms ease, background-color 240ms ease, filter 160ms ease`
			: "none";

	const navigable = cells.filter((cell) => !cell.group);
	const activeId = navigable.some((cell) => cell.id === active)
		? active
		: (navigable[0]?.id ?? null);

	const isUnder = (id: string, ancestor: string): boolean => {
		let at: string | null = id;
		while (at) {
			if (at === ancestor) return true;
			at = index.get(at)?.parent ?? null;
		}
		return false;
	};

	const zoomTo = (nextId: string) => {
		const entry = index.get(nextId);
		if (!entry || nextId === focusId || size.w <= 0 || size.h <= 0) return;
		const next = layoutTree(entry.node, size.w, size.h, options);
		const before = new Map(cells.map((cell) => [cell.id, cell]));
		const after = new Map(next.map((cell) => [cell.id, cell]));

		// The node that is on screen in both layouts, as a pair of rectangles:
		// where it is now and where it will be.
		const full: Rect = { x: 0, y: 0, w: size.w, h: size.h };
		let from: Rect = full;
		let to: Rect = full;
		const target = before.get(nextId);
		if (target) {
			from = target;
		} else {
			let at: string | null = focusId;
			while (at) {
				const found = after.get(at);
				if (found) {
					to = found;
					break;
				}
				at = index.get(at)?.parent ?? null;
			}
		}
		// A cell that arrives or leaves is placed against the closest thing
		// above it that is on screen both before and after: it keeps its place
		// inside that frame for the whole move, so children never spill out of
		// a parent that is growing around them. With no such frame, the pair
		// above stands in for the whole view.
		const pairFor = (id: string): { old: Rect; next: Rect } => {
			let at = index.get(id)?.parent ?? null;
			while (at) {
				const old = before.get(at);
				const now = after.get(at);
				if (old && now) return { old, next: now };
				at = index.get(at)?.parent ?? null;
			}
			return { old: from, next: to };
		};

		const moving = ms > 0;
		const starts = new Map<string, Rect>();
		if (moving) {
			for (const cell of next) {
				if (before.has(cell.id)) continue;
				const pair = pairFor(cell.id);
				starts.set(cell.id, remap(cell, pair.next, pair.old));
			}
		}
		enters.current = moving ? starts : null;
		const exits: Exit[] = moving
			? cells
					.filter((cell) => !after.has(cell.id))
					.map((cell) => {
						const pair = pairFor(cell.id);
						return { cell, to: remap(cell, pair.old, pair.next) };
					})
			: [];

		// Keep the keyboard somewhere sensible: the same cell if it survived,
		// otherwise the first cell in the branch the old view belonged to.
		const open = next.filter((cell) => !cell.group);
		const keep =
			open.find((cell) => cell.id === activeId) ??
			open.find((cell) => cell.id === focusId) ??
			open.find((cell) => isUnder(cell.id, focusId)) ??
			open[0];
		refocus.current = Boolean(mapRef.current?.contains(document.activeElement));
		// No live change until the zoom has landed: a new layout halfway
		// through would send every cell somewhere else mid-flight.
		beat.current = Math.min(0, BEAT - (ms / 1000) * Math.max(0, speed) - 0.1);
		setActive(keep?.id ?? null);
		setHover(null);
		setView((v) => ({ focus: nextId, key: v.key + 1, exits }));
	};

	// New cells are put at their starting rectangle with tweening off, the
	// browser is made to notice, and then they are sent to where React already
	// drew them. Everything else on screen tweens on its own.
	useLayoutEffect(() => {
		const starts = enters.current;
		enters.current = null;
		if (starts && starts.size > 0) {
			const moved: [HTMLDivElement, TreemapCell][] = [];
			for (const cell of cells) {
				const start = starts.get(cell.id);
				const el = els.current.get(cell.id);
				if (!start || !el) continue;
				el.style.transition = "none";
				el.style.transform = `translate(${start.x}px, ${start.y}px)`;
				el.style.width = `${Math.max(0, start.w)}px`;
				el.style.height = `${Math.max(0, start.h)}px`;
				el.style.opacity = "0";
				moved.push([el, cell]);
			}
			if (moved.length > 0) {
				void mapRef.current?.offsetWidth;
				for (const [el, cell] of moved) {
					el.style.transition = transition;
					el.style.transform = `translate(${cell.x}px, ${cell.y}px)`;
					el.style.width = `${cell.w}px`;
					el.style.height = `${cell.h}px`;
					el.style.opacity = "1";
				}
			}
		}
		if (refocus.current) {
			refocus.current = false;
			if (activeId) els.current.get(activeId)?.focus({ preventScroll: true });
		}
		// Runs once per zoom; everything it reads belongs to that render.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [view.key]);

	// Cells that left are dropped once they have finished leaving.
	const leaving = view.exits.length;
	useEffect(() => {
		if (leaving === 0) return;
		const key = view.key;
		const id = window.setTimeout(
			() => setView((v) => (v.key === key ? { ...v, exits: [] } : v)),
			ms + 60,
		);
		return () => window.clearTimeout(id);
	}, [view.key, leaving, ms]);

	const activate = (cell: TreemapCell) => {
		const top = index.get(cell.top)?.node;
		if (top?.children?.length) zoomTo(top.id);
		else onSelect?.(cell.node);
	};

	const up = (): boolean => {
		const parent = index.get(focusId)?.parent;
		if (!parent) return false;
		zoomTo(parent);
		return true;
	};

	// Nearest cell in a direction, by centers. Distance across the direction
	// counts double, so a step right prefers the cell that is level with you.
	const step = (from: TreemapCell, dx: number, dy: number) => {
		const cx = from.x + from.w / 2;
		const cy = from.y + from.h / 2;
		let best: TreemapCell | null = null;
		let bestScore = Infinity;
		for (const cell of navigable) {
			if (cell.id === from.id) continue;
			const ox = cell.x + cell.w / 2 - cx;
			const oy = cell.y + cell.h / 2 - cy;
			const along = ox * dx + oy * dy;
			if (along <= 1) continue;
			const across = Math.abs(ox * dy) + Math.abs(oy * dx);
			const score = along + across * 2;
			if (score < bestScore) {
				bestScore = score;
				best = cell;
			}
		}
		if (!best) return;
		setActive(best.id);
		els.current.get(best.id)?.focus({ preventScroll: true });
	};

	const onCellKey = (e: ReactKeyboardEvent<HTMLDivElement>, cell: TreemapCell) => {
		switch (e.key) {
			case "ArrowRight":
				step(cell, 1, 0);
				break;
			case "ArrowLeft":
				step(cell, -1, 0);
				break;
			case "ArrowDown":
				step(cell, 0, 1);
				break;
			case "ArrowUp":
				step(cell, 0, -1);
				break;
			case "Enter":
			case " ":
				activate(cell);
				break;
			case "Backspace":
			case "Escape":
				if (!up()) return;
				break;
			default:
				return;
		}
		e.preventDefault();
		e.stopPropagation();
	};

	const base = parseColor(baseColor) ?? [22, 18, 31];
	const accent = parseColor(accentColor) ?? [168, 85, 247];
	const ink = luma(base) > 0.55 ? "#0b0a10" : "#f4f0ff";
	let largest = 0;
	for (const cell of navigable) if (cell.value > largest) largest = cell.value;

	const fillOf = (cell: TreemapCell): RGB => {
		if (cell.group) return mix(base, accent, 0.07);
		const within =
			cell.depth > 1 && cell.siblings > 1 ? cell.rank / (cell.siblings - 1) : 0;
		if (colorBy === "size") {
			const share = largest > 0 ? cell.value / largest : 0;
			return mix(base, accent, 0.14 + 0.86 * Math.sqrt(share));
		}
		if (colorBy === "depth") {
			return mix(
				base,
				accent,
				clamp(0.26 + 0.24 * (cell.depth - 1) - 0.1 * within, 0.08, 1),
			);
		}
		const tone = cell.topCount > 1 ? cell.topIndex / (cell.topCount - 1) : 0;
		return mix(accent, base, clamp(0.1 + 0.62 * tone + 0.16 * within, 0, 0.92));
	};

	const here = new Set(cells.map((cell) => cell.id));
	const drawn: { cell: TreemapCell; exit: Rect | null }[] = [
		...cells.map((cell) => ({ cell, exit: null })),
		...view.exits
			.filter((exit) => !here.has(exit.cell.id) && index.has(exit.cell.id))
			.map((exit) => ({ cell: exit.cell, exit: exit.to })),
	];
	// One fixed order for every cell the tree can ever show. React moves DOM
	// nodes to match the order it is given, and a node that is moved drops the
	// transition it was in the middle of.
	drawn.sort(
		(a, b) =>
			(index.get(a.cell.id)?.order ?? 0) - (index.get(b.cell.id)?.order ?? 0),
	);

	const trail: TreemapNode[] = [];
	for (let at: string | null = focusId; at; at = index.get(at)?.parent ?? null) {
		const entry = index.get(at);
		if (entry) trail.unshift(entry.node);
	}

	const shownId = hover ?? (keyboard ? activeId : null);
	const shown = shownId ? cells.find((cell) => cell.id === shownId) : undefined;
	const whole = totals.get(focusId) ?? 0;

	return (
		<div
			className={`relative flex h-full w-full flex-col overflow-hidden ${className}`.trim()}
			style={{ backgroundColor: css(base), color: ink }}
		>
			<div className="flex h-8 shrink-0 items-center gap-3 px-2.5 font-mono text-[10px] tracking-[0.12em] uppercase">
				<nav aria-label="Path" className="flex min-w-0 items-center gap-1">
					{trail.map((node, i) => {
						const last = i === trail.length - 1;
						return (
							<span key={node.id} className="flex min-w-0 items-center gap-1">
								{i > 0 ? <span className="opacity-40">/</span> : null}
								<button
									type="button"
									disabled={last}
									aria-current={last ? "location" : undefined}
									onClick={() => zoomTo(node.id)}
									className="max-w-[10rem] cursor-pointer truncate rounded-sm px-1 py-0.5 opacity-60 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 disabled:cursor-default disabled:opacity-100"
									style={{ outlineColor: css(accent) }}
								>
									{node.label}
								</button>
							</span>
						);
					})}
				</nav>
				<span className="ml-auto min-w-0 truncate tabular-nums opacity-70">
					{shown
						? `${shown.node.label} · ${formatValue(shown.value)} · ${
								whole > 0 ? Math.round((shown.value / whole) * 100) : 0
							}%`
						: formatValue(whole)}
				</span>
			</div>

			<div
				ref={mapRef}
				role="group"
				aria-label={label}
				className="relative min-h-0 flex-1 overflow-hidden"
				onFocus={() => setKeyboard(true)}
				onBlur={() => setKeyboard(false)}
				onPointerLeave={() => setHover(null)}
			>
				{drawn.map(({ cell, exit }) => {
					const rect = exit ?? cell;
					const fill = fillOf(cell);
					const dark = luma(fill) <= 0.55;
					const gone = exit !== null;
					const roomForName = cell.w >= 46 && cell.h >= 22;
					const roomForValue = cell.h >= 42 && cell.w >= 46;
					const text = Math.round(
						clamp(Math.sqrt(cell.w * cell.h) / 11, 11, 19),
					);
					const reachable = !cell.group && !gone;
					return (
						<div
							key={cell.id}
							ref={(el) => {
								if (el) els.current.set(cell.id, el);
								else els.current.delete(cell.id);
							}}
							role={reachable ? "button" : undefined}
							tabIndex={reachable ? (cell.id === activeId ? 0 : -1) : undefined}
							aria-hidden={gone ? true : undefined}
							aria-label={
								reachable
									? `${cell.node.label}, ${formatValue(cell.value)}`
									: undefined
							}
							onClick={gone ? undefined : () => activate(cell)}
							onPointerEnter={reachable ? () => setHover(cell.id) : undefined}
							onFocus={reachable ? () => setActive(cell.id) : undefined}
							onKeyDown={reachable ? (e) => onCellKey(e, cell) : undefined}
							className={`absolute top-0 left-0 overflow-hidden outline-none select-none focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 ${
								gone ? "pointer-events-none" : "cursor-pointer"
							}`}
							style={{
								transform: `translate(${rect.x}px, ${rect.y}px)`,
								width: Math.max(0, rect.w),
								height: Math.max(0, rect.h),
								opacity: gone ? 0 : 1,
								borderRadius: radius,
								backgroundColor: css(fill),
								color: dark ? "#f4f0ff" : "#0b0a10",
								outlineColor: dark ? "#ffffff" : "#0b0a10",
								boxShadow: cell.group
									? `inset 0 0 0 1px ${css(mix(base, accent, 0.26))}`
									: undefined,
								filter:
									reachable && cell.id === hover ? "brightness(1.18)" : undefined,
								transition,
							}}
						>
							{cell.group ? (
								<div
									className="flex items-center gap-2 px-1.5 font-mono text-[9px] tracking-[0.14em] uppercase"
									style={{ height: HEADER }}
								>
									<span className="min-w-0 truncate opacity-80">
										{cell.node.label}
									</span>
									<span className="ml-auto shrink-0 tabular-nums opacity-50">
										{formatValue(cell.value)}
									</span>
								</div>
							) : labels && roomForName ? (
								<div className="flex h-full flex-col justify-between p-1.5">
									<span
										className="truncate leading-tight font-medium"
										style={{ fontSize: text }}
									>
										{cell.node.label}
									</span>
									{roomForValue ? (
										<span className="truncate font-mono text-[10px] tabular-nums opacity-70">
											{formatValue(cell.value)}
										</span>
									) : null}
								</div>
							) : null}
						</div>
					);
				})}
			</div>
		</div>
	);
}

/** Carry a rectangle from one frame of reference to another. */
function remap(r: Rect, a: Rect, b: Rect): Rect {
	const sx = b.w / (a.w || 1);
	const sy = b.h / (a.h || 1);
	return {
		x: b.x + (r.x - a.x) * sx,
		y: b.y + (r.y - a.y) * sy,
		w: r.w * sx,
		h: r.h * sy,
	};
}

/** One step of every leaf's random walk. Each is pulled back toward its
 *  starting size, so the map changes all the time and never runs away. */
function wander(prev: Map<string, number>, ids: string[]): Map<string, number> {
	const next = new Map<string, number>();
	for (const id of ids) {
		const now = prev.get(id) ?? 1;
		const pulled = now + (1 - now) * 0.12;
		next.set(id, clamp(pulled * (1 + (Math.random() - 0.5) * 0.5), 0.4, 2.4));
	}
	return next;
}

function clamp(v: number, lo: number, hi: number): number {
	return v < lo ? lo : v > hi ? hi : v;
}

/** `#rgb` and `#rrggbb`. Anything else falls back to the default color. */
function parseColor(value: string): RGB | null {
	const hex = value.trim().replace(/^#/, "");
	const full =
		hex.length === 3
			? hex
					.split("")
					.map((c) => c + c)
					.join("")
			: hex;
	if (!/^[0-9a-f]{6}$/i.test(full)) return null;
	const n = parseInt(full, 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: RGB, b: RGB, k: number): RGB {
	return [
		Math.round(a[0] + (b[0] - a[0]) * k),
		Math.round(a[1] + (b[1] - a[1]) * k),
		Math.round(a[2] + (b[2] - a[2]) * k),
	];
}

function css(c: RGB): string {
	return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Rough perceived lightness, 0 to 1. Enough to pick dark or light text. */
function luma(c: RGB): number {
	return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
}

function subscribeMotion(onChange: () => void): () => void {
	if (typeof window === "undefined" || !window.matchMedia) return () => {};
	const query = window.matchMedia("(prefers-reduced-motion: reduce)");
	query.addEventListener("change", onChange);
	return () => query.removeEventListener("change", onChange);
}

function readMotion(): boolean {
	return (
		typeof window !== "undefined" &&
		!!window.matchMedia &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

function readMotionOnServer(): boolean {
	return false;
}
