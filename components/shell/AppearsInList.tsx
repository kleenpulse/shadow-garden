"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useDataCopy } from "@/lib/i18n/data-copy";

// Client leaf for AppearsIn: the collection join stays server-side, this
// carries the heading and resolves titles against the generated collections
// copy. Hrefs stay English-derived.
export default function AppearsInList({
	collections,
}: {
	collections: Array<{ slug: string; title: string; href: string }>;
}) {
	const t = useTranslations("chrome.appearsIn");
	const copy = useDataCopy();

	return (
		<section className="space-y-3">
			<h2 className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute">
				{t("heading")}
			</h2>
			<ul className="flex flex-wrap gap-1.5">
				{collections.map((collection) => (
					<li key={collection.slug}>
						<Link
							href={collection.href}
							className="inline-block rounded-full border border-hairline px-2.5 py-1 font-sans text-xs text-ink-dim transition-colors hover:border-accent-muted hover:text-accent"
						>
							{copy(`collections.${collection.slug}.title`, collection.title)}
						</Link>
					</li>
				))}
			</ul>
		</section>
	);
}
