import type { MetadataRoute } from "next";
import { registry } from "@/lib/registry";
import { COLLECTIONS, collectionPath } from "@/lib/collections";
import { absoluteUrl } from "@/lib/site";

// Only the pages meant to rank.
//
// Deliberately absent: the `/components/[slug]/full` routes (a fullscreen
// stage, not a document — their server HTML is one skeleton div) and `/favorites`
// (rendered from localStorage, so its server HTML is empty). Both carry a noindex
// tag instead. Listing a page here while telling Google not to index it is a
// contradiction, and listing an empty page is asking to be judged on it.
//
// Pure registry data, no request-time API — stays static under Cache Components.
export default function sitemap(): MetadataRoute.Sitemap {
	// The catalog's freshness is the newest component in it. A real date beats a
	// build timestamp, which changes on every deploy and teaches a crawler nothing.
	const latest = registry
		.map((entry) => entry.addedAt)
		.filter((date): date is string => Boolean(date))
		.sort()
		.at(-1);

	const hubs: MetadataRoute.Sitemap = [
		{
			url: absoluteUrl("/"),
			lastModified: latest,
			changeFrequency: "weekly",
			priority: 1,
		},
		{
			url: absoluteUrl("/components"),
			lastModified: latest,
			changeFrequency: "weekly",
			priority: 0.9,
		},
		{
			url: absoluteUrl("/cookbook"),
			lastModified: latest,
			changeFrequency: "monthly",
			priority: 0.8,
		},
		{
			url: absoluteUrl("/collections"),
			lastModified: latest,
			changeFrequency: "weekly",
			priority: 0.8,
		},
	];

	// Membership is computed from the registry, so a collection is exactly as
	// fresh as the newest component that qualifies for it.
	const collections: MetadataRoute.Sitemap = COLLECTIONS.map((collection) => ({
		url: absoluteUrl(collectionPath(collection)),
		lastModified: latest,
		changeFrequency: "weekly",
		priority: 0.8,
	}));

	const components: MetadataRoute.Sitemap = registry.map((entry) => ({
		url: absoluteUrl(`/components/${entry.slug}`),
		lastModified: entry.addedAt,
		changeFrequency: "monthly",
		priority: 0.7,
	}));

	return [...hubs, ...collections, ...components];
}
