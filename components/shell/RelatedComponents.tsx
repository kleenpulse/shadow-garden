import { registry } from "@/lib/registry";
import type { ComponentEntry } from "@/lib/registry/types";
import RelatedComponentsList from "./RelatedComponentsList";

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

	// Only plain rows cross into the client leaf — the scored entries above
	// carry prop schemas the list has no use for.
	return (
		<RelatedComponentsList
			items={related.map(({ slug, name, description }) => ({
				slug,
				name,
				description,
			}))}
		/>
	);
}
