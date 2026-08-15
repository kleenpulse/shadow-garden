"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useDataCopy } from "@/lib/i18n/data-copy";

// Client leaf for DemonstratedTerms: the join stays server-side, this only
// carries the heading and resolves each definition against the generated
// cookbookTerms.<anchor> copy. Term names and anchors stay English.
export default function DemonstratedTermsList({
	rows,
}: {
	rows: Array<{ term: string; anchor: string; definition: string }>;
}) {
	const t = useTranslations("chrome.demonstratedTerms");
	const copy = useDataCopy();

	return (
		<section className="space-y-3">
			<h2 className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute">
				{t("heading")}
			</h2>
			<dl className="divide-y divide-hairline rounded-lg border border-hairline bg-panel">
				{rows.map(({ term, anchor, definition }) => (
					<div
						key={term}
						className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-6"
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
