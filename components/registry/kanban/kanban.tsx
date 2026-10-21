"use client";

import {
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
	type CSSProperties,
	type Dispatch,
	type FocusEvent as ReactFocusEvent,
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	type ReactNode,
	type SetStateAction,
} from "react";
import {
	LayoutGroup,
	MotionConfig,
	animate,
	motion,
	useMotionValue,
	useReducedMotion,
	useSpring,
	useTransform,
	useVelocity,
} from "motion/react";
import { useAnimationLoop } from "@/hooks/use-animation-loop";
import { cn } from "@/lib/utils";

// A kanban board with real drag and drop, a keyboard path to every move, WIP
// limits and columns that fold down to a rail.
//
// ── The ghost and the slot ──────────────────────────────────────────────────
// A pointer drag splits the card in two. A ghost (an overlay outside the
// scroller, driven by motion values) follows the pointer, and a dashed slot of
// the same height sits where the card will land. The card itself leaves the
// list for the length of the drag. That is load-bearing: motion clears a layoutId
// snapshot at the end of the update that unmounted it, so when the card mounts
// again on drop it appears in place instead of flying in from where it was
// picked up. The ghost springs onto the slot first, so the swap is invisible.
//
// ── The drop index comes from lift-time geometry ────────────────────────────
// Columns and card heights are measured once, on lift, with the dragged card
// taken out. The slot is wherever the dragged card's centre is closest to the
// centre it would have in that slot. Hit-testing against live rects instead
// oscillates: the slot moves, the cards spring, the rects move under a still
// pointer, and the slot moves back.
//
// Every measurement is an offset chain (offsetLeft/offsetTop up to the board),
// never a client rect. Offsets ignore transforms, so a card that is still
// springing reports where it will be, not where it happens to be this frame.
// Board-content coordinates also stay correct while the edge scroll runs.
//
// ── Pointer capture lives on the root ───────────────────────────────────────
// The card under the pointer unmounts on lift, and capture held by a node that
// leaves the DOM is lost. So the root takes the capture, and the
// `lostpointercapture` that the grip fires when it hands it over is ignored.
// That event bubbles, so the listener checks its target.
//
// ── Touch drags by the grip only ────────────────────────────────────────────
// Mouse and pen drag the whole card after a few pixels. A finger only drags
// from the grip, which carries `touch-none`, so a swipe anywhere else still
// scrolls the board. `select-none` on the card: a drag across text selects it,
// and a press that starts on a selection becomes a native drag-and-drop.
//
// ── Keyboard ────────────────────────────────────────────────────────────────
// One tab stop for the whole board (a roving tabindex over the grips). Space
// lifts, the arrows carry the card, Space drops, Escape puts it back. The
// lifted card renders in its target slot, so a move into another column
// remounts it and focus is handed to the new grip after the commit.
//
// The board never moves a card by itself. Every change comes from a person.
export interface KanbanTag {
	label: string;
	/** Any CSS color. Tints the pill and the strip on compact cards. */
	color: string;
}

export interface KanbanCard {
	id: string;
	title: string;
	tag?: KanbanTag;
	assignee?: string;
	/** Estimate, shown as a small number on the card. */
	points?: number;
}

export interface KanbanColumn {
	id: string;
	title: string;
	/** Count this column against `wipLimit`. */
	wip?: boolean;
	/** Start folded down to a rail. */
	collapsed?: boolean;
	cards: KanbanCard[];
}

export interface KanbanProps {
	/** Controlled columns. Pair with `onChange`. */
	columns?: KanbanColumn[];
	/** Starting columns when the board keeps its own state. */
	defaultColumns?: KanbanColumn[];
	/** The new columns after a person moves a card. */
	onChange?: (columns: KanbanColumn[]) => void;
	/** The most cards a work-in-progress column should hold. 0 means no limit. */
	wipLimit?: number;
	/** Warn lets the card in and flags the column. Block keeps it out. */
	wipMode?: "warn" | "block";
	/** How hard cards spring into their new places. */
	stiffness?: number;
	/** How fast that spring settles. */
	damping?: number;
	/** How much a picked-up card grows. */
	lift?: number;
	/** How far a carried card leans into the drag, in degrees. */
	tilt?: number;
	/** Let columns fold down to a narrow rail. */
	collapsible?: boolean;
	/** The focus ring, the outline on a lifted card, and the drop slot. */
	accentColor?: string;
	/** Moves land instantly, with no lean, lift or shake. */
	reducedMotion?: boolean;
	className?: string;
}

type Slot = { col: string; index: number };

type Drag = {
	id: string;
	from: Slot;
	to: Slot;
	mode: "pointer" | "keyboard";
	phase: "lifted" | "settling";
	outcome: "drop" | "cancel" | null;
	/** A full column the ghost is over in block mode. */
	reject: string | null;
	/** Ghost size, in px. */
	w: number;
	h: number;
	/** Grab point as a fraction of the card, so the lean pivots under the pointer. */
	ox: number;
	oy: number;
};

type GeoColumn = {
	id: string;
	x: number;
	w: number;
	folded: boolean;
	/** Content y of the first slot. */
	top: number;
	gap: number;
	/** Heights of the cards in order, the dragged card left out. */
	heights: number[];
	count: number;
};

type Session = {
	pointerId: number;
	card: string;
	from: Slot;
	to: Slot;
	startX: number;
	startY: number;
	x: number;
	y: number;
	grabX: number;
	grabY: number;
	w: number;
	h: number;
	lifted: boolean;
	settling: boolean;
	geo: GeoColumn[];
	rejected: string | null;
	carryX: number;
	carryY: number;
	detach: () => void;
};

type LaneView = {
	col: KanbanColumn;
	folded: boolean;
	/** `null` marks the drop slot. */
	items: (KanbanCard | null)[];
	count: number;
};

/** Pixels a press travels before it becomes a drag. */
const THRESHOLD = 4;
/** Width of the band along each board edge that scrolls it. */
const EDGE = 48;
/** Scroll speed at the very edge, in px/s. */
const EDGE_SPEED = 900;
/** Pointer speed, in px/s, at which a carried card leans its full `tilt`. */
const LEAN_AT = 600;
const RADIUS = 12;

// Public seams are `--kanban-*`, all optional, with dark fallbacks. The board
// reads its own `--kb-*` copies so each fallback is written once.
const THEME = {
	"--kb-ink": "var(--kanban-ink, #ece9f2)",
	"--kb-dim": "var(--kanban-dim, color-mix(in oklab, var(--kb-ink) 58%, transparent))",
	"--kb-card": "var(--kanban-card, #1a1720)",
	"--kb-column": "var(--kanban-column, rgb(255 255 255 / 0.03))",
	"--kb-line": "var(--kanban-line, rgb(255 255 255 / 0.08))",
	"--kb-danger": "var(--kanban-danger, #f87171)",
} as CSSProperties;

