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
import { heroTemplates } from "./categories/hero-templates";
import { landingPages } from "./categories/landing-pages";
// Relative import on purpose — this file runs under plain `bun` (check scripts,
// gen-readme, gen-catalog), where the alias still resolves but the habit of
// framework-free edges keeps it obviously safe there.
import { IS_LOCAL_DEV } from "../env";

// The registry. Sidebar nav, catalog, routes, and generateStaticParams all derive
// from this array. Adding a component = one entry in the matching
// lib/registry/categories/<category>.ts file + one canonical source file
// + one preview module registered in components/registry/previews.ts.
//
// Landing Pages is TEMPORARILY hidden from production builds (pre-launch): the
// conditional spread is the single seam every consumer inherits — sitemap,
// counts, palette, generateStaticParams, collections. Checks run under plain
// bun with NODE_ENV unset, so check:registry keeps validating all 163 entries;
// `next build` sets production and ships 154. Delete the ternary to launch.
export const registry: ComponentEntry[] = [
	...backgrounds,
	...textAnimations,
	...microInteractions,
	...powerUserSystems,
	...heroTemplates,
	...(IS_LOCAL_DEV ? landingPages : []),
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

export interface Neighbors {
	prev: ComponentEntry;
	next: ComponentEntry;
	/** 1-based position in catalog order. */
	index: number;
	total: number;
}

/**
 * Catalog neighbours of a slug, in the order the sidebar lists them (grouped
 * by CATEGORY_ORDER, registry order within a group) — not raw array order, so
 * prev/next in the fullscreen stage walk the same path the eye does. Wraps at
 * both ends: the catalog is a ring, the last entry's next is the first.
 */
export function getNeighbors(slug: string): Neighbors | undefined {
	const ordered = groupByCategory().flatMap((group) => group.entries);
	const i = ordered.findIndex((entry) => entry.slug === slug);
	if (i === -1) return undefined;
	const total = ordered.length;
	return {
		prev: ordered[(i - 1 + total) % total],
		next: ordered[(i + 1) % total],
		index: i + 1,
		total,
	};
}
