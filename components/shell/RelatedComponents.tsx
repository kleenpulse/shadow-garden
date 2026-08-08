import Link from "next/link";
import { registry } from "@/lib/registry";
import type { ComponentEntry } from "@/lib/registry/types";
import { displayName } from "@/lib/display-name";
import GlowCard from "./GlowCard";

// The sidebar links every component from every page, so every page carries
// identical weight and nothing tells a crawler which pages are topically close to
// which. This does: same category first, then anything sharing a cookbook term.
// Server-rendered, so the links are in the static shell rather than behind
// hydration.

const LIMIT = 6;

function score(entry: ComponentEntry, current: ComponentEntry): number {
	if (entry.slug === current.slug) return -1;
	const shared = (entry.cookbook ?? []).filter((term) =>
		(current.cookbook ?? []).includes(term),
	).length;
	// Same category is the stronger signal; shared terms break ties within it and
	// surface cross-category neighbours when a category runs thin.
	return (entry.category === current.category ? 100 : 0) + shared;
}

export function relatedTo(current: ComponentEntry): ComponentEntry[] {
	return registry
		.map((entry) => ({ entry, value: score(entry, current) }))
		.filter((row) => row.value > 0)
		.sort((a, b) => b.value - a.value)
		.slice(0, LIMIT)
		.map((row) => row.entry);
}

export default function RelatedComponents({
	entry,
}: {
	entry: ComponentEntry;
}) {
	const related = relatedTo(entry);
	if (related.length === 0) return null;

	return (
		<section className="space-y-3">
			<h2 className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute">
				Related Components
			</h2>
			<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{related.map((item) => (
					// The glow rides the `li`, not the link — the link has to keep
					// wrapping the name, which is the anchor text this whole section
					// exists to hand a crawler. `z-10` floats it over the overlays.
					<GlowCard
						as="li"
						key={item.slug}
						className="rounded-lg border border-hairline bg-panel transition-colors  "
					>
						<Link
							href={`/components/${item.slug}`}
							className="relative z-10 flex h-full flex-col gap-2 rounded-lg p-4"
						>
							<h3 className="font-display text-sm uppercase tracking-[0.08em] text-ink group-hover:text-accent">
								{displayName(item.name)}
							</h3>
							<p className="font-sans text-xs leading-relaxed text-ink-dim">
								{item.description}
							</p>
						</Link>
					</GlowCard>
				))}
			</ul>
		</section>
	);
}
