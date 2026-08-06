"use client";

import {
	Suspense,
	useEffect,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent,
} from "react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
// Patched router: imperative navigations drive the route progress bar too.
import { useRouter } from "@bprogress/next/app";
import { groupByCategory, registry } from "@/lib/registry";
import type { Category, ComponentEntry } from "@/lib/registry/types";
import { fuzzyScore } from "@/lib/fuzzy";
import { isWithinNewWindow } from "@/lib/registry/freshness";
import {
	useUIStore,
	SIDEBAR_MIN,
	SIDEBAR_MAX,
	SIDEBAR_DEFAULT,
	type CatalogFilter,
} from "@/lib/store";
import { useResizable } from "./use-resizable";
import { useInteractionSound } from "@/hooks/use-interaction-sound";
import TierBadge from "./TierBadge";
import NewBadge from "./NewBadge";
import PillTabs, { type PillTabItem } from "./PillTabs";
import CatalogFilterTabs, {
	CATALOG_FILTER_PARAM,
} from "./CatalogFilterTabs";
import AutoMaskVertical from "@/components/ui/auto-mask-vertical";
import Wordmark from "@/components/Wordmark";
import FeedbackWidget from "./FeedbackWidget";

const TIER_TABS: PillTabItem<CatalogFilter>[] = [
	{ value: "all", label: "all" },
	{ value: "free", label: "free" },
	{ value: "pro", label: "pro" },
];
// The label carries `.text-grainient` itself rather than the button: a directly
// applied `color: transparent` beats the track's inherited text-* utility, which
// would otherwise repaint the clipped glyphs solid.
const NEW_TAB: PillTabItem<CatalogFilter> = {
	value: "new",
	label: <span className="text-grainient">new</span>,
};

