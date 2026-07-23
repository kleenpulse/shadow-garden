import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllSlugs, getEntry } from "@/lib/registry";
import { cn, displayName } from "@/lib/utils";
import LiveWorkspace from "@/components/shell/LiveWorkspace";
import CodePanel from "@/components/shell/CodePanel";
import InstallSection from "@/components/shell/InstallSection";
import PropsTable from "@/components/shell/PropsTable";
import TierBadge from "@/components/shell/TierBadge";
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
	return { title: entry.name, description: entry.description };
}

function PanelSkeleton() {
	return (
		<div className="min-h-[220px] animate-pulse rounded-lg border border-hairline bg-panel" />
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

	return (
		<article className="mx-auto max-w-7xl space-y-8">
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
			</header>

			{/* The workspace reads tuned values from the URL (nuqs) — dynamic under
          Cache Components, so it streams as a hole in the static shell. The Code
          tab's gated source (also dynamic) is rendered server-side and passed in. */}
			<Suspense fallback={<PanelSkeleton />}>
				<LiveWorkspace
					entry={entry}
					code={
						<Suspense fallback={<PanelSkeleton />}>
							<CodePanel entry={entry} />
						</Suspense>
					}
				/>
			</Suspense>

			<section className="space-y-3">
				<h2 className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute">
					Install
				</h2>
				<Suspense
					fallback={
						<div className="h-20 animate-pulse rounded-lg border border-hairline bg-panel" />
					}
				>
					<InstallSection entry={entry} />
				</Suspense>
			</section>

			<section className="space-y-3">
				<h2 className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute">
					Props
				</h2>
				<PropsTable entry={entry} />
			</section>
		</article>
	);
}
