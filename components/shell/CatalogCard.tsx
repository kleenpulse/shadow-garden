"use client";

import Link from "next/link";
import { useBorderGlow } from "@/components/registry/border-glow/BorderGlow";
import type { Tier } from "@/lib/registry/types";
import { cn } from "@/lib/utils";
import { displayName } from "@/lib/display-name";
import TierBadge from "./TierBadge";
import NewBadge from "./NewBadge";
import FavoriteButton from "./FavoriteButton";

// Amethyst glow tuned down for chrome duty: the catalog card is shell, not a
// demo, so the intro sweep stays off and the proximity glow runs quieter than
// the registry defaults.
const GLOW = {
	glowColor: "271 91 65", // #a855f7 as the "H S L" triplet BorderGlow expects
	backgroundColor: "var(--color-panel)",
	colors: ["#a855f7", "#6d28d9", "#22d3ee"],
	glowRadius: 10,
	glowIntensity: 0.6,
	fillOpacity: 0.25,
};

export default function CatalogCard({
	slug,
	name,
	description,
	tier,
	addedAt,
}: {
	slug: string;
	name: string;
	description: string;
	tier: Tier;
	addedAt?: string;
}) {
	const { cardRef, rootHandlers, overlays } = useBorderGlow(GLOW);

	return (
		// focus-within keeps an accent affordance for keyboard users — the glow
		// only tracks the pointer.
		<article
			ref={cardRef}
			{...rootHandlers}
			className="group relative isolate flex flex-col gap-2 rounded-lg border border-hairline bg-panel p-4 transition-colors focus-within:border-accent-muted"
		>
			{overlays}
			{/* Overlay link keeps the whole card clickable; the heart sits
			    above it as the only pointer-interactive child. */}
			<Link
				href={`/components/${slug}`}
				aria-label={`Open ${name}`}
				className="absolute inset-0 z-0 rounded-lg"
			/>
			<div className="pointer-events-none relative z-10 flex items-center justify-between gap-2">
				<span
					className={cn(
						"font-display text-sm uppercase tracking-[0.08em] line-clamp-1 truncate",
						slug === "grainient"
							? "text-grainient"
							: "text-ink group-hover:text-accent",
					)}
				>
					{displayName(name)}
				</span>
				<div className="flex items-center gap-1.5">
					<FavoriteButton
						slug={slug}
						name={name}
						iconSize={15}
						className="pointer-events-auto opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
					/>
					<NewBadge addedAt={addedAt} />
					<TierBadge tier={tier} />
				</div>
			</div>
			<p className="pointer-events-none relative z-10 font-sans text-xs leading-relaxed text-ink-dim line-clamp-3">
				{description}
			</p>
		</article>
	);
}
