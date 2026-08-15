import type { Metadata } from "next";
import FavoritesGrid from "@/components/shell/FavoritesGrid";
import FavoritesHeader from "./_components/FavoritesHeader";

export const metadata: Metadata = {
	title: "Favorites",
	description: "Your saved Shadow Garden components.",
	// Per-visitor and localStorage-driven, so the server HTML is an empty shell.
	// Nothing here is the same page twice and none of it is ours to rank.
	robots: { index: false, follow: true },
	alternates: { canonical: "/favorites" },
};

export default function FavoritesPage() {
	return (
		<div className="mx-auto max-w-7xl">
			<FavoritesHeader />

			<FavoritesGrid />
		</div>
	);
}
