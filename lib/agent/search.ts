// Catalog search for the agent's search_components action. Pure, relative
// imports only (runs under plain bun in scripts/agent/check-agent.ts).
//
// The sidebar's fuzzy subsequence scorer suits a few typed letters, but an agent
// sends whole phrases ("springy tab pill"), and a subsequence over a long
// description matches almost any phrase. So this scores per word: a word in the
// name counts most, then cookbook terms, category and description. The sidebar
// scorer still ranks the whole query against the name, so a near-exact name wins.

import { fuzzyScore } from "../fuzzy";
import type { Category, ComponentEntry } from "../registry/types";

export interface SearchHit {
	slug: string;
	name: string;
	category: Category;
	kind: "component" | "template";
	summary: string;
	controls: number;
}

const STOP = new Set(["a", "an", "the", "and", "or", "with", "for", "of", "to", "in", "on", "that", "me", "i", "want", "need", "some", "like", "component", "components", "effect"]);

function words(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word.length > 1 && !STOP.has(word));
}

/** Loose stem so "buttons" finds "button" and "animated" finds "animation". */
function stem(word: string): string {
	return word.replace(/(ations?|ing|ed|es|s)$/, "") || word;
}

function hasWord(haystack: string[], word: string): boolean {
	const root = stem(word);
	return haystack.some((candidate) => candidate === word || stem(candidate) === root || (root.length >= 4 && candidate.startsWith(root)));
}

/** First sentence, or the first two when the first is a short hook. */
export function summarize(text: string): string {
	const [first, second] = text.split(/(?<=\.)\s/, 2);
	return first.length < 60 && second ? `${first} ${second}` : first;
}

export function scoreEntry(entry: ComponentEntry, query: string): number {
	const name = words(entry.name.replace(/([a-z])([A-Z])/g, "$1 $2"));
	const slug = words(entry.slug);
	const cookbook = (entry.cookbook ?? []).flatMap(words);
	const category = words(entry.category);
	const description = words(entry.description);
	let score = 0;
	for (const word of words(query)) {
		if (hasWord(name, word) || hasWord(slug, word)) score += 6;
		if (hasWord(cookbook, word)) score += 3;
		if (hasWord(category, word)) score += 2;
		if (hasWord(description, word)) score += 1;
	}
	if (score === 0) return 0;
	return score + fuzzyScore(query, entry.name) * 0.1;
}

export function searchEntries(
	entries: ComponentEntry[],
	query: string,
	options: { category?: Category; limit?: number } = {},
): SearchHit[] {
	const limit = Math.min(Math.max(options.limit ?? 6, 1), 12);
	const pool = options.category
		? entries.filter((entry) => entry.category === options.category)
		: entries;
	return pool
		.map((entry, index) => ({ entry, index, score: scoreEntry(entry, query) }))
		.filter((hit) => hit.score > 0)
		.sort((a, b) => b.score - a.score || a.index - b.index)
		.slice(0, limit)
		.map(({ entry }) => ({
			slug: entry.slug,
			name: entry.name,
			category: entry.category,
			kind: entry.kind ?? "component",
			summary: summarize(entry.description),
			controls: entry.props.length,
		}));
}
