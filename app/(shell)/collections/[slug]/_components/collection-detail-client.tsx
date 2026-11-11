"use client";

// String-bearing pieces of a collection page, extracted so the page stays a
// server component (generateMetadata, whole-page prerender). Collection titles
// and intros are data-driven copy → useDataCopy against the generated
// collections/cookbookTerms namespaces; term names and anchors stay English.

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useDataCopy } from "@/lib/i18n/data-copy";

export function CollectionHeader({
	slug,
	title,
	intro,
	count,
}: {
	slug: string;
	title: string;
	intro: string;
	count: number;
}) {
	const t = useTranslations("pages.collections");
	const copy = useDataCopy();

	return (
		<header className="pb-2">
			<h1 className="font-title font-black uppercase leading-none tracking-[0.02em] text-balance text-4xl text-ink sm:text-5xl">
				{copy(`collections.${slug}.title`, title)}
			</h1>
			<p className="mt-4 max-w-2xl font-sans text-sm leading-relaxed text-ink-dim">
				{copy(`collections.${slug}.intro`, intro)}
			</p>
			<p className="mt-4 font-display text-[10px] uppercase tracking-[0.22em] text-ink-mute">
				{t("countMeta", { count })}
			</p>
		</header>
	);
}

export function MembersHeading() {
	const t = useTranslations("pages.collections");
	return (
		<h2 className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute">
			{t("inThisCollection")}
		</h2>
	);
}

export function CollectionGlossary({
	rows,
}: {
	rows: Array<{ term: string; anchor: string; definition: string }>;
}) {
	const t = useTranslations("pages.collections");
	const copy = useDataCopy();

	return (
		<section className="space-y-3">
			<h2 className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute">
				{t("theTerms")}
			</h2>
			<dl className="space-y-1">
				{rows.map(({ term, anchor, definition }) => (
					<div
						key={term}
						className="flex flex-col gap-1 rounded-md bg-panel px-4 py-3 sm:flex-row sm:gap-6"
					>
						<dt className="shrink-0 sm:w-52">
							<Link
								href={`/cookbook#${anchor}`}
								className="font-display text-xs uppercase tracking-[0.12em] text-ink transition-colors hover:text-accent"
							>
								{term}
							</Link>
						</dt>
						<dd className="font-sans text-sm leading-relaxed text-ink-dim">
							{copy(`cookbookTerms.${anchor}`, definition)}
						</dd>
					</div>
				))}
			</dl>
		</section>
	);
}

export function RelatedCollections({
	siblings,
}: {
	siblings: Array<{ slug: string; title: string; href: string }>;
}) {
	const t = useTranslations("pages.collections");
	const copy = useDataCopy();

	return (
		<section className="space-y-3">
			<h2 className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute">
				{t("relatedCollections")}
			</h2>
			<ul className="flex flex-wrap gap-1.5">
				{siblings.map((sibling) => (
					<li key={sibling.slug}>
						<Link
							href={sibling.href}
							className="inline-block rounded-full bg-panel px-2.5 py-1 font-sans text-xs text-ink-dim transition-colors hover:bg-raised hover:text-accent"
						>
							{copy(`collections.${sibling.slug}.title`, sibling.title)}
						</Link>
					</li>
				))}
			</ul>
		</section>
	);
}
