"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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

// Matches the sections' `scroll-mt-20` (5rem) plus a hair, so the rail flips to
// a section at the moment its heading clears the sticky top bar.
const READING_LINE = 88;

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
	const [query, setQuery] = useState("");

	// Normalized once, at mount. Every keystroke after that is a handful of
	// indexOf calls over ~140 short strings, which is why nothing here is debounced.
	const index = useMemo(() => buildSearchIndex(sections), [sections]);
	const result = useMemo(() => searchPhilosophy(index, query), [index, query]);

	// The popup reads `result` (immediate) and the card grid reads the deferred
	// copy. Suggestions stay honest to the keystroke while re-rendering 91 cards
	// is allowed to land a frame late — the split is the whole point of deferring
	// the result object rather than the query string.
	const deferred = useDeferredValue(result);

	const filtered = useMemo(() => {
		const matched = deferred.matchedTerms;
		// null means "no query" — which is not the same as an empty set.
		if (!matched) return sections;
		return sections
			.map((section) => ({
				...section,
				terms: section.terms.filter((row) => matched.has(row.term)),
			}))
			.filter((section) => section.terms.length > 0);
	}, [sections, deferred]);

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
		setQuery(suggestion.kind === "section" ? "" : suggestion.label);
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
	};

	// Deliberately an effect, not the click handler: setQuery re-filters the list,
	// so at commit time the target article may not be in the DOM yet. `filtered`
	// is a dep because it lags behind `query` — when the deferred list catches up
	// the effect re-runs and the still-set ref completes the jump.
	useEffect(() => {
		const pending = pendingRef.current;
		if (!pending) return;
		const el = document.getElementById(pending.anchor);
		if (!el) return;
		pendingRef.current = null;

		// `scroll-mt-20` on the target already accounts for the sticky top bar, so
		// block:"start" needs no manual offset. `behavior` has to be gated by hand —
		// the global reduced-motion block neutralizes CSS scroll-behavior only, not
		// the JS argument.
		el.scrollIntoView({
			block: "start",
			behavior: reduced ? "auto" : "smooth",
		});
		jumpTo(pending.sectionAnchor);
		setPulse(pending.anchor);
	}, [pendingTick, filtered, reduced, jumpTo]);

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
						suggestions={result.suggestions}
						onSelect={onSelect}
					/>
					<p
						aria-live="polite"
						className="font-mono text-[8px] whitespace-nowrap sm:text-[10px] uppercase sm:tracking-[0.18em] text-ink-mute"
					>
						{shown} term{shown === 1 ? "" : "s"}
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
							className="scroll-mt-20"
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
											"scroll-mt-20 rounded-xl border border-hairline bg-linear-to-b from-panel via-panel/70 to-panel/40 backdrop-blur-2xl p-4 transition-shadow",
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
