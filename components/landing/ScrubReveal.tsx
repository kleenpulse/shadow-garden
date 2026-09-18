"use client";

import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion, useTransform } from "motion/react";
import Reveal from "@/components/landing/Reveal";
import { useScrubProgress } from "@/components/landing/use-scrub-progress";

// Scroll-scrubbed counterpart of Reveal: the same fade-and-rise, but driven by
// the reader's scroll through a window that completes after SweepReveal's, so
// the blurb chains behind the sweep in scroll-space the way its old time delay
// chained behind the timeline. Deliberately its own component — an optional
// scrub prop on Reveal would force the scroll hooks onto every Reveal on the
// page. Reduced motion falls back to Reveal itself (instant landing); the
// branch is hydration-safe because useReducedMotion is false on the server
// and first client render.
export default function ScrubReveal({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	const reduce = useReducedMotion();

	if (reduce) return <Reveal className={className}>{children}</Reveal>;

	return <Scrub className={className}>{children}</Scrub>;
}

function Scrub({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	const ref = useRef<HTMLDivElement>(null);
	// Later window than the sweep's ["start end", "start 0.6"]: same row as the
	// h2, so completing at a higher line is what puts it "after" the sweep.
	const smooth = useScrubProgress(ref, ["start 0.9", "start 0.5"]);
	const y = useTransform(smooth, [0, 1], [16, 0]);

	return (
		<motion.div ref={ref} className={className} style={{ opacity: smooth, y }}>
			{children}
		</motion.div>
	);
}
