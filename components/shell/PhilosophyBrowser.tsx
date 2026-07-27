"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { termAnchor } from "@/lib/philosophy";
import {
	buildSearchIndex,
	searchPhilosophy,
	type Suggestion,
} from "@/lib/philosophy-search";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { useScrollSpy } from "@/hooks/use-scroll-spy";
import PhilosophyFilter from "./PhilosophyFilter";
import PhilosophySectionNav from "./PhilosophySectionNav";
import TierBadge from "./TierBadge";

// Where an anchored heading has to come to rest. Two sticky layers are stacked
// above it, not one: the shell's TopBar, and this page's own filter bar parked
// under it at `top-10` / `sm:top-14`. The stop is that bar's *bottom* edge — its
// own top (40 / 56) plus its height (~50) = 90 below `sm`, 106 above — rounded up
// to the next spacing step. Reserving only the TopBar hides the heading behind
// the filter.
const ANCHOR_STOP = "scroll-mt-24 sm:scroll-mt-28"; // 96px / 112px

// A hair below the deepest stop (112), never above it. A reading line shallower
// than the landing point would hand the rail straight back to the previous
// section the moment a jump settles.
const READING_LINE = 120;

// Only what the page needs crosses the boundary — the full ComponentEntry carries
// prop schemas and variant paths the glossary has no use for.
export interface PhilosophyComponentRef {
	slug: string;
	name: string;
	tier: "free" | "pro";
}

export interface PhilosophyTermRow {
	term: string;
	description: string;
	components: PhilosophyComponentRef[];
}

export interface PhilosophySectionRow {
	title: string;
	blurb: string;
	terms: PhilosophyTermRow[];
}

// Local state, deliberately not nuqs: keeping the filter out of the URL keeps this
// page free of any URL read, which is what lets it prerender without a Suspense
// boundary under Cache Components.
export default function PhilosophyBrowser({
	sections,
}: {
	sections: PhilosophySectionRow[];
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
	const result = useMemo(() => searchPhilosophy(index, query), [index, query]);
	const gridResult = useMemo(
		() => searchPhilosophy(index, committed),
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
		el.scrollIntoView({
			block: "start",
			behavior: reduced ? "auto" : "smooth",
		});
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
			<PhilosophySectionNav
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
											layoutId="sg-philosophy-rail__active"
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

			<div className="min-w-0 flex-1">
				<div className="mb-4 md:mb-8 flex gap-2 items-center top-10 sticky sm:top-14 z-10 bg-panel/80 backdrop-blur py-2">
					<PhilosophyFilter
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

							<div className="mt-4 grid gap-3 sm:grid-cols-2">
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
							</div>
						</section>
					))}
				</div>
			</div>
		</div>
	);
}
