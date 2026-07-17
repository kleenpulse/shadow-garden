import Link from "next/link";
import LandingHeader from "@/components/landing/LandingHeader";
import {
	anchorFor,
	buildLandingData,
	type LandingExhibit,
} from "@/components/landing/data";
import LandingHero from "@/components/landing/LandingHero";
import ManifestoMarquee from "@/components/landing/ManifestoMarquee";
import SpecimenPlate from "@/components/landing/SpecimenPlate";
import Reveal from "@/components/landing/Reveal";
import AlphaExhibit from "@/components/landing/exhibits/AlphaExhibit";
import BetaExhibit from "@/components/landing/exhibits/BetaExhibit";
import GammaExhibit from "@/components/landing/exhibits/GammaExhibit";
import DeltaExhibit from "@/components/landing/exhibits/DeltaExhibit";
import TuningProof from "@/components/landing/TuningProof";
import ProSection from "@/components/landing/ProSection";
import LandingFooter from "@/components/landing/LandingFooter";
import SmoothScroll from "@/components/landing/SmoothScroll";
import SpotlightList from "@/components/landing/SpotlightList";
import GotoTop from "@/components/miscellaneous/goto-top";

export default function Home() {
	const data = buildLandingData();

	// Live exhibit per category — the page is built from the components it sells.
	const exhibitFor = (exhibit: LandingExhibit) => {
		switch (exhibit.category) {
			case "Backgrounds":
				return <AlphaExhibit />;
			case "Text Animations":
				return <BetaExhibit words={exhibit.entries.map((e) => e.name)} />;
			case "Micro-interactions":
				return (
					<GammaExhibit
						items={exhibit.entries}
						accentColor={data.spotlightAccent}
					/>
				);
			case "Power-User Systems":
				return (
					<DeltaExhibit
						groups={data.exhibits.map((group) => ({
							id: anchorFor(group.category),
							heading: group.category,
							commands: group.entries.map((entry) => ({
								id: entry.slug,
								label: `Open ${entry.name}`,
							})),
						}))}
					/>
				);
		}
	};

	return (
		<main className="relative w-full">
			<div id="hero" />
			<SmoothScroll />
			<GotoTop />

			<LandingHeader />

			<LandingHero stats={data.stats} hero={data.hero} />

			<ManifestoMarquee />

			{data.exhibits.map((exhibit) => (
				<section
					key={exhibit.category}
					id={anchorFor(exhibit.category)}
					className="mx-auto w-full max-w-7xl scroll-mt-10 px-6 py-20 sm:py-24"
				>
					<Reveal>
						<SpecimenPlate
							greek={exhibit.greek}
							index={exhibit.index}
							label={exhibit.category}
							meta={`${exhibit.entries.length} ${exhibit.entries.length === 1 ? "unit" : "units"}`}
						/>
						<div className="mt-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
							<h2 className="font-display text-3xl uppercase tracking-[0.04em] text-ink sm:text-4xl">
								{/* normal-case: uppercase would turn α into Α (reads as Latin A) */}
								<span className="normal-case text-accent">{exhibit.greek}</span>
								<span aria-hidden> · </span>
								{exhibit.category}
							</h2>
							<p className="max-w-xs font-sans text-sm text-ink-dim">
								{exhibit.blurb}
							</p>
						</div>
					</Reveal>

					<Reveal delay={0.1} className="mt-10">
						{exhibitFor(exhibit)}
					</Reveal>

					{/* The category index — every specimen catalogued, live one included.
              γ skips it: the spotlight cards above already carry the full index. */}
					{exhibit.category === "Micro-interactions" ? null : (
						<SpotlightList
							className="mt-10"
							items={exhibit.entries.map((entry) => ({
								slug: entry.slug,
								name: entry.name,
								tag: entry.tier,
								tagTone: entry.tier === "pro" ? "accent" : "default",
							}))}
						/>
					)}
				</section>
			))}

			{/* ε — Calibration: the "tunable" promise, proven with real dials. */}
			<section className="mx-auto w-full max-w-7xl px-6 py-20 sm:py-24">
				<Reveal>
					<SpecimenPlate
						greek="ε"
						index="05"
						label="Calibration"
						meta="2 dials"
					/>
					<div className="mt-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
						<h2 className="font-display text-3xl uppercase tracking-[0.04em] text-ink sm:text-4xl">
							<span className="normal-case text-accent">ε</span>
							<span aria-hidden> · </span>
							Calibration
						</h2>
						<p className="max-w-xs font-sans text-sm text-ink-dim">
							Every dial is real. Turn one.
						</p>
					</div>
				</Reveal>
				<Reveal delay={0.1} className="mt-10">
					<TuningProof tuning={data.tuning} />
				</Reveal>
			</section>

			{/* ζ — Sealed archive: pro tier. Static graphite ground in both themes,
          so text uses the static bench ramp (same rule as the code surface). */}
			<ProSection raysColor={data.hero.color}>
				<div className="mx-auto w-full max-w-7xl px-6 py-20 sm:py-28">
					<div className="flex items-baseline gap-3 border-y border-bench-700 py-2 font-display text-[10px] uppercase tracking-[0.28em] text-bench-500">
						<span className="text-[#a855f7]">
							Plate <span className="normal-case">ζ</span>-06
						</span>
						<span aria-hidden>·</span>
						<span className="text-bench-400">Sealed archive</span>
						<span aria-hidden>·</span>
						<span>{data.stats.pro} units</span>
					</div>
					<h2 className="mt-10 max-w-2xl font-display text-3xl uppercase leading-tight tracking-[0.04em] text-bench-100 sm:text-5xl">
						Some source stays in shadow.
					</h2>
					<p className="mt-6 max-w-xl font-sans text-sm leading-relaxed text-bench-300">
						Free specimens ship with full source. Pro specimens render live on
						this page — the implementation stays sealed until you hold the key.
					</p>
					<SpotlightList
						variant="sealed"
						className="mt-10"
						items={data.proEntries.map((entry) => ({
							slug: entry.slug,
							name: entry.name,
							tag: entry.category,
						}))}
					/>
					<Link
						href="/components"
						className="mt-10 inline-block rounded-md bg-[#a855f7] px-5 py-2.5 font-display text-[11px] uppercase tracking-[0.15em] text-bench-950 transition-opacity hover:opacity-90"
					>
						Unlock pro source
					</Link>
				</div>
			</ProSection>

			<LandingFooter stats={data.stats} exhibits={data.exhibits} />
		</main>
	);
}
