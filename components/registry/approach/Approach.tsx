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
	/** Tracks whether the pointer is currently inside the tile. */
	const insideRef = useRef(false);

	// Built once and reapplied by hand after the park below — clearing
	// `style.transition` would drop the inline value React set, not fall back to it.
	const transition = `transform ${duration}ms ${EASE}, opacity ${duration}ms ${EASE}, filter ${duration}ms ${EASE}`;

	const place = useCallback(
		(edge: number, away: boolean, animate: boolean) => {
			const panel = panelRef.current;
			if (!panel) return;
			const [dx, dy] = AXIS[edge] ?? AXIS[0];
			const d = away ? offsetDistance : 0;

			if (!animate) {
				// Park the panel off-tile with no transition, then flush the style so the
				// browser treats the next write as a change worth animating. Reading
				// offsetWidth is the flush — cheap here because it happens once per
				// pointerenter, not once per frame, and it keeps the whole component free
				// of requestAnimationFrame.
				panel.style.transition = "none";
				panel.style.setProperty("--sg-ap-x", `${dx * offsetDistance}%`);
				panel.style.setProperty("--sg-ap-y", `${dy * offsetDistance}%`);
				panel.style.setProperty("--sg-ap-skew", `${dx * skew}deg`);
				panel.style.setProperty("--sg-ap-blur", `${blur}px`);
				panel.style.setProperty("--sg-ap-opacity", "0");
				void panel.offsetWidth;
				return;
			}

			// Re-enable transition before animating
			panel.style.transition = transition;
			panel.style.setProperty("--sg-ap-x", `${dx * d}%`);
			panel.style.setProperty("--sg-ap-y", `${dy * d}%`);
			panel.style.setProperty(
				"--sg-ap-skew",
				away ? `${dx * skew}deg` : "0deg",
			);
			panel.style.setProperty("--sg-ap-blur", away ? `${blur}px` : "0px");
			panel.style.setProperty(
				"--sg-ap-opacity",
				away ? "0" : `${overlayOpacity}`,
			);
		},
		[offsetDistance, skew, blur, overlayOpacity, transition],
	);

	const onPointerEnter = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			insideRef.current = true;
			const panel = panelRef.current;
			if (panel) panel.style.visibility = "";
			const el = rootRef.current;
			if (!el) return;
			const edge = reducedMotion
				? 0
				: edgeFrom(el.getBoundingClientRect(), e.clientX, e.clientY);
			
			// Park the element instantly
			place(edge, true, false);

			// Start the animation in the next frame to avoid compositor glitches
			// on rapid enter/leave movements.
			requestAnimationFrame(() => {
				if (!insideRef.current) return;
				place(edge, false, true);
			});
		},
		[place, reducedMotion],
	);

	const onPointerLeave = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			insideRef.current = false;
			const el = rootRef.current;
			if (!el) return;
			const edge = reducedMotion
				? 0
				: edgeFrom(el.getBoundingClientRect(), e.clientX, e.clientY);
			place(edge, true, true);
		},
		[place, reducedMotion],
	);

	// Keyboard focus has no direction, so it always arrives from the top.
	const onFocus = useCallback(() => {
		insideRef.current = true;
		const panel = panelRef.current;
		if (panel) panel.style.visibility = "";
		
		place(0, true, false);
		requestAnimationFrame(() => {
			if (!insideRef.current) return;
			place(0, false, true);
		});
	}, [place]);
	const onBlur = useCallback(() => {
		insideRef.current = false;
		place(0, true, true);
	}, [place]);

	/**
	 * Once the leave-out animation finishes, hide the panel entirely so no
	 * sub-pixel colour from `background` can bleed through at near-zero opacity.
	 * We only act on the `opacity` property to avoid firing once per property.
	 */
	const onTransitionEnd = useCallback(
		(e: React.TransitionEvent<HTMLDivElement>) => {
			if (e.propertyName !== "opacity") return;
			if (insideRef.current) return;
			const panel = panelRef.current;
			if (panel) panel.style.visibility = "hidden";
		},
		[],
	);

	useEffect(() => {
		if (panelRef.current && !insideRef.current) {
			panelRef.current.style.visibility = "hidden";
		}
	}, []);

	return (
		<div
			ref={rootRef}
			onPointerEnter={onPointerEnter}
			onPointerLeave={onPointerLeave}
			onPointerCancel={onPointerLeave}
			onFocus={onFocus}
			onBlur={onBlur}
			className={cn("relative isolate overflow-hidden select-none", className)}
		>
			{children}

			<div
				ref={panelRef}
				aria-hidden
				onTransitionEnd={onTransitionEnd}
				className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-end p-5 will-change-transform"
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
						filter: reducedMotion ? undefined : "blur(var(--sg-ap-blur))",
						transition,
					} as React.CSSProperties
				}
			>
				{overlay}
			</div>
		</div>
	);
}
