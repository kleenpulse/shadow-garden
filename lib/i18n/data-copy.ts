"use client";

import { useMessages } from "next-intl";

/**
 * Display copy for slug-keyed data (registry entries, cookbook terms,
 * collections). Typed `t()` can't take a runtime slug — and the data files
 * themselves must stay framework-free — so this walks the active messages
 * object directly and falls back to the English text carried by the data.
 *
 * Key convention (mirrored by scripts/i18n/gen-catalog.ts, which generates and
 * checks the English side of these namespaces):
 *   catalog.<slug>.description
 *   catalog.<slug>.props.<propName>
 *   cookbookSections.<anchor>.title / .blurb
 *   cookbookTerms.<anchor>            (term description; anchor = termAnchor(term))
 *   collections.<slug>.title / .intro
 */
export function useDataCopy(): (path: string, fallback: string) => string {
	const messages = useMessages();
	return (path, fallback) => {
		let node: unknown = messages;
		for (const seg of path.split(".")) {
			if (node === null || typeof node !== "object") return fallback;
			node = (node as Record<string, unknown>)[seg];
		}
		return typeof node === "string" ? node : fallback;
	};
}
