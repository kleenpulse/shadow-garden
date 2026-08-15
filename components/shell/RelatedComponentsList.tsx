"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useDataCopy } from "@/lib/i18n/data-copy";
import { displayName } from "@/lib/display-name";
import GlowCard from "./GlowCard";

// Client leaf for RelatedComponents: scoring stays server-side, this carries
// the heading and resolves descriptions against the generated catalog copy.
export default function RelatedComponentsList({
	items,
}: {
	items: Array<{ slug: string; name: string; description: string }>;
}) {
	const t = useTranslations("chrome.relatedComponents");
	const copy = useDataCopy();

	return (
		<section className="space-y-3">
			<h2 className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute">
				{t("heading")}
			</h2>
			<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{items.map((item) => (
					// The glow rides the `li`, not the link — the link has to keep
					// wrapping the name, which is the anchor text this whole section
					// exists to hand a crawler. `z-10` floats it over the overlays.
					<GlowCard
						as="li"
						key={item.slug}
						className="rounded-lg border border-hairline bg-panel transition-colors  "
					>
						<Link
							href={`/components/${item.slug}`}
							className="relative z-10 flex h-full flex-col gap-2 rounded-lg p-4"
						>
							<h3 className="font-display text-sm uppercase tracking-[0.08em] text-ink group-hover:text-accent">
								{displayName(item.name)}
							</h3>
							<p className="font-sans text-xs leading-relaxed text-ink-dim">
								{copy(`catalog.${item.slug}.description`, item.description)}
							</p>
						</Link>
					</GlowCard>
				))}
			</ul>
		</section>
	);
}
