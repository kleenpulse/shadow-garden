"use client";

import { useTranslations } from "next-intl";
import FavoritesSubtitle from "@/components/shell/FavoritesSubtitle";

// Header copy for /favorites — the page stays a server component for its
// metadata export; the subtitle was already a client leaf.
export default function FavoritesHeader() {
	const t = useTranslations("pages.favorites");

	return (
		<header className="mb-10">
			<p className="font-display text-[11px] uppercase tracking-[0.25em] text-ink-mute">
				{t("eyebrow")}
			</p>
			<h1 className="mt-2 font-display text-3xl uppercase tracking-[0.08em] text-ink">
				{t("title")}
			</h1>
			<FavoritesSubtitle />
		</header>
	);
}
