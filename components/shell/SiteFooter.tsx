"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
	COLLECTIONS,
	COLLECTION_GROUPS,
	collectionGroup,
	collectionPath,
} from "@/lib/collections";
import { registry } from "@/lib/registry";
import { useDataCopy } from "@/lib/i18n/data-copy";

// The shell had no footer. This is where the collection spokes live. Client
// component in next-intl's client-provider mode, but the SSR pass (see
// lib/i18n/provider.tsx) always renders 'en' first, so all 18 links still sit
// in the pre-hydration HTML a crawler sees — the same guarantee this file used
// to get from being server-only, now carried by the provider's SSR-locale
// contract instead.

// Mirrors scripts/i18n/gen-catalog.ts's slugify exactly — it's the key the
// collectionGroups.<slug> catalog is generated under.
function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/&/g, "and")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export default function SiteFooter() {
	const t = useTranslations("chrome.footer");
	const copy = useDataCopy();

	const NAV = [
		{ href: "/components", label: t("nav.allComponents") },
		{ href: "/collections", label: t("nav.collections") },
		{ href: "/cookbook", label: t("nav.cookbook") },
	];

	const groups = COLLECTION_GROUPS.map((group) => ({
		group,
		items: COLLECTIONS.filter((c) => collectionGroup(c) === group),
	})).filter((row) => row.items.length > 0);

	return (
		<footer className="mt-16 border-t border-hairline">
			<div className="mx-auto w-full max-w-7xl px-3 py-12 lg:px-8">
				<div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
					<div>
						{/* Brand name — never translated. */}
						<p className="font-display text-sm uppercase tracking-[0.28em] text-ink">
							Shadow Garden
						</p>
						<p className="mt-3 max-w-xs font-sans text-xs leading-relaxed text-ink-mute">
							{t("tagline")}
						</p>
						<nav
							aria-label={t("siteNavLabel")}
							className="mt-5 flex flex-col gap-2 font-display text-[10px] uppercase tracking-[0.22em]"
						>
							{NAV.map((item) => (
								<Link
									key={item.href}
									href={item.href}
									className="text-ink-dim transition-colors hover:text-accent"
								>
									{item.label}
								</Link>
							))}
						</nav>
					</div>

					{groups.map(({ group, items }) => {
						const groupLabel = copy(
							`collectionGroups.${slugify(group)}`,
							group,
						);
						return (
							<nav key={group} aria-label={groupLabel}>
								<p className="font-display text-[10px] uppercase tracking-[0.22em] text-ink-mute">
									{groupLabel}
								</p>
								<ul className="mt-3 flex flex-col gap-2">
									{items.map((collection) => (
										<li key={collection.slug}>
											<Link
												href={collectionPath(collection)}
												className="font-sans text-xs text-ink-dim transition-colors hover:text-accent"
											>
												{copy(
													`collections.${collection.slug}.title`,
													collection.title,
												)}
											</Link>
										</li>
									))}
								</ul>
							</nav>
						);
					})}
				</div>
			</div>

			<div className="border-t border-hairline">
				{/* min-h-11 = the sidebar's pinned footer (py-3 + text-sm leading), so the
				    two bottom bars line up where they meet at the sidebar edge. */}
				<div className="mx-auto flex min-h-11 w-full max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-3 py-3 font-display text-[10px] uppercase tracking-[0.22em] text-ink-mute lg:px-8">
					<span>{t("componentsAccent", { count: registry.length })}</span>
					{/* Brand name — never translated. */}
					<span>Shadow Garden</span>
				</div>
			</div>
		</footer>
	);
}
