"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { termAnchor } from "@/lib/cookbook";
import {
	buildSearchIndex,
	searchCookbook,
	type Suggestion,
} from "@/lib/cookbook-search";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { useScrollSpy } from "@/hooks/use-scroll-spy";
// Imported, not forked. It packs synchronously in a layout effect, which runs
// before this component's passive jump effect — so the scroll below always
// measures final geometry (§V27, §V31).
import Masonry, {
	settleMasonryReveal,
} from "@/components/registry/masonry/Masonry";
import CookbookFilter from "./CookbookFilter";
import CookbookSectionNav from "./CookbookSectionNav";
import TierBadge from "./TierBadge";

// Where an anchored heading has to come to rest. Two sticky layers are stacked
// above it, not one: the shell's TopBar, and this page's own filter bar parked
// under it at `top-10` / `sm:top-14`. The stop is that bar's *bottom* edge — its
// own top (40 / 56) plus its height (~50) = 90 below `sm`, 106 above — rounded up
// to the next spacing step. Reserving only the TopBar hides the heading behind
// the filter.
const ANCHOR_STOP = "scroll-mt-24 sm:scroll-mt-28"; // 96px / 112px

// Travel that gets animated, as a fraction of the viewport. Anything further
// than SMOOTH_MAX away is closed instantly first, leaving only APPROACH to
// animate.
//
// Long smooth scrolls are the jank, and it is not a frame-budget problem — this
// page is ~8700px tall, so a jump to the last section asks the browser to cover
// 7400px in the ~1.1s it allots. That is ~300px per frame at the peak of the
// easing curve: unreadable while it runs, and a single slow frame turns into a
// ~1900px lurch (measured: median step 30px, max step 1900px). Profiling the
// same jump with the reveal animation disabled and with the WebGL backdrop
// disabled produced identical numbers, so nothing on the page is at fault —
// the distance is.
//
// So don't travel it. Close the gap instantly to just short of the target and
// animate only the final screenful. Arrival still reads as movement, and the
// part the eye can actually follow is the only part that animates.
const SMOOTH_MAX = 1.4;
const APPROACH = 0.55;

function scrollToAnchor(el: HTMLElement, reduced: boolean) {
	// Before anything measures the target: a card mid-entrance is still
	// `revealDistance` low, and that offset is inside the box `scrollIntoView`
	// reads. Land on it un-settled and the card finishes rising afterwards,
	// carrying itself that far above its stop and back under the filter bar
	// (§B11's symptom). Settling first costs the target its own rise; every
	// other card still animates in around it.
	settleMasonryReveal(el);

	if (reduced) {
		el.scrollIntoView({ block: "start", behavior: "auto" });
		return;
	}

	const vh = window.innerHeight;
	const from = window.scrollY;
	const targetY = from + el.getBoundingClientRect().top;

	if (Math.abs(targetY - from) > vh * SMOOTH_MAX) {
		// Staged on the near side of the target so the animated leg still runs in
		// the direction of travel — landing past it and easing backwards reads as
		// an overshoot being corrected.
		const stage =
			targetY > from ? targetY - vh * APPROACH : targetY + vh * APPROACH;
		window.scrollTo({ top: Math.max(0, stage), behavior: "auto" });
	}

	// The browser owns the final leg, so `scroll-margin-top` still decides where
	// the heading comes to rest (§V28) — the staging above only has to get close.
	el.scrollIntoView({ block: "start", behavior: "smooth" });
}

// A hair below the deepest stop (112), never above it. A reading line shallower
// than the landing point would hand the rail straight back to the previous
// section the moment a jump settles.
const READING_LINE = 120;

// Only what the page needs crosses the boundary — the full ComponentEntry carries
// prop schemas and variant paths the glossary has no use for.
export interface CookbookComponentRef {
	slug: string;
	name: string;
	tier: "free" | "pro";
}

export interface CookbookTermRow {
	term: string;
	description: string;
	components: CookbookComponentRef[];
}