export default function Sidebar() {
	const pathname = usePathname();
	const router = useRouter();
	const search = useUIStore((state) => state.search);
	const setSearch = useUIStore((state) => state.setSearch);
	const catalogFilter = useUIStore((state) => state.catalogFilter);
	const setCatalogFilter = useUIStore((state) => state.setCatalogFilter);
	const sidebarOpen = useUIStore((state) => state.sidebarOpen);
	const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
	const sidebarWidth = useUIStore((state) => state.sidebarWidth);
	const setSidebarWidth = useUIStore((state) => state.setSidebarWidth);
	const { play, typeKey, hoverProps } = useInteractionSound();

	// The persisted width differs from the SSR default, so defer the handle (which
	// renders the live width into aria-valuenow) to after mount to avoid a
	// hydration mismatch. The width itself is safe — it flows through a CSS var.
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	// Drive the desktop width off a CSS var so the pre-paint script (app/layout.tsx)
	// can set it before hydration; this keeps it in sync on drag + store rehydrate.
	useEffect(() => {
		document.documentElement.style.setProperty(
			"--sg-sidebar-w",
			`${sidebarWidth}px`,
		);
	}, [sidebarWidth]);

	const { isDragging, handleProps } = useResizable({
		width: sidebarWidth,
		onWidth: setSidebarWidth,
		min: SIDEBAR_MIN,
		max: SIDEBAR_MAX,
		resetTo: SIDEBAR_DEFAULT,
		edge: "right",
	});

	const [collapsed, setCollapsed] = useState<Set<Category>>(new Set());
	const [active, setActive] = useState(0);

	// Snap the current page's entry into view on load. Centered so its
	// neighbors stay visible; runs once — later navigation happens via clicks
	// on already-visible items, where auto-scrolling would only be jarring.
	const listRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		listRef.current
			?.querySelector('[aria-current="page"]')
			?.scrollIntoView({ block: "center" });
	}, []);

	// Freshness is wall-clock-dependent — same constraint as NewBadge: reading the
	// clock during the prerendered shell would freeze it to build time. Stays null
	// through SSR + first paint, so the New tab only mounts client-side.
	const [now, setNow] = useState<number | null>(null);
	useEffect(() => setNow(Date.now()), []);

	const hasNew = useMemo(
		() =>
			now !== null && registry.some((e) => isWithinNewWindow(e.addedAt, now)),
		[now],
	);

	const tabs = useMemo(
		() => (hasNew ? [...TIER_TABS, NEW_TAB] : TIER_TABS),
		[hasNew],
	);

	const tierFiltered = useMemo(() => {
		if (catalogFilter === "new") {
			if (now === null) return [];
			return registry.filter((entry) => isWithinNewWindow(entry.addedAt, now));
		}
		if (catalogFilter === "all") return registry;
		return registry.filter((entry) => entry.tier === catalogFilter);
	}, [catalogFilter, now]);

	const searching = search.trim().length > 0;

	const scored = useMemo(() => {
		if (!searching) return tierFiltered;
		return tierFiltered
			.map((entry) => ({
				entry,
				score: Math.max(
					fuzzyScore(search, entry.name),
					fuzzyScore(search, entry.category),
					fuzzyScore(search, entry.description),
				),
			}))
			.filter((row) => row.score > 0)
			.sort((a, b) => b.score - a.score)
			.map((row) => row.entry);
	}, [search, searching, tierFiltered]);

	const groups = useMemo(
		() => groupByCategory(searching ? scored : tierFiltered),
		[scored, searching, tierFiltered],
	);

	const visibleFlat = useMemo<ComponentEntry[]>(() => {
		if (searching) return scored;
		return groups.flatMap((group) =>
			collapsed.has(group.category) ? [] : group.entries,
		);
	}, [searching, scored, groups, collapsed]);

	const indexOfSlug = useMemo(() => {
		const map = new Map<string, number>();
		visibleFlat.forEach((entry, i) => map.set(entry.slug, i));
		return map;
	}, [visibleFlat]);

	useEffect(() => {
		setActive(0);
	}, [search, catalogFilter]);

	// Carry the filter across navigation. Sidebar links are real navigations, so a
	// bare href drops the query string — the sidebar would silently snap back to
	// All the moment you clicked anything it had filtered down to.
	const withFilter = (href: string) =>
		catalogFilter === "all"
			? href
			: `${href}?${CATALOG_FILTER_PARAM}=${catalogFilter}`;

	const toggleCategory = (category: Category) => {
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(category)) next.delete(category);
			else next.add(category);
			return next;
		});
	};

	const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setActive((i) => Math.min(i + 1, visibleFlat.length - 1));
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			setActive((i) => Math.max(i - 1, 0));
		} else if (event.key === "Enter") {
			const target = visibleFlat[active];
			if (target) {
				router.push(withFilter(`/components/${target.slug}`));
				setSidebarOpen(false);
			}
		} else if (event.key === "Escape") {
			setSearch("");
		}
	};

	const entryLink = (entry: ComponentEntry) => {
		const href = `/components/${entry.slug}`;
		const isActive = pathname === href;
		// The keyboard cursor only means something while searching; otherwise index 0
		// would falsely highlight the first item on every non-component route.
		const isHighlighted = searching && indexOfSlug.get(entry.slug) === active;
		return (
			<li key={entry.slug}>
				<Link
					href={withFilter(href)}
					{...hoverProps()}
					onClick={() => {
						if (!isActive) play("select"); // no cue re-selecting the current page
						setSidebarOpen(false);
					}}
					aria-current={isActive ? "page" : undefined}
					className={`relative flex items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-sm transition-colors ${
						isActive
							? "font-medium text-accent"
							: isHighlighted
								? "bg-raised/50 text-ink"
								: "text-ink-dim hover:bg-raised/40 hover:text-ink"
					}`}
				>
					{isActive && (
						<motion.span
							layoutId="sg-sidebar__active"
							className="pointer-events-none absolute inset-0 z-0 rounded-sm bg-accent/10"
							transition={{ type: "spring", stiffness: 350, damping: 30 }}
						>
							{/* Corner-bracket reticle — the instrument-bench selection motif. */}
							<span className="absolute -left-px -top-px size-2.5 border-l border-t border-accent" />
							<span className="absolute -right-px -top-px size-2.5 border-r border-t border-accent" />
							<span className="absolute -bottom-px -left-px size-2.5 border-b border-l border-accent" />
							<span className="absolute -bottom-px -right-px size-2.5 border-b border-r border-accent" />
						</motion.span>
					)}
					<span className="relative z-10 min-w-0 flex-1">
						{/* Tiny corner dot instead of the full pill — sidebar rows are
						    narrow, and absolute positioning keeps the name column aligned. */}
						<NewBadge addedAt={entry.addedAt} variant="tiny" />
						<span className="block truncate font-sans">{entry.name}</span>
					</span>
					<span className="relative z-10">
						<TierBadge tier={entry.tier} />
					</span>
				</Link>
			</li>
		);
	};

	return (
		<>
			{sidebarOpen && (
				<button
					type="button"
					aria-label="Close navigation"
					onClick={() => setSidebarOpen(false)}
					className="fixed inset-0 z-30 bg-black/50 lg:hidden"
				/>
			)}
			<aside
				className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-hairline bg-surface transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-(--sg-sidebar-w,18rem) lg:translate-x-0 ${
					sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
				}`}
			>
				<div className="flex items-center border-b border-hairline px-4 h-10 md:h-14">
					<Link
						href={
							pathname === "/components" ? "/" : withFilter("/components")
						}
						className="flex items-baseline gap-0"
						onClick={() => setSidebarOpen(false)}
					>
						<Wordmark size="sm" />
					</Link>
				</div>

				<div className="px-3 py-3">
					{/* Catalog readout — doubles as a live match count while searching. */}
					<p
						aria-live="polite"
						className="mb-1.5 px-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-mute"
					>
						{searching
							? `${scored.length} / ${tierFiltered.length} components`
							: `${tierFiltered.length} components`}
					</p>
					<input
						type="search"
						value={search}
						onChange={(event) => {
							typeKey();
							setSearch(event.target.value);
						}}
						onKeyDown={onSearchKeyDown}
						placeholder="Search components…"
						aria-label="Search components"
						className="w-full rounded-md border border-hairline bg-panel px-3 py-1.5 font-mono text-xs text-ink placeholder:text-ink-mute outline-none focus-visible:border-accent"
					/>
					{/* The tabs read ?filter from the URL, so they mount behind Suspense
					    (Cache Components rule). The fallback is the same control bound to
					    the store alone — the row never blinks, it just isn't deep-linkable
					    for the frame before hydration. */}
					<Suspense
						fallback={
							<PillTabs<CatalogFilter>
								aria-label="Filter components"
								value={catalogFilter}
								onValueChange={setCatalogFilter}
								items={tabs}
								layoutId="sidebar-tier-filter-static"
								fullWidth
								size="md"
								className="mt-2"
							/>
						}
					>
						<CatalogFilterTabs items={tabs} />
					</Suspense>
				</div>

				{/* AutoMaskVertical fades the scroll edges and auto-hides the scrollbar
			      (reveals on hover / while scrolling), same treatment as the palette. */}
				<AutoMaskVertical
					ref={listRef}
					className="flex-1 px-3 pb-16 md:pb-20"
					aria-label="Components"
					role="navigation"
				>
					{searching ? (
						scored.length === 0 ? (
							<p className="px-2.5 py-2 font-mono text-xs text-ink-mute">
								No matches.
							</p>
						) : (
							<ul className="space-y-0.5">{scored.map(entryLink)}</ul>
						)
					) : (
						groups.map((group) => {
							const isCollapsed = collapsed.has(group.category);
							return (
								<div key={group.category} className="mb-3">
									<button
										type="button"
										onClick={() => toggleCategory(group.category)}
										aria-expanded={!isCollapsed}
										className="flex w-full items-center gap-1.5 px-2.5 py-1 font-display text-[10px] uppercase tracking-[0.18em] text-ink-mute hover:text-ink-dim"
									>
										<span
											className={`transition-transform md:text-base ${isCollapsed ? "-rotate-90" : ""}`}
										>
											▾
										</span>
										{group.category}
									</button>
									{!isCollapsed && (
										<ul className="mt-0.5 space-y-0.5">
											{group.entries.map(entryLink)}
										</ul>
									)}
								</div>
							);
						})
					)}
				</AutoMaskVertical>

				{/* Feedback trigger — pinned to the bottom, offset by the list padding
				    above so the last nav items never hide behind it. Opens the two-step
				    feedback/bug-report modal (portals out via GrowDialog). */}
				<div className="absolute inset-x-0 bottom-0 z-20 border-t border-hairline bg-surface">
					<FeedbackWidget />
				</div>

				{/* Desktop drag-to-resize handle — 1px hairline, widened hit area,
            amethyst on hover/drag. Double-click resets; arrows nudge. */}
				{mounted && (
					<div
						{...handleProps}
						data-dragging={isDragging}
						aria-label="Resize sidebar"
						title="Drag to resize · double-click to reset"
						className="group absolute inset-y-0 right-0 z-30 hidden w-px cursor-col-resize bg-transparent transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 data-[dragging=true]:bg-accent lg:block"
					>
						<span className="absolute -inset-x-1 inset-y-0" />
					</div>
				)}
			</aside>
		</>
	);
}
