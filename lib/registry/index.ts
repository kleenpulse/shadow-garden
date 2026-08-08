import {
	CATEGORY_ORDER,
	type Category,
	type ComponentEntry,
	type PropSchema,
	type TunedValues,
} from "./types";
import { backgrounds } from "./categories/backgrounds";
import { textAnimations } from "./categories/text-animations";
import { microInteractions } from "./categories/micro-interactions";
import { powerUserSystems } from "./categories/power-user-systems";

// The registry. Sidebar nav, catalog, routes, and generateStaticParams all derive
// from this array. Adding a component = one entry in the matching
// lib/registry/categories/<category>.ts file + one canonical source file
// + one preview module registered in components/registry/previews.ts.
export const registry: ComponentEntry[] = [
	...backgrounds,
	...textAnimations,
	...microInteractions,
	...powerUserSystems,
];

export function getEntry(slug: string): ComponentEntry | undefined {
	return registry.find((entry) => entry.slug === slug);
}

export function getAllSlugs(): string[] {
	return registry.map((entry) => entry.slug);
}

export interface CategoryGroup {
	category: Category;
	entries: ComponentEntry[];
}

/** Registry grouped by category in fixed order; empty categories are omitted. */
export function groupByCategory(
	entries: ComponentEntry[] = registry,
): CategoryGroup[] {
	return CATEGORY_ORDER.map((category) => ({
		category,
		entries: entries.filter((entry) => entry.category === category),
	})).filter((group) => group.entries.length > 0);
}

/**
 * Invert the per-entry `cookbook` declarations into term → components.
 * Entries stay in registry order under each term, so the glossary lists them the
 * same way the catalog does. Terms nothing demonstrates are simply absent.
 */
export function componentsByTerm(
	entries: ComponentEntry[] = registry,
): Map<string, ComponentEntry[]> {
	const out = new Map<string, ComponentEntry[]>();
	for (const entry of entries) {
		for (const term of entry.cookbook ?? []) {
			const bucket = out.get(term);
			if (bucket) bucket.push(entry);
			else out.set(term, [entry]);
		}
	}
	return out;
}

/** Build the default tuned-values object from a prop schema. */
export function defaultsFromSchema(props: PropSchema[]): TunedValues {
	const out: TunedValues = {};
	for (const prop of props) out[prop.name] = prop.default;
	return out;
}