// Compact cards carry the grip as a full-height gutter on the left, so the title
// keeps the whole width of a narrow column. Wide cards move it to the corner.
const GRIP = cn(
	"absolute inset-y-0 left-0 flex w-4 justify-center rounded-l-[10px] pt-[5px] text-(--kb-dim)",
	"@min-[35rem]:inset-y-auto @min-[35rem]:left-auto @min-[35rem]:right-1.5 @min-[35rem]:top-1.5 @min-[35rem]:size-6 @min-[35rem]:items-center @min-[35rem]:rounded-md @min-[35rem]:pt-0",
);

export default function Kanban({
	columns,
	defaultColumns,
	onChange,
	wipLimit = 3,
	wipMode = "warn",
	stiffness = 520,
	damping = 40,
	lift = 1.04,
	tilt = 4,
	collapsible = true,
	accentColor = "#a855f7",
	reducedMotion = false,
	className,
}: KanbanProps) {
	const reduce = Boolean(useReducedMotion()) || reducedMotion;
	const uid = useId();
	const hintId = `${uid}-hint`;

	const [inner, setInner] = useState<KanbanColumn[]>(() => defaultColumns ?? []);
	const data = columns ?? inner;
	// Folding is view state, so it never goes through onChange. A column the
	// person has not touched follows its `collapsed` flag.
	const [folds, setFolds] = useState<Record<string, boolean>>({});
	const [drag, setDrag] = useState<Drag | null>(null);
	const [pulse, setPulse] = useState({ col: "", n: 0 });
	const [message, setMessage] = useState("");
	const [roving, setRoving] = useState<string | null>(null);

	const rootRef = useRef<HTMLDivElement>(null);
	const boardRef = useRef<HTMLDivElement>(null);
	const slotRef = useRef<HTMLDivElement>(null);
	const nodes = useRef(new Map<string, HTMLElement>());
	const session = useRef<Session | null>(null);
	const focusWanted = useRef<{ key: string; reveal: boolean } | null>(null);
	const scrollStep = useRef<((dt: number) => void | false) | null>(null);

	// Window listeners outlive the render that attached them, so everything they
	// read comes through here.
	const live = useRef({
		data,
		controlled: columns !== undefined,
		onChange,
		wipLimit,
		wipMode,
		stiffness,
		damping,
		lift,
		tilt,
		reduce,
		collapsible,
		folds,
	});
	useLayoutEffect(() => {
		live.current = {
			data,
			controlled: columns !== undefined,
			onChange,
			wipLimit,
			wipMode,
			stiffness,
			damping,
			lift,
			tilt,
			reduce,
			collapsible,
			folds,
		};
	});

	const gx = useMotionValue(0);
	const gy = useMotionValue(0);
	const gw = useMotionValue(0);
	const gScale = useMotionValue(1);
	const gFade = useMotionValue(1);
	const gShadow = useMotionValue(0);
	const gTilt = useMotionValue(0);
	// The lean comes from the ghost's own speed, so a card that stops moving
	// straightens up without anyone telling it to.
	const speed = useVelocity(gx);
	const leanTarget = useTransform(speed, (v) => clamp(v / LEAN_AT, -1, 1));
	const lean = useSpring(leanTarget, { stiffness: 320, damping: 26, mass: 0.6 });
	const rotate = useTransform([lean, gTilt], ([l, t]: number[]) => l * t);

	const dragCard = drag ? findCard(data, drag.id) : null;
	const active = drag && dragCard ? drag : null;
	const pointerLifted = active?.mode === "pointer" && active.phase === "lifted";

	const view: LaneView[] = data.map((col) => {
		const folded = foldedIn(col, folds, collapsible);
		const rest = active ? col.cards.filter((c) => c.id !== active.id) : col.cards;
		const items: (KanbanCard | null)[] = [...rest];
		if (active && dragCard && active.to.col === col.id && !folded) {
			items.splice(
				Math.min(active.to.index, items.length),
				0,
				active.mode === "keyboard" ? dragCard : null,
			);
		}
		return { col, folded, items, count: folded ? rest.length : items.length };
	});

	const visibleIds = view.flatMap((v) =>
		v.folded ? [] : v.items.flatMap((card) => (card ? [card.id] : [])),
	);
	const tabStop = roving && visibleIds.includes(roving) ? roving : (visibleIds[0] ?? null);

	const bind = (key: string) => (node: HTMLElement | null) => {
		if (node) nodes.current.set(key, node);
		else nodes.current.delete(key);
	};

	const say = (text: string) => announce(setMessage, text);

	// ── Pointer ──────────────────────────────────────────────────────────────

	const loop = useAnimationLoop({
		target: boardRef,
		halted: !pointerLifted,
		paintWhenHalted: false,
		onFrame: ({ dt }) => (scrollStep.current ? scrollStep.current(dt) : false),
	});

	const hitTest = (s: Session) => {
		const board = boardRef.current;
		if (!board || !s.lifted || s.settling) return;
		const b = board.getBoundingClientRect();
		const cx = s.x - b.left - board.clientLeft + board.scrollLeft - s.grabX + s.w / 2;
		const cy = s.y - b.top - board.clientTop + board.scrollTop - s.grabY + s.h / 2;
		const hit = pickSlot(s.geo, cx, cy, s.h);
		if (!hit) return;
		const L = live.current;
		const target = L.data.find((c) => c.id === hit.col);
		if (!target) return;
		if (blocks(target, s.card, s.from.col, L.wipLimit, L.wipMode)) {
			// The slot stays where it was. Pulse once per visit, not per move,
			// and hold the column red for as long as the ghost stays over it.
			if (s.rejected !== target.id) {
				s.rejected = target.id;
				setPulse((p) => ({ col: target.id, n: p.n + 1 }));
				announce(setMessage, `${target.title} is full.`);
				setDrag((d) => (d && d.mode === "pointer" && d.phase === "lifted" ? { ...d, reject: target.id } : d));
			}
			return;
		}
		const leaving = s.rejected !== null;
		s.rejected = null;
		if (hit.col === s.to.col && hit.index === s.to.index && !leaving) return;
		s.to = hit;
		setDrag((d) =>
			d && d.mode === "pointer" && d.phase === "lifted" ? { ...d, to: hit, reject: null } : d,
		);
	};

	const follow = (s: Session) => {
		const root = rootRef.current;
		const board = boardRef.current;
		if (!root || !board) return;
		const r = root.getBoundingClientRect();
		gx.set(s.x - r.left - s.grabX);
		gy.set(s.y - r.top - s.grabY);
		hitTest(s);
		const push = edgePush(board, s.x, s.y);
		if (push.vx || push.vy) loop.start();
	};

	const pickUp = (s: Session) => {
		const board = boardRef.current;
		const root = rootRef.current;
		if (!board || !root) return false;
		const L = live.current;
		// All reads before any write: the geometry is taken while the board
		// still shows the card in its column.
		s.geo = measureColumns(board, L.data, (c) => foldedIn(c, L.folds, L.collapsible), s.card, nodes.current);
		if (s.geo.length === 0) return false;
		const r = root.getBoundingClientRect();
		s.lifted = true;

		gx.jump(s.x - r.left - s.grabX);
		gy.jump(s.y - r.top - s.grabY);
		gw.jump(s.w);
		gFade.jump(1);
		gTilt.jump(0);
		if (L.reduce) {
			gScale.jump(L.lift);
			gShadow.jump(1);
		} else {
			gScale.jump(1);
			gShadow.jump(0);
			animate(gScale, L.lift, { type: "spring", stiffness: 600, damping: 32 });
			animate(gShadow, 1, { duration: 0.2 });
			animate(gTilt, L.tilt, { duration: 0.25 });
		}

		try {
			root.setPointerCapture(s.pointerId);
		} catch {
			// The pointer is already gone; the window listeners still see it out.
		}
		setDrag({
			id: s.card,
			from: s.from,
			to: s.from,
			mode: "pointer",
			phase: "lifted",
			outcome: null,
			reject: null,
			w: s.w,
			h: s.h,
			ox: s.grabX / Math.max(1, s.w),
			oy: s.grabY / Math.max(1, s.h),
		});
		const card = findCard(L.data, s.card);
		if (card) announce(setMessage, `Picked up ${card.title}.`);
		return true;
	};

	const end = (s: Session) => {
		s.detach();
		if (session.current === s) session.current = null;
	};

	const settle = (s: Session, outcome: "drop" | "cancel") => {
		if (s.settling) return;
		s.settling = true;
		s.detach();
		const root = rootRef.current;
		try {
			if (root?.hasPointerCapture(s.pointerId)) root.releasePointerCapture(s.pointerId);
		} catch {
			// Already released by the browser.
		}
		// The flight starts in a layout effect, after the commit that puts the
		// slot in its final place. A pointerup can land before the last move
		// has rendered.
		const to = outcome === "drop" ? s.to : s.from;
		setDrag((d) => (d ? { ...d, to, phase: "settling", outcome, reject: null } : d));
	};

	const onCardPointerDown = (
		e: ReactPointerEvent<HTMLDivElement>,
		card: KanbanCard,
		col: KanbanColumn,
	) => {
		if (drag || session.current || e.button !== 0) return;
		const fromGrip = e.target instanceof Element && e.target.closest("[data-kanban-grip]") !== null;
		if (e.pointerType === "touch" && !fromGrip) return;

		const el = e.currentTarget;
		const rect = el.getBoundingClientRect();
		const index = col.cards.findIndex((c) => c.id === card.id);
		const s: Session = {
			pointerId: e.pointerId,
			card: card.id,
			from: { col: col.id, index },
			to: { col: col.id, index },
			startX: e.clientX,
			startY: e.clientY,
			x: e.clientX,
			y: e.clientY,
			grabX: e.clientX - rect.left,
			grabY: e.clientY - rect.top,
			w: el.offsetWidth,
			h: el.offsetHeight,
			lifted: false,
			settling: false,
			geo: [],
			rejected: null,
			carryX: 0,
			carryY: 0,
			detach: () => {},
		};

		const root = rootRef.current;
		const onMove = (ev: PointerEvent) => {
			if (ev.pointerId !== s.pointerId || s.settling) return;
			s.x = ev.clientX;
			s.y = ev.clientY;
			if (!s.lifted) {
				if (Math.hypot(s.x - s.startX, s.y - s.startY) < THRESHOLD) return;
				if (!pickUp(s)) {
					end(s);
					return;
				}
			}
			follow(s);
		};
		const onUp = (ev: PointerEvent) => {
			if (ev.pointerId !== s.pointerId) return;
			if (s.lifted) settle(s, "drop");
			else end(s);
		};
		const onCancel = (ev: PointerEvent) => {
			if (ev.pointerId !== s.pointerId) return;
			if (s.lifted) settle(s, "cancel");
			else end(s);
		};
		const onLost = (ev: PointerEvent) => {
			if (ev.pointerId !== s.pointerId || ev.target !== root) return;
			if (s.lifted) settle(s, "cancel");
		};
		// Capture phase on window, so this runs before any page-level Escape.
		const onKey = (ev: KeyboardEvent) => {
			if (ev.key !== "Escape" || !s.lifted || s.settling) return;
			ev.preventDefault();
			ev.stopPropagation();
			settle(s, "cancel");
		};

		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		window.addEventListener("pointercancel", onCancel);
		window.addEventListener("keydown", onKey, true);
		root?.addEventListener("lostpointercapture", onLost);
		s.detach = () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("pointercancel", onCancel);
			window.removeEventListener("keydown", onKey, true);
			root?.removeEventListener("lostpointercapture", onLost);
		};
		session.current = s;
	};

	const onBoardScroll = () => {
		const s = session.current;
		if (s && s.lifted && !s.settling) hitTest(s);
	};

	// ── Keyboard ─────────────────────────────────────────────────────────────

	const focusSoon = (key: string, reveal = true) => {
		focusWanted.current = { key, reveal };
	};

	const keyLift = (card: KanbanCard, col: KanbanColumn) => {
		const index = col.cards.findIndex((c) => c.id === card.id);
		setDrag({
			id: card.id,
			from: { col: col.id, index },
			to: { col: col.id, index },
			mode: "keyboard",
			phase: "lifted",
			outcome: null,
			reject: null,
			w: 0,
			h: 0,
			ox: 0.5,
			oy: 0.5,
		});
		focusSoon(`grip:${card.id}`);
		say(
			`Picked up ${card.title}. ${col.title}, position ${index + 1} of ${col.cards.length}. Arrow keys move, Space drops, Escape cancels.`,
		);
	};

	const keyDrop = (d: Drag, card: KanbanCard) => {
		const next = moveCard(data, d.id, d.to.col, d.to.index);
		if (next !== data) {
			if (columns === undefined) setInner(next);
			onChange?.(next);
		}
		setDrag(null);
		focusSoon(`grip:${d.id}`);
		const col = next.find((c) => c.id === d.to.col);
		if (col) {
			say(`Dropped ${card.title}. ${col.title}, position ${d.to.index + 1} of ${col.cards.length}.`);
		}
	};

	const keyCancel = (d: Drag, card: KanbanCard, refocus: boolean) => {
		setDrag(null);
		if (refocus) focusSoon(`grip:${d.id}`);
		const col = data.find((c) => c.id === d.from.col);
		if (col) {
			say(`Cancelled. ${card.title} is back in ${col.title}, position ${d.from.index + 1} of ${col.cards.length}.`);
		}
	};

	const keyMove = (d: Drag, key: string) => {
		const at = data.findIndex((c) => c.id === d.to.col);
		const here = data[at];
		if (!here) return;
		let to: Slot | null = null;
		let skipped: KanbanColumn | null = null;

		if (key === "ArrowLeft" || key === "ArrowRight") {
			const step = key === "ArrowLeft" ? -1 : 1;
			for (let i = at + step; i >= 0 && i < data.length; i += step) {
				const col = data[i];
				if (foldedIn(col, folds, collapsible)) continue;
				// A full column is stepped over rather than ending the walk, or a
				// card could never get past it.
				if (blocks(col, d.id, d.from.col, wipLimit, wipMode)) {
					skipped ??= col;
					continue;
				}
				to = { col: col.id, index: Math.min(d.to.index, othersIn(col, d.id)) };
				break;
			}
		} else {
			const max = othersIn(here, d.id);
			const index =
				key === "ArrowUp" ? d.to.index - 1 : key === "ArrowDown" ? d.to.index + 1 : key === "Home" ? 0 : max;
			to = { col: here.id, index: clamp(index, 0, max) };
		}

		if (skipped) {
			const full = skipped;
			setPulse((p) => ({ col: full.id, n: p.n + 1 }));
		}
		if (!to) {
			if (skipped) say(`${skipped.title} is full.`);
			return;
		}
		const dest = to;
		if (dest.col !== d.to.col || dest.index !== d.to.index) setDrag({ ...d, to: dest });
		focusSoon(`grip:${d.id}`);

		const target = data.find((c) => c.id === dest.col);
		if (!target) return;
		const total = othersIn(target, d.id) + 1;
		const limit = target.wip && wipLimit > 0 ? wipLimit : 0;
		const over = limit > 0 && total > limit ? ` Over the limit, ${total} of ${limit}.` : "";
		const full = skipped ? `${skipped.title} is full. ` : "";
		say(`${full}${target.title}, position ${dest.index + 1} of ${total}.${over}`);
	};

	const keyRove = (card: KanbanCard, key: string) => {
		const lanes = view.filter((v) => !v.folded);
		const li = lanes.findIndex((v) => v.items.some((c) => c?.id === card.id));
		const lane = lanes[li];
		if (!lane) return;
		const cards = lane.items.filter((c): c is KanbanCard => c !== null);
		const i = cards.findIndex((c) => c.id === card.id);
		let next: KanbanCard | undefined;
		if (key === "ArrowUp") next = cards[i - 1];
		else if (key === "ArrowDown") next = cards[i + 1];
		else if (key === "Home") next = cards[0];
		else if (key === "End") next = cards[cards.length - 1];
		else {
			const step = key === "ArrowLeft" ? -1 : 1;
			for (let j = li + step; j >= 0 && j < lanes.length; j += step) {
				const there = lanes[j].items.filter((c): c is KanbanCard => c !== null);
				if (there.length === 0) continue;
				next = there[Math.min(i, there.length - 1)];
				break;
			}
		}
		if (!next) return;
		const grip = nodes.current.get(`grip:${next.id}`);
		grip?.focus({ preventScroll: true });
		const board = boardRef.current;
		const el = nodes.current.get(`card:${next.id}`);
		if (board && el) revealIn(board, el);
		setRoving(next.id);
	};

	const onGripKey = (e: ReactKeyboardEvent<HTMLButtonElement>, card: KanbanCard, col: KanbanColumn) => {
		const held = active && active.mode === "keyboard" && active.id === card.id ? active : null;
		if (drag && !held) return;
		const k = e.key;
		if (k === " " || k === "Enter") {
			e.preventDefault();
			if (e.repeat) return;
			if (held) keyDrop(held, card);
			else keyLift(card, col);
			return;
		}
		if (k === "Escape") {
			if (!held) return;
			e.preventDefault();
			keyCancel(held, card, true);
			return;
		}
		// Tab while carrying would abandon the card mid-move with no way to say so.
		if (k === "Tab") {
			if (held) e.preventDefault();
			return;
		}
		if (
			k === "ArrowUp" ||
			k === "ArrowDown" ||
			k === "ArrowLeft" ||
			k === "ArrowRight" ||
			k === "Home" ||
			k === "End"
		) {
			e.preventDefault();
			if (held) keyMove(held, k);
			else keyRove(card, k);
		}
	};

	const onRootBlur = (e: ReactFocusEvent<HTMLDivElement>) => {
		if (!active || active.mode !== "keyboard" || active.phase !== "lifted" || !dragCard) return;
		// A remount blurs to nothing; only a real move elsewhere drops the lift.
		const next = e.relatedTarget;
		if (next instanceof Node && !e.currentTarget.contains(next)) keyCancel(active, dragCard, false);
	};

	const toggle = (col: KanbanColumn, fold: boolean) => {
		if (drag) return;
		setFolds((f) => ({ ...f, [col.id]: fold }));
		focusSoon(fold ? `rail:${col.id}` : `fold:${col.id}`, false);
	};

	// ── Effects ──────────────────────────────────────────────────────────────

	useLayoutEffect(() => {
		scrollStep.current = (dt) => {
			const s = session.current;
			const board = boardRef.current;
			if (!s || !s.lifted || s.settling || !board) return false;
			const { vx, vy } = edgePush(board, s.x, s.y);
			if (!vx && !vy) {
				s.carryX = 0;
				s.carryY = 0;
				return false;
			}
			// Whole pixels only: a scroll offset rounds, so a slow push carries
			// its fraction to the next frame instead of never moving.
			s.carryX += vx * dt;
			s.carryY += vy * dt;
			const dx = Math.trunc(s.carryX);
			const dy = Math.trunc(s.carryY);
			if (!dx && !dy) return;
			s.carryX -= dx;
			s.carryY -= dy;
			board.scrollLeft += dx;
			board.scrollTop += dy;
			hitTest(s);
		};
	});

	// The drop (or the return home): spring the ghost onto the slot carrying its
	// release velocity, then commit, so the card mounts exactly under it.
	useLayoutEffect(() => {
		if (!drag || drag.mode !== "pointer" || drag.phase !== "settling") return;
		const root = rootRef.current;
		const board = boardRef.current;
		if (!root || !board) return;
		const L = live.current;
		const r = root.getBoundingClientRect();
		const target = L.data.find((c) => c.id === drag.to.col);
		const intoRail =
			drag.outcome === "drop" && target !== undefined && foldedIn(target, L.folds, L.collapsible);

		let x = gx.get();
		let y = gy.get();
		let w = drag.w;
		let scale = 1;
		let fade = 1;
		if (intoRail) {
			const badge = nodes.current.get(`badge:${drag.to.col}`) ?? nodes.current.get(`rail:${drag.to.col}`);
			if (badge) {
				const b = badge.getBoundingClientRect();
				x = b.left + b.width / 2 - r.left - drag.w / 2;
				y = b.top + b.height / 2 - r.top - drag.h / 2;
			}
			scale = 0.3;
			fade = 0;
		} else if (slotRef.current) {
			const at = offsetWithin(slotRef.current, board);
			if (at) {
				const b = board.getBoundingClientRect();
				x = b.left + board.clientLeft + at.x - board.scrollLeft - r.left;
				y = b.top + board.clientTop + at.y - board.scrollTop - r.top;
				w = slotRef.current.offsetWidth;
			}
		}

		const still = L.reduce;
		const spring = still
			? { duration: 0 }
			: { type: "spring" as const, stiffness: L.stiffness, damping: L.damping };
		const runs = [
			animate(gx, x, still ? spring : { ...spring, velocity: gx.getVelocity() }),
			animate(gy, y, still ? spring : { ...spring, velocity: gy.getVelocity() }),
			animate(gw, w, spring),
			animate(gScale, scale, spring),
			animate(gTilt, 0, spring),
			animate(gShadow, 0, still ? { duration: 0 } : { duration: 0.3 }),
			animate(gFade, fade, still ? { duration: 0 } : { duration: 0.22, ease: "easeIn" }),
		];

		let current = true;
		Promise.all(runs.map((run) => run.finished)).then(() => {
			if (!current) return;
			const latest = live.current;
			const card = findCard(latest.data, drag.id);
			if (drag.outcome === "drop") {
				const next = moveCard(latest.data, drag.id, drag.to.col, drag.to.index);
				if (next !== latest.data) {
					if (!latest.controlled) setInner(next);
					latest.onChange?.(next);
					const col = next.find((c) => c.id === drag.to.col);
					const pos = col ? col.cards.findIndex((c) => c.id === drag.id) : -1;
					if (card && col) {
						announce(setMessage, `Moved ${card.title} to ${col.title}, position ${pos + 1} of ${col.cards.length}.`);
					}
				} else if (card) {
					announce(setMessage, `Dropped ${card.title}. It did not move.`);
				}
			} else if (card) {
				announce(setMessage, `Cancelled. ${card.title} is back where it was.`);
			}
			session.current = null;
			setDrag(null);
		});
		return () => {
			current = false;
			for (const run of runs) run.stop();
		};
	}, [drag, gx, gy, gw, gScale, gTilt, gShadow, gFade]);

	// Focus follows the card, not the slot: a move into another column remounts
	// its grip, so the new one takes focus once it exists.
	useLayoutEffect(() => {
		const want = focusWanted.current;
		if (!want) return;
		focusWanted.current = null;
		const el = nodes.current.get(want.key);
		if (!el) return;
		el.focus({ preventScroll: true });
		const board = boardRef.current;
		const box = el.closest<HTMLElement>("[data-kanban-card]") ?? el;
		if (board && want.reveal) revealIn(board, box);
	});

	useEffect(() => {
		const box = session;
		return () => {
			box.current?.detach();
			box.current = null;
		};
	}, []);

	// ── Render ───────────────────────────────────────────────────────────────

	const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness, damping };

	return (
		<LayoutGroup id={uid}>
			<MotionConfig transition={spring} reducedMotion={reduce ? "always" : "user"}>
				<div
					ref={rootRef}
					className={cn(
						"@container relative h-full w-full text-(--kb-ink)",
						pointerLifted && (active?.reject ? "cursor-not-allowed" : "cursor-grabbing"),
						className,
					)}
					style={{ ...THEME, "--kanban-accent": accentColor } as CSSProperties}
					onBlur={onRootBlur}
				>
					<motion.div
						ref={boardRef}
						layoutScroll
						onScroll={onBoardScroll}
						className="relative flex h-full items-start gap-1.5 overflow-auto overscroll-x-contain p-2 [scrollbar-color:var(--kb-line)_transparent] [scrollbar-width:thin] @min-[35rem]:gap-2.5 @min-[35rem]:p-3"
					>
						{view.map((v) => {
							const limit = v.col.wip && wipLimit > 0 ? wipLimit : 0;
							return (
								<Lane
									key={v.col.id}
									col={v.col}
									folded={v.folded}
									count={v.count}
									limit={limit}
									railTarget={Boolean(pointerLifted && v.folded && active?.to.col === v.col.id)}
									rejecting={Boolean(pointerLifted && active?.reject === v.col.id)}
									pulse={pulse.col === v.col.id ? pulse.n : 0}
									canFold={collapsible}
									animateIn={v.col.id in folds}
									still={reduce}
									onToggle={(fold) => toggle(v.col, fold)}
									bindSection={bind(`col:${v.col.id}`)}
									bindList={bind(`list:${v.col.id}`)}
									bindRail={bind(`rail:${v.col.id}`)}
									bindBadge={bind(`badge:${v.col.id}`)}
									bindFold={bind(`fold:${v.col.id}`)}
								>
									{v.items.length === 0 ? (
										<div
											aria-hidden
											className="h-10 rounded-[10px] border border-dashed border-(--kb-line) @min-[35rem]:h-14"
										/>
									) : null}
									{v.items.map((card, i) =>
										card === null ? (
											<motion.div
												key={`${uid}-slot`}
												ref={slotRef}
												aria-hidden
												layout="position"
												initial={{ opacity: 0 }}
												animate={{ opacity: 1 }}
												transition={{ layout: spring, opacity: { duration: reduce ? 0 : 0.15 } }}
												className="relative z-0 shrink-0 rounded-[10px] border-[1.5px] border-dashed"
												style={{
													height: active?.h,
													borderColor: "color-mix(in oklab, var(--kanban-accent) 60%, transparent)",
													backgroundColor: "color-mix(in oklab, var(--kanban-accent) 9%, transparent)",
												}}
											/>
										) : (
											<CardItem
												key={card.id}
												card={card}
												held={active?.mode === "keyboard" && active.id === card.id}
												scaleUp={lift}
												tabbable={tabStop === card.id}
												label={`${card.title}. ${v.col.title}, ${i + 1} of ${v.items.length}.`}
												hintId={hintId}
												bindCard={bind(`card:${card.id}`)}
												bindGrip={bind(`grip:${card.id}`)}
												onPointerDown={(e) => onCardPointerDown(e, card, v.col)}
												onKeyDown={(e) => onGripKey(e, card, v.col)}
												onFocus={() => setRoving(card.id)}
											/>
										),
									)}
								</Lane>
							);
						})}
					</motion.div>

					{active?.mode === "pointer" && dragCard ? (
						<motion.div
							aria-hidden
							className="pointer-events-none absolute left-0 top-0 z-50"
							style={{
								x: gx,
								y: gy,
								width: gw,
								scale: gScale,
								rotate,
								opacity: gFade,
								originX: active.ox,
								originY: active.oy,
							}}
						>
							<motion.span
								className="absolute inset-0 rounded-[10px] shadow-[0_22px_44px_-14px_rgb(0_0_0/0.6),0_8px_16px_-8px_rgb(0_0_0/0.45)]"
								style={{ opacity: gShadow }}
							/>
							<div
								className="relative rounded-[10px] border border-(--kb-line) bg-(--kb-card) transition-[outline-color] duration-150"
								style={{
									outlineWidth: 1.5,
									outlineStyle: "solid",
									outlineColor: active.reject ? "var(--kb-danger)" : "var(--kanban-accent)",
								}}
							>
								<CardFace
									card={dragCard}
									grip={
										<span aria-hidden className={GRIP}>
											<GripIcon />
										</span>
									}
								/>
							</div>
						</motion.div>
					) : null}

					<p id={hintId} className="sr-only">
						Press Space to pick up the card. Use the arrow keys to move it, Space to drop it and Escape to
						cancel.
					</p>
					{/* Assertive: the move already happened, and a polite queue would
					    report it after the next one. */}
					<p aria-live="assertive" aria-atomic className="sr-only">
						{message}
					</p>
				</div>
			</MotionConfig>
		</LayoutGroup>
	);
}

