"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// A tile whose overlay knows which way you came from. Enter across the top edge and
// it drops in from above; leave to the left and it exits left. The panel keeps a
// consistent relationship to your cursor instead of always sliding the same way.
//
// Hover-driven, not drag-driven, so no `touch-action` here — a finger should scroll
// past this, and on tap the overlay simply crossfades from the top.
export interface ApproachProps {
	children?: ReactNode;
	/** Content revealed on hover. */
	overlay?: ReactNode;
	className?: string;
	/** Opacity of the overlay panel, 0.2 → 1. */
	overlayOpacity?: number;
	/** Travel time of the overlay, in ms. */
	duration?: number;
	/** Shear applied while the overlay is off-position, in degrees. */
	skew?: number;
	/** Blur applied to the overlay while it is moving, in px. */
	blur?: number;
	/** How far off-tile the overlay starts, as a percentage of the tile. */
	offsetDistance?: number;
	/** Overlay panel colour (hex). */
	overlayColor?: string;
	/** When true, the overlay crossfades in place with no travel or shear. */
	reducedMotion?: boolean;
}

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * Which edge the pointer crossed. Coordinates are normalised against the tile's
 * aspect ratio first, so a wide tile doesn't report "left" for what was plainly a
 * crossing of the top edge.
 * Returns 0 top, 1 right, 2 bottom, 3 left.
 */
function edgeFrom(rect: DOMRect, clientX: number, clientY: number): number {
	const { width: w, height: h } = rect;
	const x = (clientX - rect.left - w / 2) * (w > h ? h / w : 1);
	const y = (clientY - rect.top - h / 2) * (h > w ? w / h : 1);
	return (Math.round((Math.atan2(y, x) * 180) / Math.PI / 90) + 4) % 4;
}

const AXIS: Array<[number, number]> = [
	[0, -1], // 0 — from the top
	[1, 0], //  1 — from the right
	[0, 1], //  2 — from the bottom
	[-1, 0], // 3 — from the left
];

