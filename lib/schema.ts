import { registry } from "@/lib/registry";
import { commerceArmed } from "@/lib/capabilities";
import type { ComponentEntry } from "@/lib/registry/types";
import { COOKBOOK, termAnchor } from "@/lib/cookbook";
import { displayName } from "@/lib/display-name";
import { collectionPath, type Collection } from "@/lib/collections";
import {
	collectionDescription,
	entryDescription,
	entryPath,
	entryTitle,
} from "@/lib/seo";
import { SITE_DESCRIPTION, SITE_NAME, SITE_REPO, SITE_URL, absoluteUrl } from "@/lib/site";

// Every JSON-LD graph the site emits. Shell-only — never import from
// components/registry/.
//
// Stable @ids so the graphs join up instead of describing four unrelated things:
// the publisher on a component page is the same node as the site's publisher.

const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;
const GLOSSARY_ID = `${SITE_URL}/cookbook#glossary`;

const organization = {
	"@type": "Organization",
	"@id": ORG_ID,
	name: SITE_NAME,
	url: SITE_URL,
	logo: absoluteUrl("/icon.png"),
	sameAs: [SITE_REPO],
} as const;

/** Root layout: who the site is, on every page. */
export function siteSchema() {
	return {
		"@context": "https://schema.org",
		"@graph": [
			organization,
			{
				"@type": "WebSite",
				"@id": SITE_ID,
				name: SITE_NAME,
				url: SITE_URL,
				description: SITE_DESCRIPTION,
				publisher: { "@id": ORG_ID },
				inLanguage: "en-US",
			},
		],
	};
}

/** Homepage: the product itself. Browsing is free; on an armed deployment the
    Pro tier sells, so the offer widens to the real price range. `commerceArmed`
    reads build-time env → the schema stays a static build constant. */
export function productSchema() {
	return {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		"@id": `${SITE_URL}/#product`,
		name: SITE_NAME,
		url: SITE_URL,
		description: SITE_DESCRIPTION,
		applicationCategory: "DeveloperApplication",
		applicationSubCategory: "UI Component Library",
		operatingSystem: "Web",
		softwareRequirements: "React 19, Next.js",
		programmingLanguage: "TypeScript",
		featureList: [
			"Live, tunable previews for every component",
			"One-click integration brief for coding agents: source, dependencies, props, rules",
			"Machine-readable catalog index at /llms.txt",
		],
		publisher: { "@id": ORG_ID },
		isPartOf: { "@id": SITE_ID },
		license: SITE_REPO ? `${SITE_REPO}/blob/main/LICENSE` : undefined,
		offers: commerceArmed()
			? {
					"@type": "AggregateOffer",
					lowPrice: "0",
					highPrice: "99",
					priceCurrency: "USD",
					offerCount: "3",
					url: absoluteUrl("/components"),
				}
			: {
					"@type": "Offer",
					price: "0",
					priceCurrency: "USD",
					url: absoluteUrl("/components"),
					availability: "https://schema.org/InStock",
				},
	};
}

/** /components: the catalog as an ordered list of every entry. */
export function catalogSchema() {
	return {
		"@context": "https://schema.org",
		"@type": "CollectionPage",
		"@id": `${SITE_URL}/components#catalog`,
		name: `${SITE_NAME} component catalog`,
		url: absoluteUrl("/components"),
		isPartOf: { "@id": SITE_ID },
		mainEntity: {
			"@type": "ItemList",
			numberOfItems: registry.length,
			itemListElement: registry.map((entry, index) => ({
				"@type": "ListItem",
				position: index + 1,
				name: displayName(entry.name),
				url: absoluteUrl(entryPath(entry)),
			})),
		},
	};
}

/** /collections/[slug]: a curated slice of the catalog, listed in page order. */
export function collectionSchema(
	collection: Collection,
	entries: ComponentEntry[],
) {
	const url = absoluteUrl(collectionPath(collection));
	return {
		"@context": "https://schema.org",
		"@type": "CollectionPage",
		"@id": `${url}#collection`,
		name: collection.title,
		url,
		description: collectionDescription(collection, entries),
		isPartOf: { "@id": SITE_ID },
		publisher: { "@id": ORG_ID },
		mainEntity: {
			"@type": "ItemList",
			numberOfItems: entries.length,
			itemListElement: entries.map((entry, index) => ({
				"@type": "ListItem",
				position: index + 1,
				name: displayName(entry.name),
				url: absoluteUrl(entryPath(entry)),
			})),
		},
	};
}

/** /components/[slug]: the component as source code, which is what it is. */
export function componentSchema(entry: ComponentEntry) {
	const url = absoluteUrl(entryPath(entry));
	return {
		"@context": "https://schema.org",
		"@type": "SoftwareSourceCode",
		"@id": `${url}#component`,
		name: displayName(entry.name),
		alternateName: entryTitle(entry),
		headline: entryTitle(entry),
		description: entryDescription(entry),
		url,
		programmingLanguage: "TypeScript",
		runtimePlatform: "React",
		codeSampleType: "full solution",
		// True unless this entry's source actually locks: only Pro entries on an
		// armed deployment. Both inputs are build constants, so this stays static.
		isAccessibleForFree: !(commerceArmed() && entry.pro === true),
		keywords: [entry.category, ...(entry.cookbook ?? [])].join(", "),
		...(entry.dependencies?.length
			? { softwareRequirements: entry.dependencies.join(", ") }
			: {}),
		...(entry.addedAt ? { datePublished: entry.addedAt } : {}),
		publisher: { "@id": ORG_ID },
		isPartOf: { "@id": SITE_ID },
	};
}

/** /cookbook: the glossary as a defined-term set — the type a glossary actually is. */
export function glossarySchema() {
	const url = absoluteUrl("/cookbook");
	return {
		"@context": "https://schema.org",
		"@type": "DefinedTermSet",
		"@id": GLOSSARY_ID,
		name: "Web Animation Glossary",
		url,
		description:
			"The precise name for every web animation term, from stagger and rubber-banding to spring damping and scrub.",
		inLanguage: "en-US",
		publisher: { "@id": ORG_ID },
		hasDefinedTerm: COOKBOOK.flatMap((section) =>
			section.terms.map((term) => ({
				"@type": "DefinedTerm",
				"@id": `${url}#${termAnchor(term.term)}`,
				name: term.term,
				description: term.description,
				url: `${url}#${termAnchor(term.term)}`,
				inDefinedTermSet: { "@id": GLOSSARY_ID },
			})),
		),
	};
}

export interface Crumb {
	name: string;
	path: string;
}

export function breadcrumbSchema(trail: Crumb[]) {
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: trail.map((crumb, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: crumb.name,
			item: absoluteUrl(crumb.path),
		})),
	};
}
