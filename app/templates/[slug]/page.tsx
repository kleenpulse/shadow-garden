import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEntry, registry } from "@/lib/registry";
import { loadTemplateRoot } from "@/components/registry/template-roots";
import { tokensFromParams } from "@/lib/templates/tokens";
import TokenBridge from "@/components/shell/token-bridge";

// The bare stage a landing-page template renders on, and the thing the bench
// iframes (SPEC §C13). No sidebar, no top bar, no bench chrome — a template is a
// whole page, and wrapping it in one would misrepresent what the buyer gets.
//
// Deliberately outside the (shell) and (fullscreen) route groups: both add
// furniture this route exists to omit.

type Params = Promise<{ slug: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export function generateStaticParams() {
	const params = registry
		.filter((entry) => entry.kind === "template")
		.map((entry) => ({ slug: entry.slug }));
	// Cache Components rejects an empty return. While Landing Pages is hidden in
	// production (see the registry barrel) the route keeps one sentinel path,
	// which the getEntry miss below renders as a 404 — and the sentinel vanishes
	// on its own the moment the hide comes off and real params exist again.
	return params.length > 0 ? params : [{ slug: "hidden" }];
}

export async function generateMetadata({
	params,
}: {
	params: Params;
}): Promise<Metadata> {
	const { slug } = await params;
	const entry = getEntry(slug);
	if (!entry) return {};
	return {
		title: `${entry.name} — Template`,
		description: entry.description,
		// Same reasoning as the fullscreen stage: this URL is a render surface, not
		// a document. Indexing it would put a second, chrome-less copy of every
		// template in the index, competing with the page that actually sells it.
		robots: { index: false, follow: true },
		alternates: { canonical: `/components/${slug}` },
	};
}

/**
 * The dynamic half. Reading `searchParams` is what makes this uncacheable under
 * Cache Components, so it lives below a Suspense boundary rather than in the page
 * — otherwise the whole route is blocked from prerendering and every template
 * request pays for a cold render of the shell as well as the page.
 */
async function Skin({
	slug,
	searchParams,
	children,
}: {
	slug: string;
	searchParams: Search;
	children: React.ReactNode;
}) {
	// First paint reads the tokens off the URL so an embedded frame never flashes
	// the defaults before the parent's first message lands.
	const values = tokensFromParams(await searchParams);
	return (
		<TokenBridge slug={slug} initial={values}>
			{children}
		</TokenBridge>
	);
}

export default async function TemplatePage({
	params,
	searchParams,
}: {
	params: Params;
	searchParams: Search;
}) {
	// Next 16: params is a Promise and must be awaited. generateStaticParams above
	// is what keeps this read static rather than dynamic.
	const { slug } = await params;
	const entry = getEntry(slug);
	if (!entry || entry.kind !== "template") notFound();

	const Root = await loadTemplateRoot(slug);
	if (!Root) notFound();

	return (
		<Suspense fallback={<div className="min-h-dvh" />}>
			<Skin slug={slug} searchParams={searchParams}>
				<Root />
			</Skin>
		</Suspense>
	);
}
