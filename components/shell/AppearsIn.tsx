import { collectionsFor, collectionPath } from "@/lib/collections";
import type { ComponentEntry } from "@/lib/registry/types";
import AppearsInList from "./AppearsInList";

// The spoke → hub edge. The footer links every collection from every page, but
// that is chrome; this says which collections contain *this* component, which is
// the link a crawler reads as topical rather than navigational. Without it the
// cluster only points one way.
//
// The join stays in this server component so lib/collections never enters the
// client bundle; the client list only translates the display copy.
export default function AppearsIn({ entry }: { entry: ComponentEntry }) {
	const collections = collectionsFor(entry);
	if (collections.length === 0) return null;

	return (
		<AppearsInList
			collections={collections.map((collection) => ({
				slug: collection.slug,
				title: collection.title,
				href: collectionPath(collection),
			}))}
		/>
	);
}
