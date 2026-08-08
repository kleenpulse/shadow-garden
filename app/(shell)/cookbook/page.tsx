import type { Metadata } from "next";
import { componentsByTerm } from "@/lib/registry";
import { COOKBOOK } from "@/lib/cookbook";
import CookbookBrowser, {
	type CookbookSectionRow,
} from "@/components/shell/CookbookBrowser";
// Client component, imported directly: `ssr: false` is illegal in a Server
// Component under Next 16, and the leaf already renders null until mounted.
import CookbookFlame from "@/components/shell/CookbookFlame";
import GotoTop from "@/components/miscellaneous/goto-top";
import PageBottomBlur from "@/components/landing/PageBottomBlur";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema, glossarySchema } from "@/lib/schema";
import { SITE_OG_IMAGE } from "@/lib/seo";

// The site's strongest long-tail asset: ~93 definition queries on one page. The
// title leads with what people actually type ("animation glossary"), not the
// in-house name for it.
const TITLE = "Web Animation Glossary — The Motion Cook Book";
const DESCRIPTION =
	"The precise name for every web animation — stagger, rubber-banding, origin-aware, spring damping, easing, scrub. Every term defined, and wherever the bench can show you one running, a link straight to a live, tunable demo.";

export const metadata: Metadata = {
	title: TITLE,
	description: DESCRIPTION,
	alternates: { canonical: "/cookbook" },
	openGraph: {
		title: TITLE,
		description: DESCRIPTION,
		url: "/cookbook",
		type: "article",
		images: [SITE_OG_IMAGE],
	},
	twitter: {
		card: "summary_large_image",
		title: TITLE,
		description: DESCRIPTION,
		images: [SITE_OG_IMAGE.url],
	},
};

// Static: no cookie read, no URL read, no request-time data. The filter is a
// client leaf holding local state, so this whole page prerenders.
export default function CookbookPage() {
	const byTerm = componentsByTerm();

	const sections: CookbookSectionRow[] = COOKBOOK.map((section) => ({
		title: section.title,
		blurb: section.blurb,
		terms: section.terms.map((t) => ({
			term: t.term,
			description: t.description,
			components: (byTerm.get(t.term) ?? []).map((entry) => ({
				slug: entry.slug,
				name: entry.name,
			})),
		})),
	}));

	const total = sections.reduce((n, s) => n + s.terms.length, 0);
	const covered = sections.reduce(
		(n, s) => n + s.terms.filter((t) => t.components.length > 0).length,
		0,
	);

	return (
		<div className="mx-auto max-w-7xl ">
			{/* DefinedTermSet, not FAQPage: Google retired FAQ rich results for
			    non-government/health sites in 2023, and a glossary is a term set. This
			    is also the shape AI-search extractors read a definition out of. */}
			<JsonLd
				data={[
					glossarySchema(),
					breadcrumbSchema([
						{ name: "Home", path: "/" },
						{ name: "Motion Cook Book", path: "/cookbook" },
					]),
				]}
			/>
			<CookbookFlame />
			<PageBottomBlur className="lg:hidden" />
			<GotoTop />

			<header className="mb-4 md:mb-10">
				<p className="font-display text-[11px] uppercase tracking-[0.25em] text-ink-mute">
					Reference
				</p>
				<h1 className="mt-2 font-display text-3xl uppercase tracking-[0.08em] text-ink">
					Motion Cook Book
				</h1>
				<p className="mt-3 max-w-xl font-sans text-xs md:text-sm text-ink-dim">
					The exact word for the thing you can picture but can&apos;t name.
					Every term a designer, a brief, or a prompt might use — and wherever
					the bench can show you one running, a link straight to it.
				</p>
				<p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-mute">
					{covered} of {total} terms demonstrated live
				</p>
			</header>

			<CookbookBrowser sections={sections} />
		</div>
	);
}
