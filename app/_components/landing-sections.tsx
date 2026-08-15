"use client";

// String-bearing slices of the landing page, extracted so the page itself can
// stay a server component (metadata, PPR) while the copy goes through
// next-intl's client-provider hooks. Data still arrives as the serializable
// objects buildLandingData produces server-side.

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useDataCopy } from "@/lib/i18n/data-copy";
import {
	anchorFor,
	type LandingExhibit,
} from "@/components/landing/data";
import type { Category } from "@/lib/registry/types";
import SpecimenPlate from "@/components/landing/SpecimenPlate";
import Reveal from "@/components/landing/Reveal";
import SpotlightList from "@/components/landing/SpotlightList";
import AlphaExhibit from "@/components/landing/exhibits/AlphaExhibit";
import BetaExhibit from "@/components/landing/exhibits/BetaExhibit";
import GammaExhibit from "@/components/landing/exhibits/GammaExhibit";
import DeltaExhibit from "@/components/landing/exhibits/DeltaExhibit";

// Each index shows a curated few — the full catalog lives at /components.
// γ counts in cards on a two-column grid, so its cap keeps the rows even.
const LIST_LIMIT = 5;
const CARD_LIMIT = 6;

export function ExhibitSections({
	exhibits,
	spotlightAccent,
}: {
	exhibits: LandingExhibit[];
	spotlightAccent: string;
}) {
	const t = useTranslations("pages.landing");
	const copy = useDataCopy();
	const categoryName = (category: Category) =>
		copy(`pages.categories.${anchorFor(category)}`, category);

	// How many specimens a section actually shows — γ renders cards, everyone
	// else renders the list. Drives the "All N …" overflow link.
	const shownFor = (exhibit: LandingExhibit) =>
		exhibit.category === "Micro-interactions" ? CARD_LIMIT : LIST_LIMIT;

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
						items={exhibit.entries.slice(0, CARD_LIMIT).map((entry) => ({
							...entry,
							description: copy(
								`catalog.${entry.slug}.description`,
								entry.description,
							),
						}))}
						accentColor={spotlightAccent}
					/>
				);
			case "Power-User Systems":
				return (
					<DeltaExhibit
						groups={exhibits.map((group) => ({
							id: anchorFor(group.category),
							heading: categoryName(group.category),
							commands: group.entries.map((entry) => ({
								id: entry.slug,
								label: t("openCommand", { name: entry.name }),
							})),
						}))}
					/>
				);
		}
	};

	return (
		<>
			{exhibits.map((exhibit) => (
				<section
					key={exhibit.category}
					id={anchorFor(exhibit.category)}
					className="mx-auto w-full max-w-7xl scroll-mt-10 px-3 py-14 lg:px-6 sm:py-24"
				>
					<Reveal>
						<SpecimenPlate
							greek={exhibit.greek}
							index={exhibit.index}
							label={categoryName(exhibit.category)}
							meta={t("unitsMeta", { count: exhibit.entries.length })}
						/>
						<div className="mt-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
							<h2 className="font-display text-3xl uppercase tracking-[0.04em] text-ink sm:text-4xl">
								{/* normal-case: uppercase would turn α into Α (reads as Latin A) */}
								<span className="normal-case text-accent">{exhibit.greek}</span>
								<span aria-hidden> · </span>
								{categoryName(exhibit.category)}
							</h2>
							<p className="max-w-xs font-sans text-sm text-ink-dim">
								{copy(
									`pages.landing.blurbs.${anchorFor(exhibit.category)}`,
									exhibit.blurb,
								)}
							</p>
						</div>
					</Reveal>

					<Reveal delay={0.1} className="mt-10">
						{exhibitFor(exhibit)}
					</Reveal>

					{/* The category index — a curated few, the rest one click away.
              γ skips the list: its spotlight cards above ARE the index, so it
              carries only the overflow link. */}
					{exhibit.category === "Micro-interactions" ? null : (
						<SpotlightList
							className="mt-10"
							items={exhibit.entries.slice(0, LIST_LIMIT).map((entry) => ({
								slug: entry.slug,
								name: entry.name,
							}))}
						/>
					)}

					{exhibit.entries.length > shownFor(exhibit) && (
						<Link
							href="/components"
							className="mt-6 inline-block font-display text-[10px] uppercase tracking-[0.22em] text-ink-mute transition-colors hover:text-accent"
						>
							{t("allInCategory", {
								count: exhibit.entries.length,
								category: categoryName(exhibit.category),
							})}
						</Link>
					)}
				</section>
			))}
		</>
	);
}

export function CalibrationIntro() {
	const t = useTranslations("pages.landing.calibration");
	return (
		<>
			<SpecimenPlate greek="ε" index="05" label={t("label")} meta={t("meta")} />
			<div className="mt-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
				<h2 className="font-display text-3xl uppercase tracking-[0.04em] text-ink sm:text-4xl">
					<span className="normal-case text-accent">ε</span>
					<span aria-hidden> · </span>
					{t("label")}
				</h2>
				<p className="max-w-xs font-sans text-sm text-ink-dim">{t("blurb")}</p>
			</div>
		</>
	);
}

export function ArchiveSection({
	total,
	entries,
}: {
	total: number;
	entries: Array<{ slug: string; name: string; category: Category }>;
}) {
	const t = useTranslations("pages.landing");
	const copy = useDataCopy();

	return (
		<div className="mx-auto w-full max-w-7xl px-3 py-14 sm:px-6 sm:py-28">
			<div className="flex items-baseline justify-between gap-1.5 whitespace-nowrap border-y border-bench-700 py-2 font-display text-[9px] uppercase tracking-widest text-bench-500 sm:justify-start sm:gap-3 sm:text-[10px] sm:tracking-[0.28em]">
				<span className="text-[#a855f7]">
					{t("archive.plate")} <span className="normal-case">ζ</span>-06
				</span>
				<span aria-hidden>·</span>
				<span className="text-bench-400">{t("archive.openArchive")}</span>
				<span aria-hidden>·</span>
				<span>{t("unitsMeta", { count: total })}</span>
			</div>
			<h2 className="mt-10 max-w-2xl font-display text-3xl uppercase leading-tight tracking-[0.04em] text-bench-100 sm:text-5xl">
				{t("archive.headline")}
			</h2>
			<p className="mt-6 max-w-xl font-sans text-sm leading-relaxed text-bench-300">
				{t("archive.body")}
			</p>
			{/* Newest first, curated few — the full catalog is one click away. */}
			<SpotlightList
				variant="sealed"
				className="mt-10"
				items={entries.slice(0, LIST_LIMIT).map((entry) => ({
					slug: entry.slug,
					name: entry.name,
					tag: copy(
						`pages.categories.${anchorFor(entry.category)}`,
						entry.category,
					),
				}))}
			/>
			<Link
				href="/components"
				className="mt-10 inline-block rounded-md bg-[#a855f7] px-5 py-2.5 font-display text-[11px] uppercase tracking-[0.15em] text-bench-950 transition-opacity hover:opacity-90"
			>
				{t("archive.cta")}
			</Link>
		</div>
	);
}
