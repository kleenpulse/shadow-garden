"use client";

import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	type ReactNode,
} from "react";
import {
	animate,
	motion,
	useMotionValue,
	useReducedMotion,
	useTransform,
	type MotionStyle,
} from "motion/react";

// A bottom sheet with three resting heights: peek, half and full.
//
// ONE NUMBER. The whole sheet is driven by `p`, the share of the panel that is
// pushed below the bottom edge: 0 is fully open, 1 is closed. It is a share,
// not pixels, on purpose. The panel is moved with a percentage translate and
// the stops are shares of the container, so a resize needs no measuring and
// no observer: the sheet is already in the right place.
//
// LETTING GO. A release does not snap to the nearest stop. The finger's speed
// is carried forward a fifth of a second and the stop nearest to that point
// wins, which is why a short flick from the bottom can reach the top. The same
// speed is handed to the spring, so the sheet leaves the hand at the speed the
// hand was moving.
//
// THE ENDS. Past the top stop, and past the bottom one when the sheet cannot
// be dismissed, the panel keeps following the finger but less and less: the
// rubber band formula from iOS scroll views.
//
// THE PAGE. At peek the page behind stays live and undimmed. Above peek a
// backdrop fades in and, with `recede`, the page scales back a little, both
// read off the same `p`.
//
// The gesture is hand-rolled on pointer events and lives on the header only,
// so the content can keep its own scroll. `touch-none` keeps a finger drag
// from scrolling the page, and `select-none` is there because the header has
// text: a drag across text selects it, the next press starts a native
// drag-and-drop, and the browser answers with `pointercancel`.

export type SheetDetent = "peek" | "half" | "full";

export interface SheetProps {
	/** The page the sheet sits over. */
	children?: ReactNode;
	/** What goes inside the sheet. */
	content?: ReactNode;
	/** Shown in the sheet's header, under the handle. */
	title?: ReactNode;
	/** Name read out for the sheet. */
	label?: string;
	/** Controlled open state. Leave it out to let the sheet keep its own. */
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	/** The height the sheet opens at. */
	initialDetent?: SheetDetent;
	onDetentChange?: (detent: SheetDetent) => void;
	/** Height of the lowest stop, as a percent of the container. */
	peek?: number;
	/** Height of the middle stop, as a percent of the container. */
	half?: number;
	/** Spring tension of the snap. */
	stiffness?: number;
	/** Spring friction of the snap. */
	damping?: number;
	/** How far the sheet gives when pulled past its ends. 0 is a hard stop. */
	rubberBand?: number;
	/** Darkness of the layer behind the sheet at full height, from 0 to 1. */
	backdrop?: number;
	/** The page scales back a little as the sheet rises. */
	recede?: boolean;
	/** A pull or a flick past the lowest stop closes the sheet. */
	dismissible?: boolean;
	/** Focus ring on the handle. */
	accentColor?: string;
	/** Snap between stops at once, with no spring. */
	reducedMotion?: boolean;
	className?: string;
}

const DETENTS: SheetDetent[] = ["peek", "half", "full"];

/** The panel's height as a share of the container. The gap it leaves at the
 *  top is what tells you there is a page behind it. */
const FULL = 0.92;
/** Seconds the release speed is carried forward to pick a stop. */
const PROJECT = 0.2;
/** How much the page shrinks when the sheet is fully open. */
const RECEDE = 0.05;
/** The most the rubber band can stretch, in panel heights. Kept under the gap
 *  above a full sheet, so an over-pull never pushes the handle out of view. */
const BAND = 0.12;

interface Gesture {
	id: number;
	y0: number;
	p0: number;
	h: number;
	moved: boolean;
	samples: { t: number; y: number }[];
}