function Lane({
	col,
	folded,
	count,
	limit,
	railTarget,
	rejecting,
	pulse,
	canFold,
	animateIn,
	still,
	onToggle,
	bindSection,
	bindList,
	bindRail,
	bindBadge,
	bindFold,
	children,
}: {
	col: KanbanColumn;
	folded: boolean;
	count: number;
	limit: number;
	railTarget: boolean;
	rejecting: boolean;
	pulse: number;
	canFold: boolean;
	animateIn: boolean;
	still: boolean;
	onToggle: (fold: boolean) => void;
	bindSection: (node: HTMLElement | null) => void;
	bindList: (node: HTMLElement | null) => void;
	bindRail: (node: HTMLElement | null) => void;
	bindBadge: (node: HTMLElement | null) => void;
	bindFold: (node: HTMLElement | null) => void;
	children: ReactNode;
}) {
	const over = limit > 0 && count > limit;
	const cards = `${count} ${count === 1 ? "card" : "cards"}`;
	// Content that changes shape with the column waits for the width to all but
	// land: text riding a scale animation reads as smeared.
	const fadeIn = {
		initial: animateIn ? { opacity: 0 } : false,
		animate: { opacity: 1 },
		transition: still ? { duration: 0 } : { duration: 0.22, delay: 0.1 },
	} as const;

	return (
		<motion.section
			ref={bindSection}
			layout
			role="group"
			aria-label={`${col.title}, ${cards}${limit ? `, limit ${limit}` : ""}`}
			className={cn(
				"relative flex min-h-full shrink-0 flex-col transition-[background-color] duration-300",
				folded ? "w-11" : "min-w-[5.5rem] max-w-80 flex-1 @min-[35rem]:min-w-38",
				over ? "bg-[color-mix(in_oklab,var(--kb-danger)_8%,var(--kb-column))]" : "bg-(--kb-column)",
			)}
			// In style rather than a class, so motion corrects it through the
			// width animation instead of stretching it into an ellipse.
			style={{ borderRadius: RADIUS }}
		>
			{folded ? (
				<motion.button
					ref={bindRail}
					layout="position"
					type="button"
					aria-expanded={false}
					aria-label={`Expand ${col.title}, ${cards}`}
					onClick={() => onToggle(false)}
					className={cn(
						"relative flex flex-1 flex-col items-center rounded-[inherit] pb-3 pt-2.5 text-(--kb-dim) outline-none transition-colors hover:text-(--kb-ink) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--kanban-accent)",
						railTarget && "text-(--kb-ink)",
					)}
				>
					{/* A plain overlay, not a style on the button: motion scale-corrects
					    a layout node's box-shadow and keeps writing the last one after
					    the prop goes away. */}
					<span
						aria-hidden
						className={cn(
							"pointer-events-none absolute inset-0 rounded-[inherit] bg-[color-mix(in_oklab,var(--kanban-accent)_14%,transparent)] shadow-[inset_0_0_0_1.5px_var(--kanban-accent)] transition-opacity duration-150",
							railTarget ? "opacity-100" : "opacity-0",
						)}
					/>
					<motion.span className="relative flex flex-col items-center gap-2.5" {...fadeIn}>
						<ExpandIcon />
						<Count n={count} limit={limit} still={still} bind={bindBadge} />
						<span className="text-[11px] font-semibold tracking-[0.01em] [writing-mode:vertical-rl]">
							{col.title}
						</span>
					</motion.span>
				</motion.button>
			) : (
				<>
					<motion.div
						layout="position"
						className="flex items-center px-1 pb-1 pt-1.5 @min-[35rem]:px-2 @min-[35rem]:pb-1.5 @min-[35rem]:pt-2"
					>
						<motion.span className="flex min-w-0 flex-1 items-center gap-0.5 @min-[35rem]:gap-1" {...fadeIn}>
							{canFold ? (
								<button
									ref={bindFold}
									type="button"
									aria-expanded
									aria-label={`Collapse ${col.title}`}
									onClick={() => onToggle(true)}
									className="group/fold flex min-w-0 items-center gap-1 rounded-md py-0.5 text-left outline-none transition-colors hover:bg-(--kb-line) focus-visible:outline-2 focus-visible:outline-(--kanban-accent) @min-[35rem]:px-1"
								>
									<span className="truncate text-[10.5px] font-semibold tracking-[-0.01em] @min-[35rem]:text-[12px] @min-[35rem]:tracking-normal">
										{col.title}
									</span>
									<FoldIcon />
								</button>
							) : (
								<span className="truncate py-0.5 text-[10.5px] font-semibold tracking-[-0.01em] @min-[35rem]:px-1 @min-[35rem]:text-[12px] @min-[35rem]:tracking-normal">
									{col.title}
								</span>
							)}
							<span className="ml-auto shrink-0">
								<Count n={count} limit={limit} still={still} />
							</span>
						</motion.span>
					</motion.div>
					<motion.div
						ref={bindList}
						role="list"
						className="flex flex-1 flex-col gap-1.5 px-1 pb-1 @min-[35rem]:gap-2 @min-[35rem]:px-2 @min-[35rem]:pb-2"
						{...fadeIn}
					>
						{children}
					</motion.div>
				</>
			)}
			{pulse > 0 ? (
				<motion.span
					key={pulse}
					aria-hidden
					className="pointer-events-none absolute inset-0 rounded-[inherit]"
					initial={{ opacity: 1 }}
					animate={{ opacity: 0 }}
					transition={{ duration: still ? 0.9 : 0.75, ease: "easeOut" }}
					style={{
						boxShadow:
							"inset 0 0 0 2px var(--kb-danger), 0 0 24px -6px color-mix(in oklab, var(--kb-danger) 70%, transparent)",
					}}
				/>
			) : null}
			{/* Held after the pulse fades, for as long as a card hovers a column that
			    will not take it. */}
			<span
				aria-hidden
				className={cn(
					"pointer-events-none absolute inset-0 rounded-[inherit] bg-[color-mix(in_oklab,var(--kb-danger)_6%,transparent)] shadow-[inset_0_0_0_1.5px_color-mix(in_oklab,var(--kb-danger)_70%,transparent)] transition-opacity duration-150",
					rejecting ? "opacity-100" : "opacity-0",
				)}
			/>
		</motion.section>
	);
}

