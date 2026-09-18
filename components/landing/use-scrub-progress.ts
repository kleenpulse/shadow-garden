"use client";

import type { RefObject } from "react";
import { useScroll, useSpring, type MotionValue } from "motion/react";

// Scroll progress for entrance scrubs, shared by SweepReveal and ScrubReveal.
// Fully reversible: scrolling back up runs the animation backwards — the scroll
// position IS the timeline. The spring smooths raw wheel steps into a glide;
// a deep-link's first measurement (0 → 1) springs the reveal in on load.
export function useScrubProgress(
	target: RefObject<HTMLElement | null>,
	offset: NonNullable<Parameters<typeof useScroll>[0]>["offset"],
): MotionValue<number> {
	const { scrollYProgress } = useScroll({ target, offset });
	return useSpring(scrollYProgress, { damping: 40, stiffness: 220, restDelta: 0.0005 });
}
