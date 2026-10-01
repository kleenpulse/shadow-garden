import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllSlugs, getEntry, getNeighbors } from "@/lib/registry";
import { metaText } from "@/lib/seo";
import FullscreenStage from "@/components/shell/FullscreenStage";
import { isControlsLocked } from "@/lib/registry/entitlement";

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
	return {
		title: `${entry.name} :: Fullscreen`,
		description: metaText(entry.description),

		robots: { index: false, follow: true },
		alternates: { canonical: `/components/${slug}/full` },
	};
}

export default async function FullscreenPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const entry = getEntry(slug);
	if (!entry) notFound();

	const neighbors = getNeighbors(slug);

	// Direct child + promise-shaped gate for the same Flight soft-nav reason as
	// the shell page — never wrap the stage in an async server layer.
	return (
		<Suspense fallback={<div className="h-dvh animate-pulse bg-panel" />}>
			<FullscreenStage
				entry={entry}
				neighbors={neighbors}
				controlsLocked={isControlsLocked(entry.pro)}
			/>
		</Suspense>
	);
}
