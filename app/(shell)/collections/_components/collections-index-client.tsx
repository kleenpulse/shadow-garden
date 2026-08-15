"use client";

// String-bearing body of /collections — the page stays a server component
// (metadata, full prerender) and passes plain precomputed rows down.
// Collection titles/intros and group names are data-driven copy, so they go
// through useDataCopy against the generated collections/collectionGroups
// namespaces with the English data text as fallback.

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useDataCopy } from "@/lib/i18n/data-copy";

// Mirrors scripts/i18n/gen-catalog.ts — the slug the generated
// collectionGroups keys are written under ("By Category" → "by-category").
const slugify = (s: string) =>
	s
		.toLowerCase()
		.replace(/&/g, "and")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

export interface CollectionsIndexItem {
	slug: string;
	title: string;
	intro: string;
	count: number;
	href: string;
}

export interface CollectionsIndexGroup {
	group: string;
	items: CollectionsIndexItem[];
}

export default function CollectionsIndexClient({
	groups,
}: {
	groups: CollectionsIndexGroup[];
}) {
	const t = useTranslations("pages.collections");
	const copy = useDataCopy();

	return (
		<>
			<header className="border-b border-hairline pb-6">
				<p className="font-display text-[11px] uppercase tracking-[0.25em] text-ink-mute">
					{t("eyebrow")}
				</p>
				<h1 className="mt-2 font-display text-3xl uppercase tracking-[0.08em] text-ink">
					{t("title")}
				</h1>
				<p className="mt-3 max-w-2xl font-sans text-sm leading-relaxed text-ink-dim">
					{t("intro")}
				</p>
			</header>

			<div className="space-y-10">
				{groups.map(({ group, items }) => (
					<section key={group} className="space-y-3">
						<h2 className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute">
							{copy(`collectionGroups.${slugify(group)}`, group)}
						</h2>
						<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{items.map((item) => (
								<li key={item.slug}>
									<Link
										href={item.href}
										className="flex h-full flex-col gap-2 rounded-lg border border-hairline bg-panel p-4 transition-colors hover:border-accent-muted"
									>
										<div className="flex items-baseline justify-between gap-2">
											<h3 className="font-display text-sm uppercase tracking-[0.08em] text-ink">
												{copy(`collections.${item.slug}.title`, item.title)}
											</h3>
											<span className="shrink-0 font-display text-[10px] tracking-[0.18em] text-ink-mute">
												{item.count}
											</span>
										</div>
										<p className="font-sans text-xs leading-relaxed text-ink-dim">
											{/* First sentence only — same split the English ran. */}
											{copy(`collections.${item.slug}.intro`, item.intro).split(
												/(?<=\.)\s/,
												1,
											)}
										</p>
									</Link>
								</li>
							))}
						</ul>
					</section>
				))}
			</div>
		</>
	);
}
