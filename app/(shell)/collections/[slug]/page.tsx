import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
	COLLECTIONS,
	collectionPath,
	collectionTerms,
	getCollection,
	resolveCollection,
	siblingCollections,
} from "@/lib/collections";
import { termAnchor, termDefinition } from "@/lib/cookbook";
import { collectionDescription, SITE_OG_IMAGE } from "@/lib/seo";
import { breadcrumbSchema, collectionSchema, type Crumb } from "@/lib/schema";
import JsonLd from "@/components/seo/JsonLd";
import Breadcrumbs from "@/components/shell/Breadcrumbs";
import CollectionMembers from "@/components/shell/CollectionMembers";
import {
	CollectionGlossary,
	CollectionHeader,
	MembersHeading,
	RelatedCollections,
} from "./_components/collection-detail-client";

// One template, 18 pages, every member set computed from the registry.
//
// Reads no cookies and no search params, so unlike the workspace routes this
// prerenders whole — no <Suspense> boundary, no dynamic hole.

export function generateStaticParams() {
	return COLLECTIONS.map((collection) => ({ slug: collection.slug }));
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string }>;
}): Promise<Metadata> {
	// Next 16: params is a Promise and must be awaited.
	const { slug } = await params;
	const collection = getCollection(slug);
	if (!collection) return {};

	const title = collection.title;
	const description = collectionDescription(
		collection,
		resolveCollection(collection),
	);
	const url = collectionPath(collection);

	return {
		title,
		description,
		alternates: { canonical: url },
		// images is not optional: declaring openGraph at all drops the root card.
		openGraph: {
			title,
			description,
			url,
			type: "website",
			images: [SITE_OG_IMAGE],
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
			images: [SITE_OG_IMAGE.url],
		},
	};
}

export default async function CollectionPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const collection = getCollection(slug);
	if (!collection) notFound();

	const entries = resolveCollection(collection);
	const siblings = siblingCollections(collection);

	// Technique collections print the definitions of the terms they filter on;
	// the join is the same one DemonstratedTerms uses on a component page. The
	// anchor is precomputed here so the client island gets plain rows.
	const glossary = collectionTerms(collection)
		.map((term) => ({ term, definition: termDefinition(term) }))
		.filter((row): row is { term: string; definition: string } =>
			Boolean(row.definition),
		)
		.map((row) => ({ ...row, anchor: termAnchor(row.term) }));

	const trail: Crumb[] = [
		{ name: "Home", path: "/" },
		{ name: "Collections", path: "/collections" },
		{ name: collection.title, path: collectionPath(collection) },
	];

	return (
		<div className="mx-auto max-w-7xl space-y-8">
			<JsonLd
				data={[collectionSchema(collection, entries), breadcrumbSchema(trail)]}
			/>
			<Breadcrumbs trail={trail} />

			<CollectionHeader
				slug={collection.slug}
				title={collection.title}
				intro={collection.intro}
				count={entries.length}
			/>

			<section className="space-y-3">
				<MembersHeading />
				<CollectionMembers collection={collection} entries={entries} />
			</section>

			{glossary.length > 0 && <CollectionGlossary rows={glossary} />}

			{siblings.length > 0 && (
				<RelatedCollections
					siblings={siblings.map((sibling) => ({
						slug: sibling.slug,
						title: sibling.title,
						href: collectionPath(sibling),
					}))}
				/>
			)}
		</div>
	);
}
