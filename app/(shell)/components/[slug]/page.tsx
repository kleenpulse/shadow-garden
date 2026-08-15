import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllSlugs, getEntry } from "@/lib/registry";
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
import {
	ComponentHeader,
	InstallHeading,
	PropsHeading,
} from "./_components/detail-client";

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
			<ComponentHeader entry={entry} />

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
				<InstallHeading />
				<InstallBlock entry={entry} />
			</section>

			<section className="space-y-3">
				<PropsHeading />
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
