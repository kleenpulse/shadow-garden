import type { Metadata } from "next";
import FavoritesGrid from "@/components/shell/FavoritesGrid";

export const metadata: Metadata = {
	title: "Favorites",
	description: "Your saved Shadow Garden components.",
};

export default function FavoritesPage() {
	return (
		<div className="mx-auto max-w-7xl">
			<header className="mb-10">
				<p className="font-display text-[11px] uppercase tracking-[0.25em] text-ink-mute">
					Collection
				</p>
				<h1 className="mt-2 font-display text-3xl uppercase tracking-[0.08em] text-ink">
					Favorites
				</h1>
				<p className="mt-3 max-w-xl font-sans text-sm text-ink-dim">
					The components you&rsquo;ve pinned, saved in this browser.
				</p>
			</header>

			<FavoritesGrid />
		</div>
	);
}
