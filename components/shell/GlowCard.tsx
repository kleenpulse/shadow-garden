"use client";

import type { HTMLAttributes } from "react";
import { useBorderGlow } from "@/components/registry/border-glow/BorderGlow";
import { cn } from "@/lib/utils";

// Amethyst glow tuned down for chrome duty: a shell card is furniture, not a
// demo, so the intro sweep stays off and the proximity glow runs quieter than
// the registry defaults.
export const SHELL_GLOW = {
	glowColor: "271 91 65", // #a855f7 as the "H S L" triplet BorderGlow expects
	colors: ["#a855f7", "#6d28d9", "#22d3ee"],
	glowRadius: 10,
	glowIntensity: 0.6,
	fillOpacity: 0.25,
};

type GlowOptions = Parameters<typeof useBorderGlow>[0];

interface GlowCardProps extends HTMLAttributes<HTMLElement> {
	/** Semantic tag for the card root — all three render identically. */
	as?: "div" | "article" | "li";
	/**
	 * Overrides on top of {@link SHELL_GLOW}. The one a translucent card always
	 * has to set is `backgroundColor`: it is what the border overlay fills its
	 * padding box with to punch the mesh gradient back out of the interior, so an
	 * opaque default floods a glass card solid wherever the cone lands.
	 */
	glow?: GlowOptions;
}

export default function GlowCard({
	as = "div",
	glow,
	className,
	children,
	...rest
}: GlowCardProps) {
	const { cardRef, rootHandlers, overlays } = useBorderGlow({
		backgroundColor: "var(--color-panel)",
		...SHELL_GLOW,
		...glow,
	});

	// Every tag in the union takes the same attributes and the same ref; naming
	// one of them spares JSX from resolving a union of intrinsic elements.
	const Tag = as as "div";

	return (
		<Tag
			ref={cardRef}
			{...rootHandlers}
			{...rest}
			// `isolate` is load-bearing: the overlays sit at -z-1/z-1 and would
			// otherwise escape into the page's stacking context.
			className={cn("group relative isolate", className)}
		>
			{overlays}
			{children}
		</Tag>
	);
}
