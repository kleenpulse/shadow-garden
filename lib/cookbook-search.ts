// Matching layer behind the /cookbook filter. Framework-free on purpose — no
// React, no nuqs — same discipline as lib/cookbook.ts, so this stays testable
// and cheap to reason about outside a render.
//
// The problem it solves: the glossary exists so someone who *can't* name a thing
// can find its name. They type an approximation — "rubber band", "fadein",
// "squash and stretch" — and a naive `includes()` returns nothing, because the
// term is spelled "Rubber-banding". Separators are exactly where an
// approximation and the canonical spelling diverge.

import { fuzzyMatch } from "./fuzzy";
import { termAnchor } from "./cookbook";

// ---------------------------------------------------------------------------
// Input shapes
//
// Declared structurally rather than importing CookbookBrowser's props: a lib
// module must not depend on a client component, and these rows are already the
// serialized subset that crosses the server/client boundary.
// ---------------------------------------------------------------------------

export interface SearchComponentInput {
	slug: string;
	name: string;
}

export interface SearchTermInput {
	term: string;
	description: string;
	components: readonly SearchComponentInput[];
}

export interface SearchSectionInput {
	title: string;
	terms: readonly SearchTermInput[];
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/** Half-open `[start, end)` range over the *original* string. */
export type Range = readonly [number, number];

interface Normalized {
	raw: string;
	/** Lowercased, diacritics folded, separators collapsed to single spaces. */
	norm: string;
	/** `map[i]` = index into `raw` that produced `norm[i]`. */
	map: number[];
}

/**
 * Fold one source character to its searchable form.
 *
 * NFD-then-strip-marks so "Bézier" answers to "bezier". Done per character
 * rather than on the whole string because NFD changes length, and the index map
 * has to keep pointing at original offsets for highlighting to line up.
 *
 * `&` becomes "and", not a space: "Squash & stretch" is a term people type as
 * "squash and stretch", and mapping three characters back to one source index
 * is exactly what the map is for.
 */
// Combining diacritical marks — what NFD splits an accented letter into. Built
// from an escaped string rather than a literal regex so the source stays plain
// ASCII; a literal class of invisible combining characters is unreadable and
// survives exactly one careless editor save.
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

function fold(ch: string): string {
	if (ch === "&") return "and";
	return ch.toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "");
}

const ALNUM = /[a-z0-9]/;

function normalize(raw: string): Normalized {
	let norm = "";
	const map: number[] = [];

	for (let i = 0; i < raw.length; i++) {
		const folded = fold(raw[i]);
		for (const ch of folded) {
			if (ALNUM.test(ch)) {
				norm += ch;
				map.push(i);
			} else if (norm.length > 0 && norm[norm.length - 1] !== " ") {
				// Any run of punctuation/whitespace collapses to one boundary space,
				// so "Fade in / Fade out" and "fade in fade out" are the same string.
				norm += " ";
				map.push(i);
			}
		}
	}

	// Trailing boundary from a term that ends in punctuation, e.g. "Alternate (yoyo)".
	if (norm.endsWith(" ")) {
		norm = norm.slice(0, -1);
		map.pop();
	}
	return { raw, norm, map };
}

/** Normalize a query. Only the string is needed — queries are never highlighted. */
function normalizeQuery(query: string): string {
	return normalize(query).norm;
}

// ---------------------------------------------------------------------------
// Highlight ranges
// ---------------------------------------------------------------------------

/**
 * Turn matched norm-space positions into ranges over the original string.
 *
 * Two positions that are adjacent in norm space can straddle a separator in the
 * source ("rubber band" spans the hyphen in "Rubber-banding"). Bridging a gap
 * made only of non-alphanumerics keeps the highlight one solid run instead of
 * two fragments with a stranded hyphen between them.
 */
function toRanges(n: Normalized, positions: number[]): Range[] {
	if (positions.length === 0) return [];

	const src: number[] = [];
	let last = -1;
	for (const p of positions) {
		const i = n.map[p];
		if (i === undefined || i === last) continue;
		src.push(i);
		last = i;
	}
	if (src.length === 0) return [];

	const ranges: [number, number][] = [[src[0], src[0] + 1]];
	for (let k = 1; k < src.length; k++) {
		const i = src[k];
		const tail = ranges[ranges.length - 1];
		const bridgeable =
			i > tail[1] &&
			n.raw.slice(tail[1], i).split("").every((c) => !ALNUM.test(fold(c)));
		if (i <= tail[1] || bridgeable) tail[1] = i + 1;
		else ranges.push([i, i + 1]);
	}
	return ranges;
}

// ---------------------------------------------------------------------------
// Tiered matching
// ---------------------------------------------------------------------------