export interface CookbookSectionRow {
	title: string;
	blurb: string;
	terms: CookbookTermRow[];
}

// Local state, deliberately not nuqs: keeping the filter out of the URL keeps this
// page free of any URL read, which is what lets it prerender without a Suspense
// boundary under Cache Components.
export default function CookbookBrowser({
	sections,
}: {
	sections: CookbookSectionRow[];
}) {
	// Two values, not one. `query` is what is in the box and it drives the
	// suggestion popup; `committed` is what the card grid is actually filtered by
	// and only moves on an explicit commit (pick a suggestion, Enter, clear).
	//
	// Splitting them is not a nicety. While the popup is open the grid must hold
	// still: a suggestion click has to scroll to a card, and a list that reflows
	// underneath the scroll sends it to the wrong offset (§B10).
	const [query, setQuery] = useState("");
	const [committed, setCommitted] = useState("");

	// Normalized once, at mount. Every keystroke after that is a handful of
	// indexOf calls over ~140 short strings, which is why nothing here is debounced.
	const index = useMemo(() => buildSearchIndex(sections), [sections]);
	const result = useMemo(() => searchCookbook(index, query), [index, query]);
	const gridResult = useMemo(
		() => searchCookbook(index, committed),
		[index, committed],
	);

	// No useDeferredValue here, deliberately. The grid now re-renders only on a
	// discrete commit rather than per keystroke, so there is nothing left to
	// smooth — and a deferred render is exactly what used to leave the jump effect
	// measuring a layout that was one frame from changing (§V27).
	const filtered = useMemo(() => {
		const matched = gridResult.matchedTerms;
		// null means "no query" — which is not the same as an empty set.
		if (!matched) return sections;
		return sections
			.map((section) => ({
				...section,
				terms: section.terms.filter((row) => matched.has(row.term)),
			}))
			.filter((section) => section.terms.length > 0);
	}, [sections, gridResult]);

	const shown = filtered.reduce((n, s) => n + s.terms.length, 0);

	// One list, two consumers: the `lg:` rail and the mobile pill below it. The
	// spy runs at every breakpoint now — the pill's readout is the whole point of
	// it on a phone.
	const navItems = useMemo(
		() =>
			filtered.map((section) => ({
				id: termAnchor(section.title),
				title: section.title,
			})),
		[filtered],
	);
	const sectionIds = useMemo(() => navItems.map((s) => s.id), [navItems]);

	const reduced = usePrefersReducedMotion();
	const { active, jumpTo } = useScrollSpy(sectionIds, READING_LINE);

	// --- Suggestion commit: set the query, then travel to the card. ---
	const pendingRef = useRef<{ anchor: string; sectionAnchor: string } | null>(
		null,
	);
	const [pendingTick, setPendingTick] = useState(0);
	const [pulse, setPulse] = useState<string | null>(null);

	const onSelect = (suggestion: Suggestion) => {
		// A section suggestion clears the query instead of setting it: committing
		// the title as a filter would hide the very section we are about to scroll
		// to unless one of its terms happened to contain it.
		const next = suggestion.kind === "section" ? "" : suggestion.label;
		setQuery(next);
		setCommitted(next);
		pendingRef.current = {
			anchor: suggestion.anchor,
			sectionAnchor: suggestion.sectionAnchor,
		};
		setPendingTick((n) => n + 1);
	};

	const onQueryChange = (next: string) => {
		// Typing abandons an in-flight jump, so a target that never materialised
		// can't fire against an unrelated later render.
		pendingRef.current = null;
		setQuery(next);
		// An empty box is unambiguous — no filter, no Enter needed. One rule covers
		// the clear button, the second Escape, and backspacing the last character.
		if (!next.trim()) setCommitted("");
	};

	// Enter with no popup to pick from. The only route to the empty state, and the
	// only way to filter on a description-only match ("perf" reaches Blur through
	// "imperfections", which never earns a suggestion row).
	const onCommitQuery = (value: string) => {
		pendingRef.current = null;
		setCommitted(value);
	};

	// Deliberately an effect, not the click handler: `setCommitted` re-filters the
	// list, and inside the handler that render hasn't committed yet — the target
	// article may not be in the DOM, or may be at an offset about to change.
	// By the time an effect runs, the grid this state produced is on screen.
	useEffect(() => {
		const pending = pendingRef.current;
		if (!pending) return;
		// The DOM is authoritative now that nothing about the grid is deferred: a
		// missing anchor is genuinely absent rather than late, so abandon instead of
		// retrying. A ref left set could only fire against an unrelated later render.
		pendingRef.current = null;
		const el = document.getElementById(pending.anchor);
		if (!el) return;

		// `ANCHOR_STOP` on the target already clears both sticky layers, so
		// block:"start" needs no manual offset. `behavior` has to be gated by hand —
		// the global reduced-motion block neutralizes CSS scroll-behavior only, not
		// the JS argument.
		scrollToAnchor(el, reduced);
		jumpTo(pending.sectionAnchor);
		setPulse(pending.anchor);
		// `filtered` is *not* a dep: the tick and the commit land in one batch, so
		// this already runs against the final grid. It used to be here to retry after
		// the deferred list caught up — a retry that no longer exists.
	}, [pendingTick, reduced, jumpTo]);

	// State-held rather than a CSS keyframe: the global reduced-motion rule crushes
	// animation-duration to 0.01ms, which would erase the confirmation entirely.
	// A held ring still shows for its full second — it just snaps instead of fading.
	useEffect(() => {
		if (!pulse) return;
		const timer = setTimeout(() => setPulse(null), 1200);
		return () => clearTimeout(timer);
	}, [pulse]);

	// The rail scrolls on its own once the list outgrows a short viewport; keep
	// the active entry inside it without ever scrolling the page.
	const railRef = useRef<HTMLElement>(null);
	useEffect(() => {
		const rail = railRef.current;
		if (!rail || !active) return;
		const item = rail.querySelector<HTMLElement>(
			`[data-rail-id="${CSS.escape(active)}"]`,
		);
		if (!item) return;
		const railBox = rail.getBoundingClientRect();
		const itemBox = item.getBoundingClientRect();
		if (itemBox.top < railBox.top) {
			rail.scrollTop += itemBox.top - railBox.top - 8;
		} else if (itemBox.bottom > railBox.bottom) {
			rail.scrollTop += itemBox.bottom - railBox.bottom + 8;
		}
	}, [active]);

	return (
		<div className="lg:flex lg:gap-10">
			{/* Below `lg` the rail is display:none — this carries the same index as a
			    corner pill. Kept out of the rail's own subtree so it isn't clipped by
			    the rail's `overflow-y-auto`. */}
			<CookbookSectionNav
				sections={navItems}
				active={active}
				onJump={jumpTo}
			/>

			{/* Section index — a rail, not a second sidebar. */}
			<nav
				ref={railRef}
				aria-label="Sections"
				className="mb-8 hidden shrink-0 scrollbar-thin lg:sticky lg:top-20 lg:mb-0 lg:block lg:max-h-[calc(100svh-7rem)] lg:w-48 lg:overflow-y-auto"
			>
				<p className="mb-2 font-display text-[10px] uppercase tracking-[0.2em] text-ink-mute">
					Sections
				</p>
				<ul className="space-y-0.5">
					{filtered.map((section) => {
						const id = termAnchor(section.title);
						const isActive = id === active;
						return (
							<li key={section.title}>
								<a
									href={`#${id}`}
									data-rail-id={id}
									onClick={() => jumpTo(id)}
									aria-current={isActive ? "true" : undefined}
									className={cn(
										"relative block rounded-sm px-2 py-1 text-sm transition-colors",
										isActive
											? "text-accent"
											: "text-ink-dim hover:bg-raised/40 hover:text-ink",
									)}
								>
									{isActive && (
										<motion.span
											layoutId="sg-cookbook-rail__active"
											className="pointer-events-none absolute inset-0 z-0 rounded-sm border-l-2 border-accent bg-accent/10"
											transition={
												reduced
													? { duration: 0 }
													: { type: "spring", stiffness: 380, damping: 34 }
											}
										/>
									)}
									<span className="relative z-10">{section.title}</span>
								</a>
							</li>
						);
					})}
				</ul>
			</nav>

			<div className="min-w-0 flex-1 pb-[10svh]">
				<div className="mb-4 md:mb-8 flex gap-2 items-center top-10 sticky sm:top-14 z-10 bg-panel/80 backdrop-blur py-2">
					<CookbookFilter
						query={query}
						onQueryChange={onQueryChange}
						onCommitQuery={onCommitQuery}
						suggestions={result.suggestions}
						onSelect={onSelect}
					/>
					<p
						aria-live="polite"
						className="font-mono text-[8px] whitespace-nowrap sm:text-[10px] uppercase sm:tracking-[0.18em] text-ink-mute"
					>
						{/* Typed but uncommitted, so the grid still shows everything — say
						    why, or the untouched count reads as a broken filter. */}
						{query.trim() && query !== committed
							? "↵ to filter"
							: `${shown} term${shown === 1 ? "" : "s"}`}
					</p>
				</div>

				{filtered.length === 0 && (
					<p className="font-mono text-xs text-ink-mute">No matching terms.</p>
				)}

				<div className="space-y-8 md:space-y-12">
					{filtered.map((section) => (
						<section
							key={section.title}
							id={termAnchor(section.title)}
							className={ANCHOR_STOP}
						>
							<h2 className="font-display text-[11px] uppercase tracking-[0.2em] text-accent">
								{section.title}
							</h2>
							<p className="mt-1 font-sans text-sm text-ink-dim">
								{section.blurb}
							</p>

							{/* Card heights here disagree structurally, not incidentally: a
							    description runs one to four wrapped lines and the "See it"
							    chip row grows in row-height steps — `Loop` carries 27 chips,
							    its neighbour carries none. A row-baseline grid leaves that
							    difference on screen as dead space. */}
							{/* The rise is safe here only because `scrollToAnchor` settles the
							    target first — a card mid-entrance measures `revealDistance` low,
							    and a jump that trusts that offset lands under the filter bar
							    (§V33). `reducedMotion` is not optional either: without it the
							    entrance stays armed for people who asked for no motion, and the
							    page is a grid of invisible cards until each one is scrolled to. */}
							<Masonry
								className="mt-4"
								minColumnWidth={240}
								maxColumns={3}
								gap={12}
								revealDistance={20}
								reducedMotion={reduced}
							>
								{section.terms.map((row) => (
									<article
										key={row.term}
										id={termAnchor(row.term)}
										className={cn(
											ANCHOR_STOP,
											"rounded-xl border border-hairline bg-linear-to-b from-panel via-panel/70 to-panel/40 backdrop-blur-2xl p-4 transition-shadow",
											pulse === termAnchor(row.term) && "ring-1 ring-accent",
										)}
									>
										<h3 className="font-display text-sm tracking-tight text-ink">
											{row.term}
										</h3>
										<p className="mt-1.5 font-sans text-[13px] leading-relaxed text-ink-dim">
											{row.description}
										</p>

										{row.components.length > 0 && (
											<div className="mt-3 flex flex-wrap items-center gap-1.5 md:gap-2">
												<span className="font-display text-[9px] uppercase tracking-[0.2em] text-ink-mute">
													See it
												</span>
												{row.components.map((c) => (
													<Link
														key={c.slug}
														href={`/components/${c.slug}`}
														className="flex items-center gap-1.5 rounded-lg border border-hairline px-1 py-0.5 font-sans text-[10px] text-ink-dim transition-colors hover:border-accent-muted hover:text-accent"
													>
														{c.name}
														<TierBadge
															tier={c.tier}
															className="rounded-md px-1 min-w-7"
														/>
													</Link>
												))}
											</div>
										)}
									</article>
								))}
							</Masonry>
						</section>
					))}
				</div>
			</div>
		</div>
	);
}
