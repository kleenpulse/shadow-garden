import Link from "next/link";
import { registry } from "@/lib/registry";
import type { ComponentEntry } from "@/lib/registry/types";
import { displayName } from "@/lib/display-name";
import TierBadge from "./TierBadge";

// The sidebar links all 70 components from all 70 pages, so every page carries
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

export default function RelatedComponents({ entry }: { entry: ComponentEntry }) {
	const related = relatedTo(entry);
	if (related.length === 0) return null;

	return (
		<section className="space-y-3">
			<h2 className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute">
				Related Components
			</h2>
			<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{related.map((item) => (
					<li key={item.slug}>
						<Link
							href={`/components/${item.slug}`}
							className="flex h-full flex-col gap-2 rounded-lg border border-hairline bg-panel p-4 transition-colors hover:border-accent-muted"
						>
							<div className="flex items-center justify-between gap-2">
								<h3 className="font-display text-sm uppercase tracking-[0.08em] text-ink">
									{displayName(item.name)}
								</h3>
								<TierBadge tier={item.tier} />
							</div>
							<p className="font-sans text-xs leading-relaxed text-ink-dim">
								{item.description}
							</p>
						</Link>
					</li>
				))}
			</ul>
		</section>
	);
}
