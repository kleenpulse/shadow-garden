import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	COLLECTIONS,
	collectionPath,
	collectionStats,
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
	const stats = collectionStats(entries);
	const siblings = siblingCollections(collection);

	// Technique collections print the definitions of the terms they filter on;
	// the join is the same one DemonstratedTerms uses on a component page.
	const glossary = collectionTerms(collection)
		.map((term) => ({ term, definition: termDefinition(term) }))
		.filter((row): row is { term: string; definition: string } =>
			Boolean(row.definition),
		);

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

			<header className="border-b border-hairline pb-6">
				<h1 className="font-display text-2xl uppercase tracking-[0.08em] text-ink">
					{collection.title}
				</h1>
				<p className="mt-4 max-w-2xl font-sans text-sm leading-relaxed text-ink-dim">
					{collection.intro}
				</p>
				<p className="mt-4 font-display text-[10px] uppercase tracking-[0.22em] text-ink-mute">
					{stats.total} components · {stats.free} free · {stats.pro} pro
				</p>
			</header>

			<section className="space-y-3">
				<h2 className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute">
					In This Collection
				</h2>
				<CollectionMembers collection={collection} entries={entries} />
			</section>

			{glossary.length > 0 && (
				<section className="space-y-3">
					<h2 className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute">
						The Terms
					</h2>
					<dl className="divide-y divide-hairline rounded-lg border border-hairline bg-panel">
						{glossary.map(({ term, definition }) => (
							<div
								key={term}
								className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-6"
							>
								<dt className="shrink-0 sm:w-52">
									<Link
										href={`/cookbook#${termAnchor(term)}`}
										className="font-display text-xs uppercase tracking-[0.12em] text-ink transition-colors hover:text-accent"
									>
										{term}
									</Link>
								</dt>
								<dd className="font-sans text-sm leading-relaxed text-ink-dim">
									{definition}
								</dd>
							</div>
						))}
					</dl>
				</section>
			)}

			{siblings.length > 0 && (
				<section className="space-y-3">
					<h2 className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute">
						Related Collections
					</h2>
					<ul className="flex flex-wrap gap-1.5">
						{siblings.map((sibling) => (
							<li key={sibling.slug}>
								<Link
									href={collectionPath(sibling)}
									className="inline-block rounded-full border border-hairline px-2.5 py-1 font-sans text-xs text-ink-dim transition-colors hover:border-accent-muted hover:text-accent"
								>
									{sibling.title}
								</Link>
							</li>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}
