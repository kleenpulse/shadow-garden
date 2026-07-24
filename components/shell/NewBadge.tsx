"use client";

import { useEffect, useState } from "react";
import { isWithinNewWindow } from "@/lib/registry/freshness";

// Freshness is wall-clock-dependent, so it can't be resolved in the static
// (prerendered) shell without freezing to build time or tripping Cache
// Components. This client leaf renders null through SSR + first paint, then
// reveals after mount — no hydration mismatch, and it drops into server
// components (the workspace header) as cleanly as client ones.
//
// - "pill": solid amethyst label — the loudest of Free (outline) / Pro (tint)
//           / New. Used on catalog cards and the workspace header.
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

	return (
		<span className="inline-flex min-w-11 items-center justify-center rounded bg-accent px-1.5 py-0.5 font-display text-[9px] uppercase tracking-[0.12em] text-on-accent">
			New
		</span>
	);
}