// Bands are 1000 apart so no in-tier bonus or penalty can ever promote a weaker
// kind of match above a stronger one. A fuzzy hit must never outrank a substring.
const TIER_EXACT = 5000;
const TIER_PREFIX = 4000;
const TIER_WORD = 3000;
const TIER_SUBSTR = 2000;
const TIER_FUZZY = 1000;

interface Hit {
	score: number;
	ranges: Range[];
}

/**
 * `allowFuzzy` is off for section titles and component names on purpose.
 *
 * A subsequence match over a long title is close to unfalsifiable — "fadein"
 * reads out of "Feedback & Interaction", and since a matching section drags all
 * of its terms into the card list, one loose hit dumps nine unrelated cards on
 * screen. Terms are what the page is for and earn the benefit of the doubt;
 * sections and components are navigation, and navigation has to be literal.
 */
function match(
	qn: string,
	qTight: string,
	n: Normalized,
	weight: number,
	allowFuzzy: boolean,
): Hit | null {
	let tier: number;
	let at: number;
	let positions: number[];
	let bonus = 0;

	if (n.norm === qn) {
		tier = TIER_EXACT;
		at = 0;
		positions = Array.from({ length: n.norm.length }, (_, i) => i);
	} else {
		at = n.norm.indexOf(qn);
		if (at === 0) tier = TIER_PREFIX;
		else if (at > 0) tier = n.norm[at - 1] === " " ? TIER_WORD : TIER_SUBSTR;
		else tier = TIER_FUZZY;

		if (tier === TIER_FUZZY) {
			if (!allowFuzzy) return null;
			// Separators stripped from the query so "easeinout" reaches "ease in out".
			const fz = fuzzyMatch(qTight, n.norm);
			if (!fz) return null;
			at = fz.indices[0] ?? 0;
			positions = fz.indices;
			bonus = Math.min(fz.score, 300);
		} else {
			positions = Array.from({ length: qn.length }, (_, i) => at + i);
		}
	}

	const score =
		tier +
		weight +
		bonus -
		Math.min(at, 50) * 2 -
		Math.min(n.norm.length, 60) * 0.5;

	return { score, ranges: toRanges(n, positions) };
}

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

interface TermRow {
	term: string;
	anchor: string;
	sectionTitle: string;
	sectionAnchor: string;
	demos: number;
	n: Normalized;
	/** Normalized description — substring-matched only; fuzzy over prose is noise. */
	descNorm: string;
}

interface ComponentRow {
	slug: string;
	name: string;
	/** Terms this component demonstrates, in document order. */
	terms: string[];
	anchor: string;
	sectionAnchor: string;
	n: Normalized;
}

interface SectionRow {
	title: string;
	anchor: string;
	terms: string[];
	n: Normalized;
}

export interface SearchIndex {
	terms: TermRow[];
	components: ComponentRow[];
	sections: SectionRow[];
}

/**
 * Normalize every candidate once, at mount. The per-keystroke cost is then a
 * handful of `indexOf` calls over ~140 short strings — well under a frame, which
 * is why there is no debounce anywhere in this feature.
 */
