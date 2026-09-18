"use client";

import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion, useTransform } from "motion/react";
import { cn } from "@/lib/utils";
import Reveal from "@/components/landing/Reveal";
import { useScrubProgress } from "@/components/landing/use-scrub-progress";

// Accent-block sweep for the exhibit headers, scroll hero only. A solid bar
// slides across the line left to right, driven by the reader's own scroll: the
// sweep starts as the header clears the fold and completes by 60% viewport
// height, and runs backwards when the reader scrolls back up (the scroll
// position is the timeline). The text switches on while the bar
// covers it edge to edge, so the bar's trailing edge is what unmasks it —
// both the bar and the flip read the same smoothed value, so the spring can
// oscillate around the flip point only while the bar is parked over the text.
// `overflow: clip` on the wrapper is the whole trick: the bar spends both ends
// of its travel outside the box, so it never shows past the text. Inactive
// (classic hero), this is the plain fade-and-rise Reveal, so classic looks as
// it did. Reduced motion lands the text instantly and sends the bar straight
// to its exit, still clipped; the branch is safe pre-hydration because
// useReducedMotion is false on the server and first client render.

/** Progress points of the bar's travel: enter, hold covering the text, exit.
 *  The text flips on at 0.5, inside the hold. */
const TIMES = [0, 0.42, 0.58, 1];
const VIEWPORT = { once: true, margin: "-80px" } as const;

export default function SweepReveal({
	children,
	active,
	className,
}: {
	children: ReactNode;
	/** Off, the children get the ordinary Reveal. Decided by the caller from
	 *  the hero variant, so this stays a dumb wrapper. */
	active: boolean;
	className?: string;
}) {
	const reduce = useReducedMotion();

	if (!active) return <Reveal className={className}>{children}</Reveal>;

	if (reduce) {
		return (
			<motion.div
				className={cn("relative w-fit max-w-full overflow-clip", className)}
				initial="hidden"
				whileInView="shown"
				viewport={VIEWPORT}
			>
				<motion.div
					variants={{
						hidden: { opacity: 0 },
						shown: { opacity: 1, transition: { duration: 0 } },
					}}
				>
					{children}
				</motion.div>
				<motion.div
					aria-hidden
					className="pointer-events-none absolute inset-0 bg-accent"
					variants={{
						hidden: { x: "-101%" },
						shown: { x: "101%", transition: { duration: 0 } },
					}}
				/>
			</motion.div>
		);
	}

	return <ScrubSweep className={className}>{children}</ScrubSweep>;
}

// The scrub hooks live in a child so the classic/reduced paths never mount
// them: useScroll on a ref that never attaches trips motion's unhydrated-ref
// invariant, and the classic hero has no business paying for a scroll spring.
function ScrubSweep({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const smooth = useScrubProgress(ref, ["start end", "start 0.6"]);
	const x = useTransform(smooth, TIMES, ["-101%", "0%", "0%", "101%"]);
	const textOpacity = useTransform(smooth, (v) => (v >= 0.5 ? 1 : 0));

	return (
		<div ref={ref} className={cn("relative w-fit max-w-full overflow-clip", className)}>
			<motion.div style={{ opacity: textOpacity }}>{children}</motion.div>
			<motion.div
				aria-hidden
				className="pointer-events-none absolute inset-0 bg-accent"
				style={{ x }}
			/>
		</div>
	);
}