function CardItem({
	card,
	held,
	scaleUp,
	tabbable,
	label,
	hintId,
	bindCard,
	bindGrip,
	onPointerDown,
	onKeyDown,
	onFocus,
}: {
	card: KanbanCard;
	held: boolean;
	scaleUp: number;
	tabbable: boolean;
	label: string;
	hintId: string;
	bindCard: (node: HTMLElement | null) => void;
	bindGrip: (node: HTMLElement | null) => void;
	onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
	onKeyDown: (e: ReactKeyboardEvent<HTMLButtonElement>) => void;
	onFocus: () => void;
}) {
	return (
		<motion.div
			ref={bindCard}
			role="listitem"
			data-kanban-card=""
			// Position only: a full layout animation scale-corrects the box and
			// distorts the text inside it while it travels.
			layoutId={card.id}
			layout="position"
			initial={false}
			animate={{ scale: held ? scaleUp : 1 }}
			onPointerDown={onPointerDown}
			className={cn(
				"group/card relative shrink-0 cursor-grab select-none rounded-[10px] border border-(--kb-line) bg-(--kb-card) shadow-[0_1px_2px_rgb(0_0_0/0.16)] transition-[border-color] [-webkit-touch-callout:none]",
				"hover:border-[color-mix(in_oklab,var(--kb-ink)_18%,transparent)]",
				// A held card already wears the accent ring; a focus ring on top
				// of it reads as two outlines.
				!held &&
					"has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--kanban-accent)",
			)}
			style={{ zIndex: held ? 20 : 1 }}
		>
			<motion.span
				aria-hidden
				className="pointer-events-none absolute -inset-px rounded-[11px] shadow-[0_18px_36px_-14px_rgb(0_0_0/0.55),0_0_0_1.5px_var(--kanban-accent)]"
				initial={false}
				animate={{ opacity: held ? 1 : 0 }}
				transition={{ duration: 0.18 }}
			/>
			<CardFace
				card={card}
				grip={
					<button
						ref={bindGrip}
						type="button"
						data-kanban-grip=""
						tabIndex={tabbable ? 0 : -1}
						aria-label={label}
						aria-describedby={hintId}
						aria-roledescription="draggable card"
						aria-pressed={held}
						onKeyDown={onKeyDown}
						onFocus={onFocus}
						// The grip is the only surface a finger can drag from, so it is
						// the one that opts out of touch scrolling.
						className={cn(
							GRIP,
							"cursor-grab touch-none outline-none transition-colors hover:bg-(--kb-line) hover:text-(--kb-ink)",
							held && "text-(--kanban-accent)",
						)}
					>
						<GripIcon />
					</button>
				}
			/>
		</motion.div>
	);
}

