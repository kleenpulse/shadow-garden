import type { Metadata } from "next";
import { groupByCategory } from "@/lib/registry";
import CatalogCard from "@/components/shell/CatalogCard";

export const metadata: Metadata = {
	title: "Components",
	description:
		"Browse the Shadow Garden catalog of tunable, animation-forward components.",
};

export default function CatalogPage() {
	const groups = groupByCategory();

	return (
		<div className="mx-auto max-w-7xl">
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
				{groups.map((group) => (
					<section key={group.category}>
						<h2 className="mb-3 font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute sticky top-10 md:top-14 z-10 bg-surface/80 py-2 backdrop-blur sm:py-3">
							{group.category}
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
				))}
			</div>
		</div>
	);
}
