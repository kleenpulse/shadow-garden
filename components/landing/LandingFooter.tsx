"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
	anchorFor,
	SECTION_IDS,
	type LandingData,
} from "@/components/landing/data";
import SmoothAnchor from "@/components/landing/SmoothAnchor";
import { useDataCopy } from "@/lib/i18n/data-copy";
import { COLLECTIONS, collectionPath } from "@/lib/collections";

// The homepage is the strongest page on the site, so the collection spokes get a
// link from it rather than living only in the shell footer. Four, not eighteen —
// this is a colophon, and it sits beside a four-row exhibit list. The
// /collections index carries the rest.
const FEATURED = [
	"react-stagger-animation",
	"react-drag-animations",
	"react-hover-effects",
	"react-micro-interactions",
];

// Quiet colophon — the last of the page's seven plates (η).
export default function LandingFooter({
	stats,
	exhibits,
}: {
	stats: LandingData["stats"];
	exhibits: LandingData["exhibits"];
}) {
	const t = useTranslations("landing.footer");
	const copy = useDataCopy();
	const featured = FEATURED.map((slug) =>
		COLLECTIONS.find((collection) => collection.slug === slug),
	).filter((collection) => collection !== undefined);

	return (
		<footer
			id={SECTION_IDS.colophon}
			className="scroll-mt-10 border-t border-hairline"
		>
			<div className="mx-auto grid w-full max-w-7xl gap-10 px-3 py-14 sm:px-6 sm:grid-cols-[1fr_auto_auto]">
				<div>
					<p className="font-display text-sm uppercase tracking-[0.28em] text-ink">
						Shadow Garden
					</p>
					<p className="mt-3 max-w-sm font-sans text-xs leading-relaxed text-ink-mute">
						{t("tagline")}
					</p>
				</div>
				<nav
					aria-label={t("exhibitsAriaLabel")}
					className="flex flex-col gap-2 font-display text-[10px] uppercase tracking-[0.22em]"
				>
					{exhibits.map((exhibit) => (
						<SmoothAnchor
							key={exhibit.category}
							href={`#${anchorFor(exhibit.category)}`}
							className="text-ink-dim transition-colors hover:text-accent"
						>
							<span className="normal-case">{exhibit.greek}</span> ·{" "}
							{copy(
								`pages.categories.${anchorFor(exhibit.category)}`,
								exhibit.category,
							)}
						</SmoothAnchor>
					))}
					<Link
						href="/components"
						className="mt-2 text-accent transition-colors hover:text-accent-hover"
					>
						{t("fullCatalog")} <span aria-hidden>→</span>
					</Link>
				</nav>
				<nav
					aria-label={t("collectionsAriaLabel")}
					className="flex flex-col gap-2 font-display text-[10px] uppercase tracking-[0.22em]"
				>
					{featured.map((collection) => (
						<Link
							key={collection.slug}
							href={collectionPath(collection)}
							className="text-ink-dim transition-colors hover:text-accent"
						>
							{copy(`collections.${collection.slug}.title`, collection.title)}
						</Link>
					))}
					<Link
						href="/collections"
						className="mt-2 text-accent transition-colors hover:text-accent-hover"
					>
						{t("allCollections")} <span aria-hidden>→</span>
					</Link>
				</nav>
			</div>
			<div className="border-t border-hairline">
				<div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-3 py-3 font-display text-[10px] sm:px-6 uppercase tracking-[0.22em] text-ink-mute">
					<span>
						{t("plateLabel")} <span className="normal-case">η</span>-07 ·{" "}
						{t("colophonLabel")}
					</span>
					<span>
						{t("statsLine", {
							specimens: stats.total,
							exhibitCount: exhibits.length,
						})}
					</span>
				</div>
			</div>
		</footer>
	);
}