function CardFace({ card, grip }: { card: KanbanCard; grip: ReactNode }) {
	const meta = card.tag !== undefined || card.assignee !== undefined || card.points !== undefined;
	return (
		<div className="relative py-1 pl-4 pr-1.5 @min-[35rem]:px-3 @min-[35rem]:py-2.5">
			{card.tag ? (
				<span
					aria-hidden
					className="absolute bottom-2 left-0 top-2 w-0.5 rounded-r-full @min-[35rem]:hidden"
					style={{ backgroundColor: card.tag.color }}
				/>
			) : null}
			<p className="line-clamp-3 text-[11px] font-medium leading-[1.3] @min-[35rem]:line-clamp-2 @min-[35rem]:pr-6 @min-[35rem]:text-[13px] @min-[35rem]:leading-[1.4]">
				{card.title}
			</p>
			{meta ? (
				<div className="mt-2 hidden items-center gap-2 @min-[35rem]:flex">
					{card.tag ? <Tag tag={card.tag} /> : null}
					<span className="ml-auto flex shrink-0 items-center gap-1.5">
						{card.points !== undefined ? (
							<span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-md border border-(--kb-line) px-1 font-mono text-[10px] tabular-nums text-(--kb-dim)">
								<span className="sr-only">Points: </span>
								{card.points}
							</span>
						) : null}
						{card.assignee ? <Avatar name={card.assignee} /> : null}
					</span>
				</div>
			) : null}
			{grip}
		</div>
	);
}

