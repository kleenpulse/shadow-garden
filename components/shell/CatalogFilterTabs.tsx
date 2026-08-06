"use client";

import { useEffect } from "react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useUIStore, type CatalogFilter } from "@/lib/store";
import PillTabs, { type PillTabItem } from "./PillTabs";

export const CATALOG_FILTERS = ["all", "free", "pro", "new"] as const;

// `filter` is reserved for this control — a registry prop of the same name would
// collide with it on a component page, where tuned props share the query string.
export const CATALOG_FILTER_PARAM = "filter";

const parser = parseAsStringLiteral(CATALOG_FILTERS)
	.withDefault("all")
	.withOptions({ history: "replace", shallow: true, clearOnDefault: true });

/**
 * The URL binding for the sidebar catalog filter — the only part of the sidebar
 * that reads the query string, which is why it lives in its own file.
 *
 * Sidebar itself renders into the prerendered shell (35 static nav links, the
 * spokes of the hub-and-spoke graph). Reading the URL up there would drag the
 * whole thing out of the static render, so the read is isolated here and mounted
 * behind <Suspense>; the store stays the render source of truth for the list.
 *
 * Same nuqs options as the Controls panel (`history: "replace"`, `shallow`,
 * `clearOnDefault`) — one pattern for tuned state, so "all" never reaches the URL
 * and a shared link carries only a filter the user actually chose.
 */
export default function CatalogFilterTabs({
	items,
}: {
	items: PillTabItem<CatalogFilter>[];
}) {
	const [filter, setFilter] = useQueryState(CATALOG_FILTER_PARAM, parser);
	const catalogFilter = useUIStore((state) => state.catalogFilter);
	const setCatalogFilter = useUIStore((state) => state.setCatalogFilter);

	// URL → store. Covers the deep link and any navigation that carries the param;
	// the store can't be seeded from the URL at creation because it is shared with
	// the statically rendered half of the sidebar.
	useEffect(() => {
		if (filter !== catalogFilter) setCatalogFilter(filter);
	}, [filter, catalogFilter, setCatalogFilter]);

	return (
		<PillTabs<CatalogFilter>
			aria-label="Filter components"
			value={catalogFilter}
			onValueChange={(value) => {
				// Both, in this order: the store paints this frame, the URL catches up
				// on nuqs's throttle. Waiting on the round-trip would lag the pill.
				setCatalogFilter(value);
				void setFilter(value);
			}}
			items={items}
			layoutId="sidebar-tier-filter"
			fullWidth
			size="md"
			className="mt-2"
		/>
	);
}
