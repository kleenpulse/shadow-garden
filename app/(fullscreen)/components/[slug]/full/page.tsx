import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllSlugs, getEntry } from "@/lib/registry";
import FullscreenSection from "@/components/shell/FullscreenSection";

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
	return { title: `${entry.name} — Fullscreen`, description: entry.description };
}

export default async function FullscreenPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	// Next 16: params is a Promise and must be awaited.
	const { slug } = await params;
	const entry = getEntry(slug);
	if (!entry) notFound();

	return (
		// The stage reads tuned values from the URL (nuqs) — dynamic under Cache
		// Components, so it streams as the one hole in the static shell.
		<Suspense fallback={<div className="h-dvh animate-pulse bg-panel" />}>
			<FullscreenSection entry={entry} />
		</Suspense>
	);
}
