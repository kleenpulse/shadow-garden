"use client";

import { useTranslations } from "next-intl";

// Header copy for /cookbook — extracted so the page can stay a server
// component (metadata, full prerender) while the strings go through next-intl.
export default function CookbookHeader({
	covered,
	total,
}: {
	covered: number;
	total: number;
}) {
	const t = useTranslations("pages.cookbook");

	return (
		<header className="mb-4 md:mb-10">
			<p className="font-display text-[11px] uppercase tracking-[0.25em] text-ink-mute">
				{t("eyebrow")}
			</p>
			<h1 className="mt-2 font-display text-3xl uppercase tracking-[0.08em] text-ink">
				{t("title")}
			</h1>
			<p className="mt-3 max-w-xl font-sans text-xs md:text-sm text-ink-dim">
				{t("intro")}
			</p>
			<p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-mute">
				{t("coverage", { covered, total })}
			</p>
		</header>
	);
}