export default function Sheet({
	children,
	content,
	title,
	label = "Sheet",
	open,
	defaultOpen = false,
	onOpenChange,
	initialDetent = "peek",
	onDetentChange,
	peek = 24,
	half = 56,
	stiffness = 320,
	damping = 32,
	rubberBand = 0.55,
	backdrop = 0.5,
	recede = true,
	dismissible = true,
	accentColor = "#a855f7",
	reducedMotion = false,
	className = "",
}: SheetProps) {
	const panelRef = useRef<HTMLDivElement>(null);
	const handleRef = useRef<HTMLButtonElement>(null);
	const gesture = useRef<Gesture | null>(null);
	const run = useRef<ReturnType<typeof animate> | null>(null);
	const target = useRef(1);
	const fling = useRef(0);
	const restore = useRef<HTMLElement | null>(null);

	const still = Boolean(useReducedMotion()) || reducedMotion;

	// Stops, as the hidden share of the panel. A peek set above half is just
	// the two swapped.
	const low = clamp(Math.min(peek, half), 5, 100) / 100;
	const mid = clamp(Math.max(peek, half), 5, 100) / 100;
	const pPeek = 1 - Math.min(low, FULL) / FULL;
	const pHalf = 1 - Math.min(mid, FULL) / FULL;
	const stops = [pPeek, pHalf, 0];

	const [inner, setInner] = useState(defaultOpen);
	const isOpen = open ?? inner;
	const [detent, setDetent] = useState(() =>
		Math.max(0, DETENTS.indexOf(initialDetent)),
	);
	const [gone, setGone] = useState(!isOpen);

	// Opening is noticed during render, so the panel is already visible in the
	// commit that starts its spring.
	const [seenOpen, setSeenOpen] = useState(isOpen);
	if (seenOpen !== isOpen) {
		setSeenOpen(isOpen);
		if (isOpen) {
			setGone(false);
			setDetent(Math.max(0, DETENTS.indexOf(initialDetent)));
		}
	}

	const p = useMotionValue(isOpen ? stops[detent] : 1);
	const wasOpen = useRef(isOpen);
	useEffect(() => {
		// Where the sheet starts, for the effects below. Mount only.
		target.current = p.get();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const live = useRef({
		stops,
		detent,
		stiffness,
		damping,
		rubberBand,
		dismissible,
		still,
	});
	useLayoutEffect(() => {
		live.current = {
			stops,
			detent,
			stiffness,
			damping,
			rubberBand,
			dismissible,
			still,
		};
	});

	/** 0 at peek and below, 1 at full: how far the sheet has risen over the page. */
	const lift = (v: number) =>
		pPeek > 0.001 ? clamp((pPeek - v) / pPeek, 0, 1) : 0;

	const y = useTransform(p, (v) => `${v * 100}%`);
	const shade = useTransform(p, (v) => clamp(backdrop, 0, 1) * lift(v));
	const shadeHits = useTransform(p, (v) => (lift(v) > 0.02 ? "auto" : "none"));
	const pageScale = useTransform(p, (v) => (recede ? 1 - RECEDE * lift(v) : 1));
	const pageRadius = useTransform(p, (v) => (recede ? 14 * lift(v) : 0));

	const settle = (to: number, velocity = 0) => {
		run.current?.stop();
		run.current = null;
		target.current = to;
		const l = live.current;
		if (l.still) {
			p.set(to);
			if (to >= 1) setGone(true);
			return;
		}
		const controls = animate(p, to, {
			type: "spring",
			stiffness: l.stiffness,
			damping: l.damping,
			velocity,
			// `p` runs from 0 to 1, so the default rest thresholds, tuned for
			// pixels, would end the spring a visible step short.
			restDelta: 0.001,
			restSpeed: 0.01,
		});
		run.current = controls;
		controls.then(() => {
			if (run.current !== controls) return;
			run.current = null;
			if (to >= 1) setGone(true);
		});
	};

	const goTo = (index: number, velocity = 0) => {
		if (index !== live.current.detent) {
			setDetent(index);
			onDetentChange?.(DETENTS[index]);
		}
		settle(live.current.stops[index], velocity);
	};

	const close = (velocity = 0) => {
		fling.current = velocity;
		if (open === undefined) setInner(false);
		onOpenChange?.(false);
	};

	// Open and close, whoever asked for it.
	useEffect(() => {
		// Compared, not counted: an effect that only skipped its first run
		// would fire on a dev double-mount and steal focus.
		if (wasOpen.current === isOpen) return;
		wasOpen.current = isOpen;
		const velocity = fling.current;
		fling.current = 0;
		if (isOpen) {
			const active = document.activeElement;
			restore.current = active instanceof HTMLElement ? active : null;
			settle(live.current.stops[live.current.detent]);
			handleRef.current?.focus({ preventScroll: true });
		} else {
			settle(1, velocity);
			const panel = panelRef.current;
			if (panel && panel.contains(document.activeElement)) {
				restore.current?.focus({ preventScroll: true });
			}
		}
		// `settle` reads everything through refs.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen]);

	// A stop that moved under a resting sheet takes the sheet with it.
	useEffect(() => {
		if (target.current >= 1 || gesture.current) return;
		settle(live.current.stops[live.current.detent]);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pPeek, pHalf]);

	useEffect(
		() => () => {
			run.current?.stop();
		},
		[],
	);

	const band = (over: number) => {
		const c = clamp(live.current.rubberBand, 0, 1);
		return (over * BAND * c) / (BAND + c * over);
	};

	const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
		if (e.pointerType === "mouse" && e.button !== 0) return;
		const panel = panelRef.current;
		if (!panel) return;
		run.current?.stop();
		run.current = null;
		e.currentTarget.setPointerCapture(e.pointerId);
		gesture.current = {
			id: e.pointerId,
			y0: e.clientY,
			p0: p.get(),
			h: panel.offsetHeight || 1,
			moved: false,
			samples: [{ t: e.timeStamp, y: e.clientY }],
		};
	};

	const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
		const g = gesture.current;
		if (!g || g.id !== e.pointerId) return;
		const dy = e.clientY - g.y0;
		if (!g.moved && Math.abs(dy) < 4) return;
		g.moved = true;
		const floor = live.current.dismissible ? 1 : live.current.stops[0];
		let v = g.p0 + dy / g.h;
		if (v < 0) v = -band(-v);
		else if (v > floor) v = floor + band(v - floor);
		p.set(v);
		g.samples.push({ t: e.timeStamp, y: e.clientY });
		if (g.samples.length > 6) g.samples.shift();
	};

	const release = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
		const g = gesture.current;
		if (!g || g.id !== e.pointerId) return;
		gesture.current = null;
		if (e.currentTarget.hasPointerCapture(e.pointerId)) {
			e.currentTarget.releasePointerCapture(e.pointerId);
		}
		const l = live.current;
		if (!g.moved) {
			// A tap on the header steps to the next height.
			if (!cancelled) goTo((l.detent + 1) % DETENTS.length);
			else settle(l.stops[l.detent]);
			return;
		}
		// Speed over the last tenth of a second, in panel heights per second.
		let velocity = 0;
		if (!cancelled) {
			const last = g.samples[g.samples.length - 1];
			const old = g.samples.find((s) => last.t - s.t <= 100) ?? last;
			const dt = last.t - old.t;
			if (dt > 0) velocity = ((last.y - old.y) / dt) * 1000 / g.h;
		}
		const landing = p.get() + velocity * PROJECT;
		const options = l.dismissible ? [...l.stops, 1] : l.stops;
		let best = 0;
		for (let i = 1; i < options.length; i++) {
			if (Math.abs(options[i] - landing) < Math.abs(options[best] - landing)) best = i;
		}
		if (best >= l.stops.length) close(velocity);
		else goTo(best, velocity);
	};

	const onHandleKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
		const top = DETENTS.length - 1;
		let next = detent;
		switch (e.key) {
			case "ArrowUp":
			case "ArrowRight":
				next = Math.min(top, detent + 1);
				break;
			case "ArrowDown":
			case "ArrowLeft":
				next = Math.max(0, detent - 1);
				break;
			case "Home":
				next = 0;
				break;
			case "End":
				next = top;
				break;
			case "Enter":
			case " ":
				next = (detent + 1) % DETENTS.length;
				break;
			default:
				return;
		}
		e.preventDefault();
		if (next !== detent) goTo(next);
	};

	const onPanelKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
		if (e.key !== "Escape") return;
		e.stopPropagation();
		if (dismissible) close();
		else goTo(0);
	};

	const panelStyle = {
		height: `${FULL * 100}%`,
		y,
		"--sheet-p": p,
		visibility: gone ? "hidden" : "visible",
	} as MotionStyle;

	return (
		<div
			// `clip`, not `hidden`: a hidden box can still be scrolled by the
			// browser, and it will be, to bring a focused control inside a
			// lowered sheet into view. A clipped box cannot scroll at all.
			className={`@container-size relative h-full w-full overflow-clip ${className}`.trim()}
		>
			<motion.div
				className="absolute inset-0 origin-top overflow-hidden"
				style={{ scale: pageScale, borderRadius: pageRadius }}
			>
				{children}
			</motion.div>

			<motion.div
				aria-hidden="true"
				className="absolute inset-0 bg-black"
				style={{ opacity: shade, pointerEvents: shadeHits }}
				onClick={() => goTo(0)}
			/>

			<motion.div
				ref={panelRef}
				role="dialog"
				aria-label={label}
				onKeyDown={onPanelKey}
				// The block below the panel fills the gap an upward over-pull
				// would otherwise open at the bottom edge.
				className="absolute inset-x-0 bottom-0 flex flex-col rounded-t-2xl border border-b-0 border-hairline bg-panel text-ink shadow-[0_-12px_40px_rgba(0,0,0,0.35)] after:absolute after:-inset-x-px after:top-full after:h-1/4 after:border-x after:border-hairline after:bg-inherit"
				style={panelStyle}
			>
				<div
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={(e) => release(e, false)}
					onPointerCancel={(e) => release(e, true)}
					className="flex shrink-0 cursor-grab touch-none flex-col items-center px-5 pt-2 pb-3 select-none active:cursor-grabbing"
				>
					<button
						ref={handleRef}
						type="button"
						role="slider"
						aria-label={`${label} height`}
						aria-orientation="vertical"
						aria-valuemin={0}
						aria-valuemax={DETENTS.length - 1}
						aria-valuenow={detent}
						aria-valuetext={DETENTS[detent]}
						onKeyDown={onHandleKey}
						className="flex h-5 w-16 cursor-grab items-center justify-center rounded-full text-ink-mute focus-visible:outline-2 focus-visible:outline-offset-2 active:cursor-grabbing"
						style={{ outlineColor: accentColor }}
					>
						<span className="block h-1 w-9 rounded-full bg-current opacity-50" />
					</button>
					{title ? (
						<div className="mt-1.5 w-full text-left text-[15px] font-semibold text-ink">
							{title}
						</div>
					) : null}
				</div>
				{/* The margin is the part of the panel that is off screen, so the
				    scroll area always ends at the visible edge and its last line can
				    be reached at any height. */}
				<div
					className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5"
					style={{
						marginBottom: `calc(max(var(--sheet-p), 0) * ${FULL * 100}cqh)`,
					}}
				>
					{content}
				</div>
			</motion.div>
		</div>
	);
}

function clamp(v: number, lo: number, hi: number): number {
	return v < lo ? lo : v > hi ? hi : v;
}
