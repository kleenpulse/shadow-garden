"use client";

import {
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
import NewBadge from "./NewBadge";
import PillTabs, { type PillTabItem } from "./PillTabs";
import {
	CATALOG_FILTER_ATTR,
	CATALOG_HAS_NEW_ATTR,
} from "@/lib/catalog-filter-script";
import AutoMaskVertical from "@/components/ui/auto-mask-vertical";
import Wordmark from "@/components/Wordmark";
import FeedbackWidget from "./FeedbackWidget";

// The label carries the gradient itself rather than the button: a directly
// applied `color: transparent` beats the track's inherited text-* utility, which
// would otherwise repaint the clipped glyphs solid. The `-bright` ramp because
// the fill below is black in both themes — the stock one's mid stop reads 2.9:1
// there. Punch-out fill: the amethyst tint every other tab uses muddies gradient
// glyphs.
const FILTER_TABS: PillTabItem<CatalogFilter>[] = [
	{ value: "all", label: "all" },
	{
		value: "new",
		label: <span className="text-grainient-bright">new</span>,
		activeFill: "bg-black dark:bg-black",
	},
];

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
	// through SSR; the pre-paint script covers that window with the real clock.
	const [now, setNow] = useState<number | null>(null);
	useEffect(() => setNow(Date.now()), []);

	const hasNew = useMemo(
		() =>
			now !== null && registry.some((e) => isWithinNewWindow(e.addedAt, now)),
		[now],
	);

	// The filter strip only means anything while something is New — All alone is
	// not a choice. It always renders and CSS keys its visibility off the has-new
	// attribute: the pre-paint script stamps it with the browser clock, and React
	// re-syncs it here once it has read the same clock (never before `now` lands,
	// or the sync pass would strip the script's attribute for a frame).
	useEffect(() => {
		if (now === null) return;
		document.documentElement.toggleAttribute(CATALOG_HAS_NEW_ATTR, hasNew);
	}, [hasNew, now]);

	// A persisted "new" outlives the window it filtered — once nothing is fresh
	// the strip is hidden, so an empty list would have no visible way back.
	useEffect(() => {
		if (mounted && now !== null && !hasNew && catalogFilter === "new") {
			setCatalogFilter("all");
		}
	}, [mounted, now, hasNew, catalogFilter, setCatalogFilter]);

	// The persisted filter rehydrates synchronously, so using it on the first
	// client render would disagree with the SSR markup and blow up hydration for a
	// 35-link nav. Render the SSR default until mounted; CSS covers the gap.
	const effectiveFilter: CatalogFilter = mounted ? catalogFilter : "all";

	// Only once the real filter has committed — otherwise the CSS crutch would be
	// pulled a frame before React's own filtering landed, and the full list would
	// flash through.
	useEffect(() => {
		if (mounted) document.documentElement.removeAttribute(CATALOG_FILTER_ATTR);
	}, [mounted]);

	const filtered = useMemo(() => {
		if (effectiveFilter === "new") {
			if (now === null) return [];
			return registry.filter((entry) => isWithinNewWindow(entry.addedAt, now));
		}
		return registry;
	}, [effectiveFilter, now]);

	const searching = search.trim().length > 0;

	const scored = useMemo(() => {
		if (!searching) return filtered;
		return filtered
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
	}, [search, searching, filtered]);

	const groups = useMemo(
		() => groupByCategory(searching ? scored : filtered),
		[scored, searching, filtered],
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
				router.push(`/components/${target.slug}`);
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
			// data-* are the pre-paint filter's only handles on a row: the script runs
			// before this markup is parsed, so it can't inspect anything computed.
			<li key={entry.slug} data-entry data-added={entry.addedAt}>
				<Link
					href={href}
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
						href={pathname === "/components" ? "/" : "/components"}
						className="flex items-baseline gap-0"
						onClick={() => setSidebarOpen(false)}
					>
						<Wordmark size="sm" />
					</Link>
				</div>

				<div className="px-3 py-3">
					{/* Catalog readout — doubles as a live match count while searching. */}
					{/* The count is the one thing CSS can't recompute pre-mount, so it's
					    held invisible (not removed — the row keeps its height) until React
					    has the real number. No-JS never gets the attribute, so it reads
					    the honest total. */}
					<p
						aria-live="polite"
						data-catalog-count
						className="mb-1.5 px-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-mute"
					>
						{searching
							? `${scored.length} / ${filtered.length} components`
							: `${filtered.length} components`}
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
					{/* Pre-mount the active pill is drawn by CSS off html[data-catalog-filter]
					    (see the pre-paint script), so `value` stays at the SSR default until
					    React owns it — otherwise the indicator would slide across the track
					    on every refresh as the persisted value landed. */}
					<PillTabs<CatalogFilter>
						aria-label="Filter components"
						value={effectiveFilter}
						onValueChange={setCatalogFilter}
						items={FILTER_TABS}
						layoutId="sidebar-catalog-filter"
						fullWidth
						size="md"
						className="sg-catalog-tabs mt-2"
					/>
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
								<div key={group.category} data-group className="mb-3">
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
				<div className=" inset-x-0 bottom-0 z-20 border-t border-hairline bg-surface">
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
