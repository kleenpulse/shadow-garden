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
import InstallSection from "@/components/shell/InstallSection";
import PropsSection from "@/components/shell/PropsSection";
import {
	ComponentHeader,
	InstallHeading,
	PropsHeading,
} from "./_components/detail-client";

// Navigation into this route is allowed to block. The page awaits `params`
// at the top to pick the registry entry, which ties its shell to one URL and
// trips the partial-prefetching check on every load in dev. The documented fix
// is to move that read into an async child under <Suspense>, but that child
// would be an async server layer above LiveWorkspace, and that corrupts Flight
// decode on soft navigation here. Every slug is still prerendered by
// generateStaticParams below.
//
// Paired with `instant = true` in app/layout.tsx. On its own this `false`
// would also switch off the build's static-shell check for the route; the
// root `true` keeps it on. Do not remove one without the other.
export const instant = false;

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
		// The Markdown twin is the agent brief (next.config.ts rewrites it to
		// app/api/agent/component/[slug]), so an agent on this page can find it.
		alternates: { canonical: url, types: { "text/markdown": `${url}.md` } },
		openGraph: { title, description, url, type: "article" },
		twitter: { card: "summary_large_image", title, description },
	};
}

function PanelSkeleton() {
	return (
		<div className="min-h-[220px] animate-pulse rounded-lg bg-panel" />
	);
}

// Matches the Copy Prompt button's footprint so the tab row doesn't jump when
// the control streams in.
function PromptButtonSkeleton() {
	return (
		<div className="h-8 w-38 shrink-0 animate-pulse rounded-md bg-panel" />
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
			{/* LiveWorkspace must stay a DIRECT child here — an async server
			    component wrapping it corrupts Flight decode on client-side nav
			    (chunk.reason.enqueueModel, Next 16.3.5 + Cache Components). */}
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

			{/* Everything below derives from the registry entry alone — no cookie
			    read, no URL read — so it renders into the static shell. */}
			<section className="space-y-3">
				<InstallHeading />
				<InstallSection entry={entry} />
			</section>

			<section className="space-y-3">
				<PropsHeading />
				<PropsSection entry={entry} />
			</section>

			<DemonstratedTerms entry={entry} />
			<RelatedComponents entry={entry} />
			<AppearsIn entry={entry} />
		</article>
	);
}
