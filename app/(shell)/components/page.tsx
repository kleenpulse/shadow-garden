import type { Metadata } from "next";
import { groupByCategory } from "@/lib/registry";
import { categoryCollection, collectionPath } from "@/lib/collections";
import CatalogCard from "@/components/shell/CatalogCard";
import PageBottomBlur from "@/components/landing/PageBottomBlur";
import { CatalogHeader, CategoryHeading } from "./_components/catalog-client";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema, catalogSchema } from "@/lib/schema";
import { SITE_OG_IMAGE } from "@/lib/seo";

const TITLE = "All Components";
const DESCRIPTION =
	"Browse every Motion Garden component — WebGL backgrounds, text animations, micro-interactions and power-user systems. Each one live, tunable in the browser, and ready to copy into React or Next.js.";

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
			{/* The landing's frosted bottom strip, kept off the sidebar column. No
			    hero here, so it is up from the first pixel and sinks at the footer. */}
			<PageBottomBlur hero={false} shade className="lg:start-(--sg-sidebar-w,18rem)" />
			<JsonLd
				data={[
					catalogSchema(),
					breadcrumbSchema([
						{ name: "Home", path: "/" },
						{ name: "Components", path: "/components" },
					]),
				]}
			/>
			<CatalogHeader />

			<div className="space-y-10">
				{groups.map((group) => {
					const collection = categoryCollection(group.category);

					return (
					<section key={group.category}>
						<CategoryHeading
							category={group.category}
							aboutHref={collection ? collectionPath(collection) : undefined}
						/>
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{group.entries.map((entry) => (
								<CatalogCard
									key={entry.slug}
									slug={entry.slug}
									name={entry.name}
									description={entry.description}
									addedAt={entry.addedAt}
									pro={entry.pro}
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
