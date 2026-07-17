"use client";

import { ReactLenis } from "lenis/react";
import { useReducedMotion } from "motion/react";
import "lenis/dist/lenis.css";

// Landing-only smooth scroll. ReactLenis root renders no DOM (provider only),
// so the reduced-motion branch can't cause a hydration mismatch: SSR and first
// client render both take the !reduce path, and lenis tears down on the effect
// tick before any scroll if the preference flips true. Lenis core ignores
// prefers-reduced-motion entirely, so this gate is the only one.
export default function SmoothScroll() {
	const reduce = useReducedMotion();
	if (reduce) return null;
	// Anchors handled explicitly (SmoothAnchor, GotoTop) — anchors: true here
	// would double-fire on the same links with lenis's default easing winning.
	return <ReactLenis root />;
}