function Tag({ tag }: { tag: KanbanTag }) {
	return (
		<span
			className="inline-flex min-w-0 items-center gap-1 rounded-full px-1.5 py-[3px] text-[10.5px] font-medium leading-none"
			style={{
				backgroundColor: `color-mix(in oklab, ${tag.color} 15%, transparent)`,
				color: `color-mix(in oklab, ${tag.color} 62%, var(--kb-ink))`,
			}}
		>
			<span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
			<span className="truncate">{tag.label}</span>
		</span>
	);
}

function Avatar({ name }: { name: string }) {
	const hue = hueOf(name);
	return (
		<span
			title={name}
			className="grid size-[18px] shrink-0 place-items-center rounded-full text-[9px] font-semibold uppercase leading-none"
			style={{
				backgroundColor: `hsl(${hue} 65% 55% / 0.24)`,
				color: `color-mix(in oklab, hsl(${hue} 70% 62%) 55%, var(--kb-ink))`,
			}}
		>
			<span aria-hidden>{name.trim().charAt(0)}</span>
			<span className="sr-only">{name}</span>
		</span>
	);
}

// The count in a column header. It bumps when a card arrives and shakes once
// when the column goes over its limit.
function Count({
	n,
	limit,
	still,
	bind,
}: {
	n: number;
	limit: number;
	still: boolean;
	bind?: (node: HTMLElement | null) => void;
}) {
	const self = useRef<HTMLSpanElement | null>(null);
	const over = limit > 0 && n > limit;
	const last = useRef({ n, over });

	useEffect(() => {
		const was = last.current;
		last.current = { n, over };
		const el = self.current;
		if (!el || still) return;
		if (over && !was.over) {
			animate(el, { x: [0, -4, 4, -3, 3, -1, 0] }, { duration: 0.42, ease: "easeOut" });
		} else if (n > was.n) {
			animate(el, { scale: [1, 1.25, 1] }, { duration: 0.3, ease: "easeOut" });
		}
	}, [n, over, still]);

	return (
		<span
			ref={(node) => {
				self.current = node;
				bind?.(node);
			}}
			aria-hidden
			className={cn(
				"inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[9px] leading-none tabular-nums transition-colors duration-200 @min-[35rem]:h-[18px] @min-[35rem]:min-w-[18px] @min-[35rem]:px-1.5 @min-[35rem]:text-[10px]",
				over
					? "bg-[color-mix(in_oklab,var(--kb-danger)_16%,transparent)] text-(--kb-danger) ring-1 ring-(--kb-danger)"
					: limit > 0 && n === limit
						? "bg-(--kb-line) text-(--kb-ink)"
						: "bg-(--kb-line) text-(--kb-dim)",
			)}
		>
			{limit > 0 ? `${n}/${limit}` : n}
		</span>
	);
}

