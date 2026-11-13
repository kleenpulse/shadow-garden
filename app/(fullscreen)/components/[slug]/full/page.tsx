import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllSlugs, getEntry, getNeighbors } from "@/lib/registry";
import { metaText } from "@/lib/seo";
import FullscreenStage from "@/components/shell/FullscreenStage";
import { isControlsLocked } from "@/lib/registry/entitlement";

// Navigation into this route is allowed to block. The page awaits `params`
// at the top to pick the registry entry, which ties its shell to one URL and
// trips the partial-prefetching check on every load in dev. The documented fix
// is to move that read into an async child under <Suspense>, but that child
// would be an async server layer above FullscreenStage, and that corrupts Flight
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
