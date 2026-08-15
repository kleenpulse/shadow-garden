import type { Metadata } from "next";
import {
	COLLECTIONS,
	COLLECTION_GROUPS,
	collectionGroup,
	collectionPath,
	resolveCollection,
} from "@/lib/collections";
import { breadcrumbSchema } from "@/lib/schema";
import { SITE_OG_IMAGE } from "@/lib/seo";
import JsonLd from "@/components/seo/JsonLd";
import Breadcrumbs from "@/components/shell/Breadcrumbs";
import type { Crumb } from "@/lib/schema";
import CollectionsIndexClient from "./_components/collections-index-client";

const TITLE = "Component Collections";
const DESCRIPTION =
	"Curated slices of the Shadow Garden catalog — by category, by technique, and by animation library. Each collection is computed from the registry, so it never drifts from the components it lists.";

export const metadata: Metadata = {
	title: TITLE,
	description: DESCRIPTION,
	alternates: { canonical: "/collections" },
	openGraph: {
		title: TITLE,
		description: DESCRIPTION,
		url: "/collections",
		type: "website",
		images: [SITE_OG_IMAGE],
	},
	twitter: {
		card: "summary_large_image",
		title: TITLE,
		description: DESCRIPTION,
		images: [SITE_OG_IMAGE.url],
	},
};

export default function CollectionsIndexPage() {
	// Plain rows only cross into the client island — titles and intros carry the
	// English text as the translation fallback.
	const groups = COLLECTION_GROUPS.map((group) => ({
		group: group as string,
		items: COLLECTIONS.filter((c) => collectionGroup(c) === group).map(
			(collection) => ({
				slug: collection.slug,
				title: collection.title,
				intro: collection.intro,
				count: resolveCollection(collection).length,
				href: collectionPath(collection),
			}),
		),
	})).filter((row) => row.items.length > 0);

	const trail: Crumb[] = [
		{ name: "Home", path: "/" },
		{ name: "Collections", path: "/collections" },
	];

	return (
		<div className="mx-auto max-w-7xl space-y-8">
			<JsonLd data={breadcrumbSchema(trail)} />
			<Breadcrumbs trail={trail} />

			<CollectionsIndexClient groups={groups} />
		</div>
	);
}
