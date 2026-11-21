import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

// `/components/*/full` and `/favorites` are NOT disallowed here on purpose. They
// carry `robots: { index: false }` in their metadata, and a crawler has to fetch a
// page to read that tag — a Disallow would block the crawl, leaving Google to index
// the URL from inbound links alone with no way to learn it shouldn't. Disallow hides
// a page from the crawler; noindex removes it from the index. Only one of those is
// what we want here.
//
// `/api/agent/` is open on purpose: it holds the catalog reads `/llms.txt` tells
// agents to fetch (search, describe, brief), all public MIT facts. The longest
// matching path wins (RFC 9309), so it stays allowed while the rest of `/api/`
// (stats and feedback writes) stays closed.
export default function robots(): MetadataRoute.Robots {
	return {
		rules: {
			userAgent: "*",
			allow: ["/", "/api/agent/"],
			disallow: ["/api/"],
		},
		sitemap: absoluteUrl("/sitemap.xml"),
	};
}
