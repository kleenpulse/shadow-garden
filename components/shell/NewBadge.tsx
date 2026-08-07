"use client";

import { useEffect, useState } from "react";
import { isWithinNewWindow } from "@/lib/registry/freshness";

// Freshness is wall-clock-dependent, so it can't be resolved in the static
// (prerendered) shell without freezing to build time or tripping Cache
// Components. This client leaf renders null through SSR + first paint, then
// reveals after mount — no hydration mismatch, and it drops into server
// components (the workspace header) as cleanly as client ones.
//
// - "pill": black/white chip carrying the Grainient gradient in the glyphs — the
//           loudest of Free (outline) / Pro (tint) / New, and the only badge that
//           reads as a punch-out. Used on catalog cards and the workspace header.
// - "tiny":  a tiny corner marker for tight rows (the sidebar). Anchored absolute
//           to the top-left of a `relative` parent so it consumes no layout
//           width — the row's name column stays put.
export default function NewBadge({
	addedAt,
	variant = "pill",
}: {
	addedAt?: string;
	variant?: "pill" | "tiny";
}) {
	const [isNew, setIsNew] = useState(false);

	useEffect(() => {
		setIsNew(isWithinNewWindow(addedAt, Date.now()));
	}, [addedAt]);

	if (!isNew) return null;

	if (variant === "tiny") {
		return (
			<span
				role="img"
				aria-label="New"
				className="pointer-events-none absolute -left-1 -top-1 text-[6px] rounded-xl bg-accent text-white px-0.5 py-px"
			>
				New
			</span>
		);
	}

	// Two spans, not one: `.text-grainient` sets the `background` shorthand to
	// clip the gradient into the glyphs, so it would overwrite the chip's own
	// fill if both lived on the same element. Outer paints, inner clips.
	// Geometry mirrors TierBadge so the badge row stays on one rhythm.
	return (
		<span className="inline-flex min-w-11 items-center justify-center rounded border border-hairline bg-white px-1 py-px font-display text-[10px]  uppercase sm:tracking-[0.15em] sm:text-xs dark:bg-black">
			{/* The chip's ground flips with the theme, so the ramp does too — the
			    stock mid stop is 2.9:1 on the dark chip. */}
			<span className="text-grainient text-grainient-on-dark">New</span>
		</span>
	);
}
