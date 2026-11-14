import { matchReasons, type Collection } from "@/lib/collections";
import type { ComponentEntry } from "@/lib/registry/types";
import { entryPath } from "@/lib/seo";
import CollectionMembersList, {
	type CollectionMemberRow,
} from "./CollectionMembersList";

// The members of a collection, in registry order.
//
// The reason line under each card is what stops 18 collection pages from being
// the same grid with a different filter: the identical component reads "Stagger,
// Reveal" on one page and "Built with motion" on another, because it is on each
// page for a different reason. Derived from the entry's own declarations — a new
// component gets its reason line for free.
//
// Reasons are computed here, server-side; the client list only translates the
// "Built with" chrome. Library and term names are join keys and stay English.

export default function CollectionMembers({
	collection,
	entries,
}: {
	collection: Collection;
	entries: ComponentEntry[];
}) {
	const rows: CollectionMemberRow[] = entries.map((entry) => {
		const reasons = matchReasons(collection, entry);
		const isDeps = collection.filter.kind === "deps";

		return {
			slug: entry.slug,
			name: entry.name,
			description: entry.description,
			href: entryPath(entry),
			builtWith:
				isDeps && reasons.length > 0 ? reasons.join(" + ") : undefined,
			reason:
				!isDeps && reasons.length > 0 ? reasons.join(" · ") : undefined,
		};
	});

	return <CollectionMembersList rows={rows} />;
}
