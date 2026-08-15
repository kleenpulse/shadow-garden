"use client";

// String-bearing pieces of the component detail page, extracted so the page
// itself stays a server component (generateMetadata, Suspense holes intact).
// The entry crossing the boundary is one plain registry object.

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useDataCopy } from "@/lib/i18n/data-copy";
import { termAnchor } from "@/lib/cookbook";
import { anchorFor } from "@/components/landing/data";
import type { ComponentEntry } from "@/lib/registry/types";
import { cn } from "@/lib/utils";
import { displayName } from "@/lib/display-name";
import NewBadge from "@/components/shell/NewBadge";
import FavoriteButton from "@/components/shell/FavoriteButton";

export function ComponentHeader({ entry }: { entry: ComponentEntry }) {
	const t = useTranslations("pages.componentDetail");
	const copy = useDataCopy();

	return (
		<header className="border-b border-hairline pb-6">
			<p className="font-display text-[11px] uppercase tracking-[0.22em] text-ink-mute">
				{copy(`pages.categories.${anchorFor(entry.category)}`, entry.category)}
			</p>
			<div className="mt-2 flex flex-wrap items-center gap-3">
				<h1
					className={cn(
						"font-display text-2xl uppercase tracking-[0.08em]",
						entry.slug === "grainient" ? "text-grainient" : "text-ink",
					)}
				>
					{displayName(entry.name)}
				</h1>
				<NewBadge addedAt={entry.addedAt} />
				<FavoriteButton
					slug={entry.slug}
					name={entry.name}
					iconSize={18}
					className="border border-hairline"
				/>
			</div>
			<p className="mt-3 max-w-2xl font-sans text-sm text-ink-dim">
				{copy(`catalog.${entry.slug}.description`, entry.description)}
			</p>

			{entry.attribution && (
				<p className="mt-2 font-mono text-[11px] text-ink-mute">
					{t("adaptedFrom")}{" "}
					<a
						href={entry.attribution.url}
						target="_blank"
						rel="noreferrer"
						className="text-ink-dim underline decoration-hairline underline-offset-2 transition-colors hover:text-accent hover:decoration-current"
					>
						{entry.attribution.name}
					</a>
					<span aria-hidden> ↗</span>
				</p>
			)}

			{/* The motion terms this component demonstrates, each linking to its
			    definition. Declared on the entry; /cookbook inverts the mapping.
			    Term names are the glossary's join keys and stay English. */}
			{entry.cookbook && entry.cookbook.length > 0 && (
				<div className="mt-4 flex flex-wrap items-center gap-1.5">
					<span className="font-display text-[9px] uppercase tracking-[0.2em] text-ink-mute">
						{t("cookbookLabel")}
					</span>
					{entry.cookbook.map((term) => (
						<Link
							key={term}
							href={`/cookbook#${termAnchor(term)}`}
							className="rounded-full border border-hairline px-2.5 py-1 font-sans text-xs text-ink-dim transition-colors hover:border-accent-muted hover:text-accent"
						>
							{term}
						</Link>
					))}
				</div>
			)}
		</header>
	);
}

export function InstallHeading() {
	const t = useTranslations("pages.componentDetail");
	return (
		<h2 className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute">
			{t("install")}
		</h2>
	);
}

export function PropsHeading() {
	const t = useTranslations("pages.componentDetail");
	return (
		<h2 className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute">
			{t("props")}
		</h2>
	);
}
