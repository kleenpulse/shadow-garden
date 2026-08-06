"use client";

import Link from "next/link";
import type { Tier } from "@/lib/registry/types";
import { cn } from "@/lib/utils";
import { displayName } from "@/lib/display-name";
import GlowCard from "./GlowCard";
import TierBadge from "./TierBadge";
import NewBadge from "./NewBadge";
import FavoriteButton from "./FavoriteButton";

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
	return (
		// focus-within keeps an accent affordance for keyboard users — the glow
		// only tracks the pointer.
		<GlowCard
			as="article"
			className="flex flex-col gap-2 rounded-lg border border-hairline bg-panel p-4 transition-colors focus-within:border-accent-muted"
		>
			{/* Overlay link keeps the whole card clickable; the heart sits
			    above it as the only pointer-interactive child. */}
			<Link
				href={`/components/${slug}`}
				aria-label={`Open ${name}`}
				className="absolute inset-0 z-0 rounded-lg"
			/>
			<div className="pointer-events-none relative z-10 flex items-center justify-between gap-2">
				{/* A heading, not a span: this is the card's title, and the catalog's
				    outline should read as the list of components it actually is. */}
				<h3
					className={cn(
						"font-display text-sm uppercase tracking-[0.08em] line-clamp-1 truncate",
						slug === "grainient"
							? "text-grainient"
							: "text-ink group-hover:text-accent",
					)}
				>
					{displayName(name)}
				</h3>
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
		</GlowCard>
	);
}