export default function Approach({
	children,
	overlay,
	className,
	overlayOpacity = 0.92,
	duration = 420,
	skew = 4,
	blur = 0,
	offsetDistance = 100,
	overlayColor = "#a855f7",
	reducedMotion = false,
}: ApproachProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);

	// Hover and focus are tracked separately and OR'd together. One shared flag
	// meant a blur while the cursor was still inside the tile blanked the overlay
	// with no way back — no `pointerenter` will fire for a pointer that never left.
	const hovered = useRef(false);
	const focused = useRef(false);
	/** What `shown` currently resolves to. The guard against re-entrant work. */
	const shown = useRef(false);
	const edge = useRef(0);
	const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// `blur(0px)` is not a no-op. Any non-`none` filter puts the element on its own
	// filter render surface and changes how its damage rect is computed — and this
	// panel is a composited child clipped by a rounded `overflow-hidden` ancestor,
	// which is the one place that reconciliation goes wrong. At the default
	// `blur = 0` that surface bought nothing and cost stale compositor tiles, so the
	// declaration is dropped entirely rather than animated to zero. Same shape as
	// FlipCard's `backdropFilter: activeId ? … : undefined`.
	const filtered = blur > 0;

	// Built once and reapplied by hand after the park below — clearing
	// `style.transition` would drop the inline value React set, not fall back to it.
	const transition =
		`transform ${duration}ms ${EASE}, opacity ${duration}ms ${EASE}` +
		(filtered ? `, filter ${duration}ms ${EASE}` : "");

	const clearHide = useCallback(() => {
		if (hideTimer.current !== null) {
			clearTimeout(hideTimer.current);
			hideTimer.current = null;
		}
	}, []);

	/**
	 * Write one complete, self-consistent set of values. Every appearance the
	 * panel can have goes through here, so there is exactly one place the answer
	 * to "what should this look like" is computed.
	 */
	const apply = useCallback(
		(away: boolean, animate: boolean) => {
			const panel = panelRef.current;
			if (!panel) return;
			const [dx, dy] = AXIS[edge.current] ?? AXIS[0];
			const d = away ? offsetDistance : 0;

			panel.style.transition = animate ? transition : "none";
			panel.style.setProperty("--sg-ap-x", `${dx * d}%`);
			panel.style.setProperty("--sg-ap-y", `${dy * d}%`);
			panel.style.setProperty("--sg-ap-skew", away ? `${dx * skew}deg` : "0deg");
			panel.style.setProperty("--sg-ap-blur", away ? `${blur}px` : "0px");
			panel.style.setProperty(
				"--sg-ap-opacity",
				away ? "0" : `${overlayOpacity}`,
			);

			// Flush, so the parked position becomes a discrete before-state that the
			// travel written next can transition *from*.
			if (!animate) void panel.offsetWidth;
		},
		[offsetDistance, skew, blur, overlayOpacity, transition],
	);

	/**
	 * Park off-tile, flush, travel in — all in one task.
	 *
	 * Deliberately no `requestAnimationFrame` between the park and the travel.
	 * The flush is what makes the park a discrete before-state; the deferred
	 * frame added nothing and cost everything. It was a window for a leave to
	 * land in, and a leave landing there wrote the *same* off-tile values the
	 * park had just written — byte-identical, since park and exit share the one
	 * `away` formula. Nothing changed, so no transition started, no
	 * `transitionend` fired, and nothing invalidated. Meanwhile `transition:none`
	 * had already cancelled the travel that was in flight, and a cancelled
	 * transition on a `will-change` layer leaves its last rasterised frame on
	 * screen. The result was an overlay frozen part-way across the tile that no
	 * subsequent write could clear, because every later write was also a no-op.
	 */
	const reveal = useCallback(() => {
		const panel = panelRef.current;
		if (!panel) return;
		clearHide();
		panel.style.visibility = "";
		apply(true, false);
		apply(false, true);
	}, [apply, clearHide]);

	const dismiss = useCallback(() => {
		apply(true, true);
		// Guaranteed backstop for the visibility latch. `transitionend` is an
		// optimisation here, never the only way home: it does not fire for a
		// cancelled transition, nor when a write changes nothing, and both are
		// ordinary events on a tile the pointer is crossing quickly.
		clearHide();
		hideTimer.current = setTimeout(() => {
			hideTimer.current = null;
			if (shown.current) return;
			const panel = panelRef.current;
			if (panel) panel.style.visibility = "hidden";
		}, duration + 80);
	}, [apply, clearHide, duration]);

	/** Resolve hover+focus to one target state. A no-op when nothing changed. */
	const sync = useCallback(() => {
		const want = hovered.current || focused.current;
		// Re-entering while already shown must not re-park — that would restart
		// the travel from off-tile. It also makes a duplicate `pointerenter` from
		// a second pointer type harmless.
		if (want === shown.current) return;
		shown.current = want;
		if (want) reveal();
		else dismiss();
	}, [reveal, dismiss]);

	const onPointerEnter = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			const el = rootRef.current;
			if (!el) return;
			hovered.current = true;
			edge.current = reducedMotion
				? 0
				: edgeFrom(el.getBoundingClientRect(), e.clientX, e.clientY);
			sync();
		},
		[sync, reducedMotion],
	);

	const onPointerLeave = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			const el = rootRef.current;
			if (!el) return;
			hovered.current = false;
			edge.current = reducedMotion
				? 0
				: edgeFrom(el.getBoundingClientRect(), e.clientX, e.clientY);
			sync();
		},
		[sync, reducedMotion],
	);

	// A cancel is not a departure — the browser has simply taken the pointer away
	// (a touch turning into a scroll). Reading coordinates off it is meaningless,
	// so the exit reuses whichever edge is already recorded.
	const onPointerCancel = useCallback(() => {
		hovered.current = false;
		sync();
	}, [sync]);

	// `focusin`/`focusout` bubble, which is what makes a card with a link inside
	// reveal on Tab — worth keeping. Moves *within* the tile are ignored so
	// tabbing between two children doesn't exit and re-enter.
	const onFocus = useCallback(
		(e: React.FocusEvent<HTMLDivElement>) => {
			if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
			focused.current = true;
			// Keyboard focus has no direction, so it always arrives from the top —
			// unless the pointer is already here and has established one.
			if (!hovered.current) edge.current = 0;
			sync();
		},
		[sync],
	);

	const onBlur = useCallback(
		(e: React.FocusEvent<HTMLDivElement>) => {
			if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
			focused.current = false;
			sync();
		},
		[sync],
	);

	/**
	 * Hide early once the exit finishes, so no sub-pixel colour from `background`
	 * bleeds through at near-zero opacity. Purely an optimisation over the timer
	 * in `dismiss` — if it never fires, the timer still lands.
	 */
	const onTransitionEnd = useCallback(
		(e: React.TransitionEvent<HTMLDivElement>) => {
			// The panel wraps arbitrary `overlay` content, whose own transitions bubble.
			if (e.target !== panelRef.current) return;
			if (e.propertyName !== "opacity") return;
			if (shown.current) return;
			clearHide();
			const panel = panelRef.current;
			if (panel) panel.style.visibility = "hidden";
		},
		[clearHide],
	);

	// A pointer that leaves the window never delivers `pointerleave` to the tile
	// it was over, which would strand the overlay open. Same backstop the canvas
	// entries use for their pointer fields.
	useEffect(() => {
		const onDocumentLeave = () => {
			if (!hovered.current) return;
			hovered.current = false;
			sync();
		};
		const root = document.documentElement;
		root.addEventListener("pointerleave", onDocumentLeave);
		return () => root.removeEventListener("pointerleave", onDocumentLeave);
	}, [sync]);

	// Re-apply when a control changes. Without this a parked panel keeps the old
	// `offsetDistance` until the next pointer event — and at anything under 100%
	// "parked" is still partly over the tile, so the stale value is visible.
	useEffect(() => {
		apply(!shown.current, shown.current);
	}, [apply]);

	useEffect(() => {
		const panel = panelRef.current;
		if (panel && !shown.current) panel.style.visibility = "hidden";
	}, []);

	useEffect(() => clearHide, [clearHide]);

	return (
		<div
			ref={rootRef}
			onPointerEnter={onPointerEnter}
			onPointerLeave={onPointerLeave}
			onPointerCancel={onPointerCancel}
			onFocus={onFocus}
			onBlur={onBlur}
			className={cn("relative isolate overflow-hidden select-none", className)}
		>
			{children}

			<div
				ref={panelRef}
				aria-hidden
				onTransitionEnd={onTransitionEnd}
				// No `will-change`. It promoted this layer for the element's whole
				// lifetime, so a stale raster inside the rounded clip was never
				// discarded — `visibility: hidden` does not force a re-raster of the
				// clip region on a promoted layer. `spotlight-shell` runs the same
				// clipped skew-translate transition without it.
				className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-end p-5"
				style={
					{
						"--sg-ap-x": "0%",
						"--sg-ap-y": "-100%",
						"--sg-ap-skew": "0deg",
						"--sg-ap-blur": "0px",
						"--sg-ap-opacity": "0",
						background: overlayColor,
						// Reduced motion keeps the reveal — it just crossfades in place
						// instead of travelling, shearing and blurring.
						opacity: "var(--sg-ap-opacity)",
						transform: reducedMotion
							? undefined
							: "translate(var(--sg-ap-x), var(--sg-ap-y)) skewX(var(--sg-ap-skew))",
						filter:
							reducedMotion || !filtered
								? undefined
								: "blur(var(--sg-ap-blur))",
						transition,
					} as React.CSSProperties
				}
			>
				{overlay}
			</div>
		</div>
	);
}
