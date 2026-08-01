"use client";

import {
	forwardRef,
	useEffect,
	useMemo,
	useState,
	type ComponentPropsWithoutRef,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

// A filled book that opens on its hinge, at a constant width.
//
// Art is authored in a LOCAL space where x=0 is the spine and x=W the outer
// edge. Closed, that space is placed at x=SPINE_SHUT and drawn at full scale,
// so the book spans [SPINE_SHUT, SPINE_SHUT+W]. Open, it is placed at the
// gutter and drawn mirrored at half scale, so the same art becomes the left
// page spanning [SPINE_SHUT, 12] while a second copy fills [12, 20.5].
// Because SPINE_SHUT = 12 - W/2, both states occupy exactly the same width —
// the cover foreshortens to half as it flips rather than the book doubling.
//
// The cover's face swaps (cover art → page art) at EDGE_AT, the instant scaleX
// crosses zero and it is edge-on and invisible. Nothing interpolates a path;
// the only animated values are scaleX, translateX and opacity.
//
// Rejected on the way here, each checked by rendering at 16/24/48/88px: a
// symmetric squeeze-and-expand (reads as a swap, not an opening), a
// mirror-stack of two page shapes (closed reads as a waving flag), page-lines
// inside flat covers (reads as a table), and flat covers alone (reads as a
// split-pane layout icon).

/** Outer edge of the art in local space. */
const W = 17;
/** Closed spine position. `12 - W/2` is what makes both states equal width. */
const SPINE_SHUT = 12 - W / 2;
/** Open, the cover is mirrored and half-size — that is what the flip lands on. */
const OPEN_SX = -0.5;

/** Front cover: body, spine slot, title label, page block. Knockouts via evenodd. */
const COVER_FACE =
	"M0 3.5h15.5a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5H0V3.5Z M1.7 5.6h1.5v12.8H1.7z M5.2 6.8h8.6v3.4H5.2z M4.4 17.2h9.4v1.4H4.4z";
/** One page, gutter edge at local x=0. Rendered at half scale in both halves. */
const PAGE_FACE = "M0 6.6c4.03-1.2 10.29-2 17-2V17.2c-6.71 0-12.98.8-17 2V6.6Z";
/** Both covers standing open, cradling the pages. Fixed — it only fades. */
const COVER_U = "M2.2 7v12.4c3.4 0 7.2.8 9.8 2.2 2.6-1.4 6.4-2.2 9.8-2.2V7";

const DURATION = 0.5;
/**
 * Fraction of the swing at which the cover is edge-on. scaleX travels 1 → -0.5,
 * so zero falls at 1/1.5 of the way; matching it keeps the flip a constant rate.
 */
const EDGE_AT = 1 / (1 - OPEN_SX);

// motion overwrites `transform-origin` with `50% 50%`, so the pivot is fixed at
// the middle of the box — (12,12) once `view-box` makes percentages resolve
// against the 24-unit grid rather than each shape's own bbox. The x values
// below are pre-compensated for that pivot: placing local x=0 at `at` while
// scaled by `s` needs translateX = at - 12 + 12s.
const PIVOT = { transformBox: "view-box" } as const;
const place = (at: number, s: number) => at - 12 + 12 * s;

function buildVariants(reduced: boolean) {
	const snap = { duration: 0 };
	const swing = reduced
		? snap
		: { duration: DURATION, ease: "easeInOut" as const };

	return {
		hinge: {
			closed: { x: place(SPINE_SHUT, 1), scaleX: 1, transition: swing },
			open: { x: place(12, OPEN_SX), scaleX: OPEN_SX, transition: swing },
		},
		// Instant, timed to land while the cover is edge-on and invisible.
		coverFace: {
			closed: {
				opacity: 1,
				transition: reduced
					? snap
					: { duration: 0, delay: DURATION * (1 - EDGE_AT) },
			},
			open: {
				opacity: 0,
				transition: reduced ? snap : { duration: 0, delay: DURATION * EDGE_AT },
			},
		},
		pageFace: {
			closed: {
				opacity: 0,
				transition: reduced
					? snap
					: { duration: 0, delay: DURATION * (1 - EDGE_AT) },
			},
			open: {
				opacity: 1,
				transition: reduced ? snap : { duration: 0, delay: DURATION * EDGE_AT },
			},
		},
		// Revealed from under the cover as it lifts, not before.
		rightPage: {
			closed: {
				x: place(12, 0),
				scaleX: 0,
				transition: reduced ? snap : { duration: DURATION * 0.45 },
			},
			open: {
				x: place(12, -OPEN_SX),
				scaleX: -OPEN_SX,
				transition: reduced
					? snap
					: { duration: DURATION * 0.55, delay: DURATION * 0.45 },
			},
		},
		coverU: {
			closed: {
				opacity: 0,
				transition: reduced ? snap : { duration: 0.1 },
			},
			open: {
				opacity: 1,
				transition: reduced
					? snap
					: { duration: 0.18, delay: DURATION * 0.65 },
			},
		},
	};
}

export type CookBookIconProps = Omit<
	ComponentPropsWithoutRef<typeof motion.svg>,
	"children"
> & {
	/** Drives the hinge. Defaults closed. */
	open?: boolean;
};

const CookBookIcon = forwardRef<SVGSVGElement, CookBookIconProps>(
	({ open = false, className, ...props }, ref) => {
		const reduced = useReducedMotion() ?? false;
		const v = useMemo(() => buildVariants(reduced), [reduced]);

		// Mount closed, then animate open — `initial={false}` can't express that,
		// and it's the whole point: arriving on /cookbook from the landing page
		// mounts this fresh with `open` already true, because TopBar lives inside
		// the (shell) layout and the landing page does not.
		const [armed, setArmed] = useState(false);
		useEffect(() => {
			if (open) setArmed(true);
		}, [open]);

		return (
			<motion.svg
				ref={ref}
				viewBox="0 0 24 24"
				width={24}
				height={24}
				fill="currentColor"
				initial="closed"
				animate={open && armed ? "open" : "closed"}
				className={cn(className)}
				{...props}
			>
				{/* Never seed an SVG child's opacity through `style` — motion animates
				    it as an attribute, and inline CSS would silently outrank it. */}
				<motion.g variants={v.rightPage} style={PIVOT}>
					<path d={PAGE_FACE} />
				</motion.g>
				<motion.g variants={v.hinge} style={PIVOT}>
					<motion.path
						d={COVER_FACE}
						fillRule="evenodd"
						variants={v.coverFace}
					/>
					<motion.path d={PAGE_FACE} variants={v.pageFace} />
				</motion.g>
				<motion.path
					d={COVER_U}
					variants={v.coverU}
					fill="none"
					stroke="currentColor"
					strokeWidth={1.6}
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</motion.svg>
		);
	},
);

CookBookIcon.displayName = "CookBookIcon";
export default CookBookIcon;
