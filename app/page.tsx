import LandingHeader from "@/components/landing/LandingHeader";
import { buildLandingData, SECTION_IDS } from "@/components/landing/data";
import HeroVariantGate from "@/components/landing/HeroVariantGate";
import { heroVariantInitScript } from "@/lib/hero-variant";
import ManifestoMarquee from "@/components/landing/ManifestoMarquee";
import Reveal from "@/components/landing/Reveal";
import TuningProof from "@/components/landing/TuningProof";
import ProSection from "@/components/landing/ProSection";
import LandingFooter from "@/components/landing/LandingFooter";
import SmoothScroll from "@/components/landing/SmoothScroll";
import SectionRail from "@/components/landing/SectionRail";
import PageBottomBlur from "@/components/landing/PageBottomBlur";
import GotoTop from "@/components/miscellaneous/goto-top";
import JsonLd from "@/components/seo/JsonLd";
import { productSchema } from "@/lib/schema";
import {
	ArchiveSection,
	CalibrationIntro,
	ExhibitSections,
} from "./_components/landing-sections";
import type { Metadata } from "next";

// Title + description come from the root layout's defaults; only the canonical is
// the page's own. Declared here rather than on the layout — see the note there.
export const metadata: Metadata = {
	alternates: { canonical: "/" },
};

export default function Home() {
	const data = buildLandingData();

	return (
		<main className="relative w-full overflow-x-clip">
			{/* Pre-paint: stamp html[data-sg-hero] from ?v= so the hero's mode
			    toggle paints its active state on the first frame. A pure string
			    from a static whitelist, so the page stays prerendered — the
			    variant is never read from searchParams. */}
			<script dangerouslySetInnerHTML={{ __html: heroVariantInitScript() }} />
			<JsonLd data={productSchema()} />
			<div id="hero" />
			<SmoothScroll />
			<GotoTop />
			<SectionRail sections={data.navSections} />
			<PageBottomBlur />

			<LandingHeader />

			{/* Hero plus, in the scroll variants, the fixed cube traveler that
			    rides the whole page behind the content. The gate decides the
			    variant on the client so `/` stays static. */}
			<HeroVariantGate stats={data.stats} hero={data.hero} />

			<ManifestoMarquee />

			{/* The four category exhibits — copy lives in the client island so it can
			    go through next-intl; the data is still computed server-side above. */}
			<ExhibitSections
				exhibits={data.exhibits}
				spotlightAccent={data.spotlightAccent}
			/>

			{/* ε — Calibration: the "tunable" promise, proven with real dials. */}
			<section
				id={SECTION_IDS.calibration}
				className="mx-auto w-full max-w-landing scroll-mt-10 px-3 py-14 sm:px-6 sm:py-24"
			>
				<Reveal>
					<CalibrationIntro />
				</Reveal>
				<Reveal delay={0.1} className="mt-10">
					<TuningProof tuning={data.tuning} />
				</Reveal>
			</section>

			{/* ζ — The archive, open. Static graphite ground in both themes,
          so text uses the static bench ramp (same rule as the code surface). */}
			<div id={SECTION_IDS.sealed} className="scroll-mt-10">
				<ProSection raysColor={data.raysColor}>
					<ArchiveSection
						total={data.stats.total}
						entries={data.archiveEntries}
					/>
				</ProSection>
			</div>

			<LandingFooter stats={data.stats} exhibits={data.exhibits} />
		</main>
	);
}
