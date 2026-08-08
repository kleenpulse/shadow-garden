import type { Category, ComponentEntry } from "@/lib/registry/types";
import { displayName } from "@/lib/display-name";
import type { Collection } from "@/lib/collections";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

/**
 * The site-wide OG card, named explicitly.
 *
 * Next attaches app/opengraph-image.tsx to the ROOT LAYOUT's `openGraph`, and
 * metadata merges shallowly — so a page that declares its own `openGraph` block
 * replaces that object wholesale and ships with no social image at all. Same
 * mechanism as the canonical trap in app/layout.tsx, opposite direction: there
 * the inherited value is too broad, here it silently vanishes. Every route
 * without an opengraph-image file of its own has to spread this in.
 */
export const SITE_OG_IMAGE = {
	url: "/opengraph-image",
	width: 1200,
	height: 630,
	alt: `${SITE_NAME} — ${SITE_TAGLINE}`,
};

// Shell-only, same reasoning as lib/display-name.ts: this is how Shadow Garden
// describes itself to a crawler, not something a buyer pastes into their project.
// Never import it from components/registry/.
//
// Everything here is DERIVED from the registry entry. Titles, descriptions and OG
// copy for every component is generated from fields that already exist, so a new
// component gets correct search metadata the moment its entry lands — there is no
// second place to remember to update, and nothing to drift.

/** What a visitor would call this category in a search box. */
const CATEGORY_NOUN: Record<Category, string> = {
	Backgrounds: "Background",
	"Text Animations": "Text Animation",
	"Micro-interactions": "Micro-interaction",
	"Power-User Systems": "Component",
};

export function entryPath(entry: ComponentEntry): string {
	return `/components/${entry.slug}`;
}

/**
 * Leads with the component, qualifies it with the thing people search for. The
 * root layout appends " — Shadow Garden", so this stays short enough that the
 * whole title survives a SERP: "Waves — React Background — Shadow Garden".
 */
export function entryTitle(entry: ComponentEntry): string {
	return `${displayName(entry.name)} — React ${CATEGORY_NOUN[entry.category]}`;
}

/**
 * The entry's own sentence, plus the three facts that decide whether a developer
 * clicks: it's live, it's tunable, and the source is there.
 */
export function entryDescription(entry: ComponentEntry): string {
	const props = entry.props.length;
	const tail =
		props > 0
			? `Live preview, ${props} tunable props, source you can copy.`
			: "Live preview and source you can copy.";
	return `${entry.description} ${tail}`;
}

/**
 * The intro's opening sentence plus the count, which is the fact that decides
 * whether a SERP result is worth the click on a collection query. Derived rather
 * than authored so the number can never disagree with the page under it.
 */
export function collectionDescription(
	collection: Collection,
	entries: ComponentEntry[],
): string {
	const [opening] = collection.intro.split(/(?<=\.)\s/, 1);
	return `${opening} ${entries.length} live, tunable components, all free.`;
}
