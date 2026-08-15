"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useDataCopy } from "@/lib/i18n/data-copy";
import { displayName } from "@/lib/display-name";

export interface CollectionMemberRow {
	slug: string;
	name: string;
	description: string;
	href: string;
	/** Library names ("motion + ogl") — joined server-side, names stay English. */
	builtWith?: string;
	/** Non-deps reason line ("Stagger · Reveal") — cookbook term names stay English. */
	reason?: string;
}

// Client leaf for CollectionMembers: membership and reasons are computed
// server-side; this carries the "Built with" chrome string and resolves
// descriptions against the generated catalog copy.
export default function CollectionMembersList({
	rows,
}: {
	rows: CollectionMemberRow[];
}) {
	const t = useTranslations("chrome.collectionMembers");
	const copy = useDataCopy();

	return (
		<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{rows.map((row) => (
				<li key={row.slug}>
					<Link
						href={row.href}
						className="flex h-full flex-col gap-2 rounded-lg border border-hairline bg-panel p-4 transition-colors hover:border-accent-muted"
					>
						<h3 className="font-display text-sm uppercase tracking-[0.08em] text-ink">
							{displayName(row.name)}
						</h3>
						<p className="font-sans text-xs leading-relaxed text-ink-dim">
							{copy(`catalog.${row.slug}.description`, row.description)}
						</p>
						{(row.builtWith || row.reason) && (
							<p className="mt-auto pt-1 font-display text-[9px] uppercase tracking-[0.18em] text-ink-mute">
								{row.builtWith
									? t("builtWith", { libraries: row.builtWith })
									: row.reason}
							</p>
						)}
					</Link>
				</li>
			))}
		</ul>
	);
}
