"use client";

// String-bearing pieces of /components — extracted so the page can stay a
// server component (metadata, full prerender) while copy goes through
// next-intl. Category display names come from pages.categories.<slug>, keyed
// by the same English-derived slug the in-page anchors use; the anchors and
// hrefs themselves never change.

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useDataCopy } from "@/lib/i18n/data-copy";
import { anchorFor } from "@/components/landing/data";
import type { Category } from "@/lib/registry/types";

export function CatalogHeader() {
	const t = useTranslations("pages.components");

	return (
		<header className="mb-10">
			<p className="font-display text-[11px] uppercase tracking-[0.25em] text-ink-mute">
				{t("eyebrow")}
			</p>
			<h1 className="mt-2 font-display text-3xl uppercase tracking-[0.08em] text-ink">
				{t("title")}
			</h1>
			<p className="mt-3 max-w-xl font-sans text-sm text-ink-dim">
				{t("intro")}
			</p>
		</header>
	);
}

export function CategoryHeading({
	category,
	aboutHref,
}: {
	category: Category;
	aboutHref?: string;
}) {
	const t = useTranslations("pages.components");
	const copy = useDataCopy();
	const display = copy(`pages.categories.${anchorFor(category)}`, category);

	return (
		<h2 className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute sticky top-10 md:top-14 z-10 bg-surface/80 py-2 backdrop-blur sm:py-3">
			{display}
			{/* Topical link down into the category's own landing page — the
			    catalog is the hub, these are four of the spokes. */}
			{aboutHref && (
				<Link
					href={aboutHref}
					className="text-[10px] tracking-[0.18em] text-ink-dim transition-colors hover:text-accent"
				>
					{t("aboutCategory", { category: display })}
				</Link>
			)}
		</h2>
	);
}