export function buildSearchIndex(
	sections: readonly SearchSectionInput[],
): SearchIndex {
	const terms: TermRow[] = [];
	const sectionRows: SectionRow[] = [];
	const bySlug = new Map<string, ComponentRow>();

	for (const section of sections) {
		const sectionAnchor = termAnchor(section.title);
		sectionRows.push({
			title: section.title,
			anchor: sectionAnchor,
			terms: section.terms.map((t) => t.term),
			n: normalize(section.title),
		});

		for (const t of section.terms) {
			const anchor = termAnchor(t.term);
			terms.push({
				term: t.term,
				anchor,
				sectionTitle: section.title,
				sectionAnchor,
				demos: t.components.length,
				n: normalize(t.term),
				descNorm: normalize(t.description).norm,
			});

			for (const c of t.components) {
				const existing = bySlug.get(c.slug);
				if (existing) {
					existing.terms.push(t.term);
					continue;
				}
				bySlug.set(c.slug, {
					slug: c.slug,
					name: c.name,
					terms: [t.term],
					// A component demos several terms; the first in document order is
					// the one a jump lands on.
					anchor,
					sectionAnchor,
					n: normalize(c.name),
				});
			}
		}
	}

	return { terms, components: [...bySlug.values()], sections: sectionRows };
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export type Suggestion =
	| {
			kind: "term";
			label: string;
			anchor: string;
			sectionAnchor: string;
			sectionTitle: string;
			demos: number;
			ranges: Range[];
	  }
	| {
			kind: "component";
			label: string;
			slug: string;
			anchor: string;
			sectionAnchor: string;
			demos: number;
			ranges: Range[];
	  }
	| {
			kind: "section";
			label: string;
			anchor: string;
			sectionAnchor: string;
			count: number;
			ranges: Range[];
	  };

export interface SearchResult {
	suggestions: Suggestion[];
	/**
	 * Term keys the card list should show. `null` means "no query" — show
	 * everything, which is not the same as an empty set (show nothing).
	 */
	matchedTerms: ReadonlySet<string> | null;
}

const EMPTY: SearchResult = { suggestions: [], matchedTerms: null };

// A term outranks a component name outranks a section title at equal tier.
const WEIGHT_TERM = 300;
const WEIGHT_COMPONENT = 150;
const WEIGHT_SECTION = 0;

// Per-kind caps, then a global cap. Allocated in this order so components and
// sections can never crowd terms out of a short list.
const MAX_TERMS = 6;
const MAX_COMPONENTS = 3;
const MAX_SECTIONS = 2;
const MAX_TOTAL = 8;

/**
 * One pass, two consumers: the suggestion popup and the card-list filter.
 *
 * They must agree — a suggestion the list then refuses to show would be a lie.
 * Computing both here is what guarantees it.
 */
export function searchCookbook(
	index: SearchIndex,
	query: string,
): SearchResult {
	const qn = normalizeQuery(query);
	if (!qn) return EMPTY;
	const qTight = qn.replace(/ /g, "");

	const matchedTerms = new Set<string>();

	const termHits: { row: TermRow; hit: Hit }[] = [];
	for (const row of index.terms) {
		const hit = match(qn, qTight, row.n, WEIGHT_TERM, true);
		if (hit) {
			termHits.push({ row, hit });
			matchedTerms.add(row.term);
		} else if (row.descNorm.includes(qn)) {
			// Descriptions widen the net for the card list but never earn a
			// suggestion row — matching prose produces suggestions nobody typed.
			matchedTerms.add(row.term);
		}
	}

	const componentHits: { row: ComponentRow; hit: Hit }[] = [];
	for (const row of index.components) {
		const hit = match(qn, qTight, row.n, WEIGHT_COMPONENT, false);
		if (!hit) continue;
		componentHits.push({ row, hit });
		for (const t of row.terms) matchedTerms.add(t);
	}

	const sectionHits: { row: SectionRow; hit: Hit }[] = [];
	for (const row of index.sections) {
		const hit = match(qn, qTight, row.n, WEIGHT_SECTION, false);
		if (!hit) continue;
		sectionHits.push({ row, hit });
		for (const t of row.terms) matchedTerms.add(t);
	}

	const byScore = <T extends { hit: Hit }>(a: T, b: T) => b.hit.score - a.hit.score;
	termHits.sort(byScore);
	componentHits.sort(byScore);
	sectionHits.sort(byScore);

	const groups: Suggestion[][] = [
		termHits.slice(0, MAX_TERMS).map(
			({ row, hit }): Suggestion => ({
				kind: "term",
				label: row.term,
				anchor: row.anchor,
				sectionAnchor: row.sectionAnchor,
				sectionTitle: row.sectionTitle,
				demos: row.demos,
				ranges: hit.ranges,
			}),
		),
		componentHits.slice(0, MAX_COMPONENTS).map(
			({ row, hit }): Suggestion => ({
				kind: "component",
				label: row.name,
				slug: row.slug,
				anchor: row.anchor,
				sectionAnchor: row.sectionAnchor,
				demos: row.terms.length,
				ranges: hit.ranges,
			}),
		),
		sectionHits.slice(0, MAX_SECTIONS).map(
			({ row, hit }): Suggestion => ({
				kind: "section",
				label: row.title,
				anchor: row.anchor,
				sectionAnchor: row.anchor,
				count: row.terms.length,
				ranges: hit.ranges,
			}),
		),
	];

	// Rows stay grouped, but the groups themselves are ordered by their best hit.
	// Terms lead in the ordinary case (they carry the heaviest weight); a query
	// like "star" that *prefix*-matches the component Starfield and only
	// fuzzy-matches the term Stagger puts Components on top, where it belongs.
	// Fixed group order would bury the obvious answer under a weak one.
	const best = (group: Suggestion[], i: number) =>
		group.length === 0
			? -Infinity
			: [termHits, componentHits, sectionHits][i][0].hit.score;

	return {
		suggestions: groups
			.map((group, i) => ({ group, top: best(group, i) }))
			.filter((g) => g.group.length > 0)
			.sort((a, b) => b.top - a.top)
			.flatMap((g) => g.group)
			.slice(0, MAX_TOTAL),
		matchedTerms,
	};
}
