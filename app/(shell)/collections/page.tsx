import type { Metadata } from "next";
import Link from "next/link";
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
	const groups = COLLECTION_GROUPS.map((group) => ({
		group,
		items: COLLECTIONS.filter((c) => collectionGroup(c) === group).map(
			(collection) => ({
				collection,
				count: resolveCollection(collection).length,
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

			<header className="border-b border-hairline pb-6">
				<p className="font-display text-[11px] uppercase tracking-[0.25em] text-ink-mute">
					Catalog
				</p>
				<h1 className="mt-2 font-display text-3xl uppercase tracking-[0.08em] text-ink">
					Collections
				</h1>
				<p className="mt-3 max-w-2xl font-sans text-sm leading-relaxed text-ink-dim">
					{DESCRIPTION}
				</p>
			</header>

			<div className="space-y-10">
				{groups.map(({ group, items }) => (
					<section key={group} className="space-y-3">
						<h2 className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute">
							{group}
						</h2>
						<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{items.map(({ collection, count }) => (
								<li key={collection.slug}>
									<Link
										href={collectionPath(collection)}
										className="flex h-full flex-col gap-2 rounded-lg border border-hairline bg-panel p-4 transition-colors hover:border-accent-muted"
									>
										<div className="flex items-baseline justify-between gap-2">
											<h3 className="font-display text-sm uppercase tracking-[0.08em] text-ink">
												{collection.title}
											</h3>
											<span className="shrink-0 font-display text-[10px] tracking-[0.18em] text-ink-mute">
												{count}
											</span>
										</div>
										<p className="font-sans text-xs leading-relaxed text-ink-dim">
											{collection.intro.split(/(?<=\.)\s/, 1)}
										</p>
									</Link>
								</li>
							))}
						</ul>
					</section>
				))}
			</div>
		</div>
	);
}
