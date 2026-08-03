import Link from "next/link";
import { matchReasons, type Collection } from "@/lib/collections";
import type { ComponentEntry } from "@/lib/registry/types";
import { displayName } from "@/lib/display-name";
import { entryPath } from "@/lib/seo";
import TierBadge from "./TierBadge";

// The members of a collection, in registry order.
//
// The reason line under each card is what stops 18 collection pages from being
// the same grid with a different filter: the identical component reads "Stagger,
// Reveal" on one page and "Built with motion" on another, because it is on each
// page for a different reason. Derived from the entry's own declarations — a new
// component gets its reason line for free.

function reasonLabel(collection: Collection, reasons: string[]): string | null {
	if (reasons.length === 0) return null;
	return collection.filter.kind === "deps"
		? `Built with ${reasons.join(" + ")}`
		: reasons.join(" · ");
}

export default function CollectionMembers({
	collection,
	entries,
}: {
	collection: Collection;
	entries: ComponentEntry[];
}) {
	return (
		<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{entries.map((entry) => {
				const reason = reasonLabel(collection, matchReasons(collection, entry));

				return (
					<li key={entry.slug}>
						<Link
							href={entryPath(entry)}
							className="flex h-full flex-col gap-2 rounded-lg border border-hairline bg-panel p-4 transition-colors hover:border-accent-muted"
						>
							<div className="flex items-center justify-between gap-2">
								<h3 className="font-display text-sm uppercase tracking-[0.08em] text-ink">
									{displayName(entry.name)}
								</h3>
								<TierBadge tier={entry.tier} />
							</div>
							<p className="font-sans text-xs leading-relaxed text-ink-dim">
								{entry.description}
							</p>
							{reason && (
								<p className="mt-auto pt-1 font-display text-[9px] uppercase tracking-[0.18em] text-ink-mute">
									{reason}
								</p>
							)}
						</Link>
					</li>
				);
			})}
		</ul>
	);
}
