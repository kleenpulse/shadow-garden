import Link from "next/link";
import { collectionsFor, collectionPath } from "@/lib/collections";
import type { ComponentEntry } from "@/lib/registry/types";

// The spoke → hub edge. The footer links every collection from every page, but
// that is chrome; this says which collections contain *this* component, which is
// the link a crawler reads as topical rather than navigational. Without it the
// cluster only points one way.
export default function AppearsIn({ entry }: { entry: ComponentEntry }) {
	const collections = collectionsFor(entry);
	if (collections.length === 0) return null;

	return (
		<section className="space-y-3">
			<h2 className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute">
				Appears In
			</h2>
			<ul className="flex flex-wrap gap-1.5">
				{collections.map((collection) => (
					<li key={collection.slug}>
						<Link
							href={collectionPath(collection)}
							className="inline-block rounded-full border border-hairline px-2.5 py-1 font-sans text-xs text-ink-dim transition-colors hover:border-accent-muted hover:text-accent"
						>
							{collection.title}
						</Link>
					</li>
				))}
			</ul>
		</section>
	);
}