function GripIcon() {
	return (
		<svg viewBox="0 0 24 24" width={24} height={24} className="size-3.5" aria-hidden>
			<path
				d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"
				fill="none"
				stroke="currentColor"
				strokeWidth={3}
				strokeLinecap="round"
			/>
		</svg>
	);
}

function FoldIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			width={24}
			height={24}
			aria-hidden
			className="hidden size-3.5 shrink-0 opacity-0 transition-opacity group-hover/fold:opacity-70 group-focus-visible/fold:opacity-70 @min-[35rem]:block [@media(hover:none)]:opacity-70"
		>
			<path
				d="M12 5v14M4 8l4 4-4 4M20 8l-4 4 4 4"
				fill="none"
				stroke="currentColor"
				strokeWidth={2}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function ExpandIcon() {
	return (
		<svg viewBox="0 0 24 24" width={24} height={24} aria-hidden className="size-3.5 shrink-0">
			<path
				d="M12 5v14M8 8l-4 4 4 4M16 8l4 4-4 4"
				fill="none"
				stroke="currentColor"
				strokeWidth={2}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function clamp(v: number, lo: number, hi: number) {
	return Math.min(hi, Math.max(lo, v));
}

function announce(set: Dispatch<SetStateAction<string>>, text: string) {
	// A repeated message is nudged with a trailing space, or the live region
	// sees no change and stays silent.
	set((prev) => (prev === text ? `${text} ` : text));
}

function findCard(cols: KanbanColumn[], id: string): KanbanCard | null {
	for (const col of cols) {
		const card = col.cards.find((c) => c.id === id);
		if (card) return card;
	}
	return null;
}

function foldedIn(col: KanbanColumn, folds: Record<string, boolean>, canFold: boolean) {
	return canFold && (folds[col.id] ?? col.collapsed ?? false);
}

function othersIn(col: KanbanColumn, id: string) {
	return col.cards.filter((c) => c.id !== id).length;
}

/** Whether a full column in block mode turns this card away. */
function blocks(col: KanbanColumn, cardId: string, fromCol: string, limit: number, mode: string) {
	if (mode !== "block" || !col.wip || limit <= 0 || col.id === fromCol) return false;
	return othersIn(col, cardId) >= limit;
}

/** `index` counts the column without the moving card. */
function moveCard(cols: KanbanColumn[], id: string, toCol: string, index: number): KanbanColumn[] {
	let card: KanbanCard | null = null;
	let fromCol = "";
	let fromIndex = -1;
	for (const col of cols) {
		const i = col.cards.findIndex((c) => c.id === id);
		if (i >= 0) {
			card = col.cards[i];
			fromCol = col.id;
			fromIndex = i;
			break;
		}
	}
	const moving = card;
	if (!moving || !cols.some((c) => c.id === toCol)) return cols;
	if (fromCol === toCol && fromIndex === index) return cols;
	return cols.map((col) => {
		let cards = col.cards;
		if (col.id === fromCol) cards = cards.filter((c) => c.id !== id);
		if (col.id === toCol) {
			const at = clamp(index, 0, cards.length);
			cards = [...cards.slice(0, at), moving, ...cards.slice(at)];
		}
		return cards === col.cards ? col : { ...col, cards };
	});
}

/**
 * Where an element sits inside the board's scrolled content, from offsets
 * rather than client rects, so transforms and scroll position drop out.
 */
function offsetWithin(el: HTMLElement, ancestor: HTMLElement): { x: number; y: number } | null {
	let x = 0;
	let y = 0;
	let node: HTMLElement | null = el;
	while (node && node !== ancestor) {
		x += node.offsetLeft;
		y += node.offsetTop;
		const parent = node.offsetParent as HTMLElement | null;
		if (parent && parent !== ancestor) {
			x += parent.clientLeft;
			y += parent.clientTop;
		}
		node = parent;
	}
	return node === ancestor ? { x, y } : null;
}

function measureColumns(
	board: HTMLElement,
	cols: KanbanColumn[],
	isFolded: (col: KanbanColumn) => boolean,
	skip: string,
	nodes: Map<string, HTMLElement>,
): GeoColumn[] {
	const out: GeoColumn[] = [];
	for (const col of cols) {
		const section = nodes.get(`col:${col.id}`);
		const at = section ? offsetWithin(section, board) : null;
		if (!section || !at) continue;
		const folded = isFolded(col);
		const geo: GeoColumn = {
			id: col.id,
			x: at.x,
			w: section.offsetWidth,
			folded,
			top: at.y,
			gap: 0,
			heights: [],
			count: othersIn(col, skip),
		};
		const list = nodes.get(`list:${col.id}`);
		if (!folded && list) {
			const spot = offsetWithin(list, board);
			const style = getComputedStyle(list);
			geo.top = (spot ? spot.y : at.y) + (parseFloat(style.paddingTop) || 0);
			geo.gap = parseFloat(style.rowGap) || 0;
			for (const card of col.cards) {
				if (card.id === skip) continue;
				geo.heights.push(nodes.get(`card:${card.id}`)?.offsetHeight ?? 0);
			}
		}
		out.push(geo);
	}
	return out;
}

/**
 * The column under the ghost's centre (or the nearest one), and the slot whose
 * centre would sit closest to it. Pure, and fed only lift-time geometry.
 */
function pickSlot(geo: GeoColumn[], cx: number, cy: number, h: number): Slot | null {
	let best: GeoColumn | null = null;
	let gap = Infinity;
	for (const col of geo) {
		const d = cx < col.x ? col.x - cx : cx > col.x + col.w ? cx - col.x - col.w : 0;
		if (d < gap) {
			gap = d;
			best = col;
		}
	}
	if (!best) return null;
	if (best.folded) return { col: best.id, index: best.count };
	let top = best.top;
	let index = 0;
	let nearest = Math.abs(top + h / 2 - cy);
	for (let i = 0; i < best.heights.length; i++) {
		top += best.heights[i] + best.gap;
		const d = Math.abs(top + h / 2 - cy);
		if (d < nearest) {
			nearest = d;
			index = i + 1;
		}
	}
	return { col: best.id, index };
}

function revealIn(board: HTMLElement, el: HTMLElement) {
	const at = offsetWithin(el, board);
	if (!at) return;
	const pad = 12;
	const left = at.x - pad;
	const right = at.x + el.offsetWidth + pad;
	const top = at.y - pad;
	const bottom = at.y + el.offsetHeight + pad;
	if (left < board.scrollLeft) board.scrollLeft = left;
	else if (right > board.scrollLeft + board.clientWidth) board.scrollLeft = right - board.clientWidth;
	if (top < board.scrollTop) board.scrollTop = top;
	else if (bottom > board.scrollTop + board.clientHeight) board.scrollTop = bottom - board.clientHeight;
}

/** Edge auto-scroll speed for a pointer, zero where the board cannot go further. */
function edgePush(board: HTMLElement, x: number, y: number) {
	const r = board.getBoundingClientRect();
	let vx = axisPush(x - r.left, r.right - x, r.width);
	let vy = axisPush(y - r.top, r.bottom - y, r.height);
	const maxX = board.scrollWidth - board.clientWidth;
	const maxY = board.scrollHeight - board.clientHeight;
	if ((vx < 0 && board.scrollLeft <= 0) || (vx > 0 && board.scrollLeft >= maxX - 1)) vx = 0;
	if ((vy < 0 && board.scrollTop <= 0) || (vy > 0 && board.scrollTop >= maxY - 1)) vy = 0;
	return { vx, vy };
}

function axisPush(fromStart: number, fromEnd: number, size: number) {
	const zone = Math.min(EDGE, size / 4);
	if (zone <= 0) return 0;
	if (fromStart < zone) return -EDGE_SPEED * ramp(1 - Math.max(0, fromStart) / zone);
	if (fromEnd < zone) return EDGE_SPEED * ramp(1 - Math.max(0, fromEnd) / zone);
	return 0;
}

function ramp(t: number) {
	return t * t;
}

function hueOf(name: string) {
	let h = 0;
	for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
	return h;
}
