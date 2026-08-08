import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllSlugs, getEntry } from "@/lib/registry";
import { termAnchor } from "@/lib/cookbook";
import { cn } from "@/lib/utils";
import { displayName } from "@/lib/display-name";
import { entryDescription, entryPath, entryTitle } from "@/lib/seo";
import {
	breadcrumbSchema,
	componentSchema,
	type Crumb,
} from "@/lib/schema";
import JsonLd from "@/components/seo/JsonLd";
import Breadcrumbs from "@/components/shell/Breadcrumbs";
import DemonstratedTerms from "@/components/shell/DemonstratedTerms";
import RelatedComponents from "@/components/shell/RelatedComponents";
import AppearsIn from "@/components/shell/AppearsIn";
import LiveWorkspace from "@/components/shell/LiveWorkspace";
import CodePanel from "@/components/shell/CodePanel";
import PromptButton from "@/components/shell/PromptButton";
import InstallBlock from "@/components/shell/InstallBlock";
import PropsTable from "@/components/shell/PropsTable";
import TierBadge from "@/components/shell/TierBadge";
import NewBadge from "@/components/shell/NewBadge";
import FavoriteButton from "@/components/shell/FavoriteButton";

export function generateStaticParams() {
	return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string }>;
}): Promise<Metadata> {
	const { slug } = await params;
	const entry = getEntry(slug);
	if (!entry) return {};

	const title = entryTitle(entry);
	const description = entryDescription(entry);
	const url = entryPath(entry);

	return {
		title,
		description,
		// The workspace writes tuned prop values into the URL via nuqs, so every
		// shared "here's how I set it" link is a distinct crawlable URL. This is what
		// collapses them back onto one page.
		alternates: { canonical: url },
		openGraph: { title, description, url, type: "article" },
		twitter: { card: "summary_large_image", title, description },
	};
}

function PanelSkeleton() {
	return (
		<div className="min-h-[220px] animate-pulse rounded-lg border border-hairline bg-panel" />
	);
}

// Matches the Copy Prompt button's footprint so the tab row doesn't jump when
// the gated control streams in.
function PromptButtonSkeleton() {
	return (
		<div className="h-8 w-38 shrink-0 animate-pulse rounded-md border border-hairline bg-panel" />
	);
}

export default async function ComponentPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	// Next 16: params is a Promise and must be awaited.
	const { slug } = await params;
	const entry = getEntry(slug);
	if (!entry) notFound();

	const trail: Crumb[] = [
		{ name: "Home", path: "/" },
		{ name: "Components", path: "/components" },
		{ name: entry.category, path: "/components" },
		{ name: displayName(entry.name), path: entryPath(entry) },
	];

	return (
		<article className="mx-auto max-w-7xl space-y-8">
			<JsonLd data={[componentSchema(entry), breadcrumbSchema(trail)]} />
			<Breadcrumbs trail={trail} />
			<header className="border-b border-hairline pb-6">
				<p className="font-display text-[11px] uppercase tracking-[0.22em] text-ink-mute">
					{entry.category}
				</p>
				<div className="mt-2 flex flex-wrap items-center gap-3">
					<h1
						className={cn(
							"font-display text-2xl uppercase tracking-[0.08em]",
							entry.slug === "grainient" ? "text-grainient" : "text-ink",
						)}
					>
						{displayName(entry.name)}
					</h1>
					<NewBadge addedAt={entry.addedAt} />
					<TierBadge tier={entry.tier} />
					<FavoriteButton
						slug={entry.slug}
						name={entry.name}
						iconSize={18}
						className="border border-hairline"
					/>
				</div>
				<p className="mt-3 max-w-2xl font-sans text-sm text-ink-dim">
					{entry.description}
				</p>

				{entry.attribution && (
					<p className="mt-2 font-mono text-[11px] text-ink-mute">
						Adapted from{" "}
						<a
							href={entry.attribution.url}
							target="_blank"
							rel="noreferrer"
							className="text-ink-dim underline decoration-hairline underline-offset-2 transition-colors hover:text-accent hover:decoration-current"
						>
							{entry.attribution.name}
						</a>
						<span aria-hidden> ↗</span>
					</p>
				)}

				{/* The motion terms this component demonstrates, each linking to its
				    definition. Declared on the entry; /cookbook inverts the mapping. */}
				{entry.cookbook && entry.cookbook.length > 0 && (
					<div className="mt-4 flex flex-wrap items-center gap-1.5">
						<span className="font-display text-[9px] uppercase tracking-[0.2em] text-ink-mute">
							Cook Book
						</span>
						{entry.cookbook.map((term) => (
							<Link
								key={term}
								href={`/cookbook#${termAnchor(term)}`}
								className="rounded-full border border-hairline px-2.5 py-1 font-sans text-xs text-ink-dim transition-colors hover:border-accent-muted hover:text-accent"
							>
								{term}
							</Link>
						))}
					</div>
				)}
			</header>

			{/* The workspace reads tuned values from the URL (nuqs) — dynamic under
          Cache Components, so it streams as a hole in the static shell. The Code
          tab's source and the Copy Prompt control are rendered server-side and
          passed in. */}
			<Suspense fallback={<PanelSkeleton />}>
				<LiveWorkspace
					entry={entry}
					code={
						<Suspense fallback={<PanelSkeleton />}>
							<CodePanel entry={entry} />
						</Suspense>
					}
					promptSlot={
						<Suspense fallback={<PromptButtonSkeleton />}>
							<PromptButton entry={entry} />
						</Suspense>
					}
				/>
			</Suspense>

			<section className="space-y-3">
				<h2 className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute">
					Install
				</h2>
				<InstallBlock entry={entry} />
			</section>

			<section className="space-y-3">
				<h2 className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute">
					Props
				</h2>
				<PropsTable entry={entry} />
			</section>

			{/* Both derived from the registry entry — no cookie read, no URL read, so
			    they render into the static shell instead of behind a boundary. */}
			<DemonstratedTerms entry={entry} />
			<RelatedComponents entry={entry} />
			<AppearsIn entry={entry} />
		</article>
	);
}
