import type { Metadata } from "next";
import Link from "next/link";
import { groupByCategory } from "@/lib/registry";
import { categoryCollection, collectionPath } from "@/lib/collections";
import CatalogCard from "@/components/shell/CatalogCard";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema, catalogSchema } from "@/lib/schema";
import { SITE_OG_IMAGE } from "@/lib/seo";

const TITLE = "All Components";
const DESCRIPTION =
	"Browse every Shadow Garden component — WebGL backgrounds, text animations, micro-interactions and power-user systems. Each one live, tunable in the browser, and ready to copy into React or Next.js.";

export const metadata: Metadata = {
	title: TITLE,
	description: DESCRIPTION,
	alternates: { canonical: "/components" },
	openGraph: {
		title: TITLE,
		description: DESCRIPTION,
		url: "/components",
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

export default function CatalogPage() {
	const groups = groupByCategory();

	return (
		<div className="mx-auto max-w-7xl">
			<JsonLd
				data={[
					catalogSchema(),
					breadcrumbSchema([
						{ name: "Home", path: "/" },
						{ name: "Components", path: "/components" },
					]),
				]}
			/>
			<header className="mb-10">
				<p className="font-display text-[11px] uppercase tracking-[0.25em] text-ink-mute">
					Catalog
				</p>
				<h1 className="mt-2 font-display text-3xl uppercase tracking-[0.08em] text-ink">
					Components
				</h1>
				<p className="mt-3 max-w-xl font-sans text-sm text-ink-dim">
					Every component is live and tunable. Dial in the parameters, share the
					URL, copy the source.
				</p>
			</header>

			<div className="space-y-10">
				{groups.map((group) => {
					const collection = categoryCollection(group.category);

					return (
					<section key={group.category}>
						<h2 className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute sticky top-10 md:top-14 z-10 bg-surface/80 py-2 backdrop-blur sm:py-3">
							{group.category}
							{/* Topical link down into the category's own landing page — the
							    catalog is the hub, these are four of the spokes. */}
							{collection && (
								<Link
									href={collectionPath(collection)}
									className="text-[10px] tracking-[0.18em] text-ink-dim transition-colors hover:text-accent"
								>
									About {group.category} →
								</Link>
							)}
						</h2>
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{group.entries.map((entry) => (
								<CatalogCard
									key={entry.slug}
									slug={entry.slug}
									name={entry.name}
									description={entry.description}
									tier={entry.tier}
									addedAt={entry.addedAt}
								/>
							))}
						</div>
					</section>
					);
				})}
			</div>
		</div>
	);
}
