"use client";

import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type ComponentProps,
	type KeyboardEvent,
} from "react";
import { ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useDataCopy } from "@/lib/i18n/data-copy";
import { anchorFor } from "@/components/landing/data";
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
import ProBadge from "./ProBadge";
import PillTabs, { type PillTabItem } from "./PillTabs";
import {
	CATALOG_FILTER_ATTR,
	CATALOG_HAS_NEW_ATTR,
} from "@/lib/catalog-filter-script";
import AutoMaskVertical from "@/components/ui/auto-mask-vertical";
import Wordmark from "@/components/Wordmark";
import FeedbackWidget from "./FeedbackWidget";
import SidebarHoverPreview, { sidebarPreviewHandle } from "./SidebarHoverPreview";
import { PreviewCardTrigger } from "@/components/ui/preview-card";
import { useMediaQuery } from "@/hooks/use-media-query";

export default function Sidebar() {
	const t = useTranslations("chrome.sidebar");
	const copy = useDataCopy();
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
	// Hover previews are a mouse affordance: a touch tap would open the card and
	// navigate in the same gesture. Starts false, so SSR markup stays plain links.
	const canHoverPreview =
		useMediaQuery(
			"(min-width: 1024px) and (hover: hover) and (pointer: fine)",
		) && !sidebarOpen;

	// The label carries the gradient itself rather than the button: a directly
	// applied `color: transparent` beats the track's inherited text-* utility, which
	// would otherwise repaint the clipped glyphs solid. The `-bright` ramp because
	// the fill below is black in both themes — the stock one's mid stop reads 2.9:1
	// there. Punch-out fill: the amethyst tint every other tab uses muddies gradient
	// glyphs.
	// All three tabs always render; CSS hides the New tab (not the strip) while
	// nothing is fresh, keyed off the has-new attribute — see globals.css.
	const filterTabs: PillTabItem<CatalogFilter>[] = useMemo(
		() => [
			{ value: "all", label: t("filterTabs.all") },
			{ value: "pro", label: t("filterTabs.pro") },
			{
				value: "new",
				label: (
					<span className="text-grainient-bright">{t("filterTabs.new")}</span>
				),
				activeFill: "bg-black dark:bg-black",
			},
		],
		[t],
	);

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

	// The active-row reticle's shared `layoutId` only arms after the first
	// in-app navigation. motion's snapshot of a span registered at page load is
	// taken before the snap-to-center effect scrolls the list, so the first
	// click after a refresh would fly the reticle in from the row's PRE-snap
	// position — thousands of pixels of streak. Arming on the post-navigation
	// re-render registers a fresh box; every later flight starts from reality.
	const initialPathname = useRef(pathname);
	const [hasNavigated, setHasNavigated] = useState(false);
	useEffect(() => {
		if (pathname !== initialPathname.current) setHasNavigated(true);
	}, [pathname]);

	// Snap the current page's entry into view on load. Centered so its
	// neighbors stay visible; runs once — later navigation happens via clicks
	// on already-visible items, where auto-scrolling would only be jarring.
	//
	// Manual scrollTop arithmetic on the sidebar's own scroller, never
	// scrollIntoView: that call walks up EVERY scroll ancestor, so it also
	// dragged the document down on each reload and every page opened
	// mid-scroll with the hero half off-screen. Same trap, same fix, as the
	// cookbook filter and the section rail.
	const listRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const list = listRef.current;
		const item = list?.querySelector<HTMLElement>('[aria-current="page"]');
		if (!list || !item) return;
		let scroller: HTMLElement | null = item.parentElement;
		while (scroller && scroller !== document.body) {
			const { overflowY } = getComputedStyle(scroller);
			if (overflowY === "auto" || overflowY === "scroll") break;
			scroller = scroller.parentElement;
		}
		if (!scroller || scroller === document.body) return;
		const box = scroller.getBoundingClientRect();
		const row = item.getBoundingClientRect();
		scroller.scrollTop += row.top - box.top - box.height / 2 + row.height / 2;
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

	// The New tab only means anything while something is New. It always renders
	// and CSS keys its visibility off the has-new attribute: the pre-paint script
	// stamps it with the browser clock, and React re-syncs it here once it has
	// read the same clock (never before `now` lands, or the sync pass would strip
	// the script's attribute for a frame).
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

	// Free entries lead, Pro trails — stable sort, so the authored order survives
	// within each half, and grouping later keeps the split per category.
	const proLast = useMemo(
		() => [...registry].sort((a, b) => Number(!!a.pro) - Number(!!b.pro)),
		[],
	);

	const filtered = useMemo(() => {
		if (effectiveFilter === "new") {
			if (now === null) return [];
			return proLast.filter((entry) => isWithinNewWindow(entry.addedAt, now));
		}
		if (effectiveFilter === "pro") {
			return proLast.filter((entry) => entry.pro);
		}
		return proLast;
	}, [effectiveFilter, now, proLast]);

	const searching = search.trim().length > 0;

	const scored = useMemo(() => {
		if (!searching) return filtered;
		return (
			filtered
				.map((entry) => ({
					entry,
					score: Math.max(
						fuzzyScore(search, entry.name),
						fuzzyScore(search, entry.category),
						fuzzyScore(search, entry.description),
					),
				}))
				.filter((row) => row.score > 0)
				// Relevance first; Pro sinks only on a tie, matching the browse order.
				.sort(
					(a, b) =>
						b.score - a.score || Number(!!a.entry.pro) - Number(!!b.entry.pro),
				)
				.map((row) => row.entry)
		);
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
			<li
				key={entry.slug}
				data-entry
				data-added={entry.addedAt}
				data-pro={entry.pro ? "" : undefined}
			>
				<RowLink
					href={href}
					slug={entry.slug}
					preview={canHoverPreview}
					{...hoverProps()}
					onClick={() => {
						if (!isActive) play("select"); // no cue re-selecting the current page
						setSidebarOpen(false);
						sidebarPreviewHandle.close();
					}}
					aria-current={isActive ? "page" : undefined}
					className={`relative flex items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-sm transition-colors ${
						isActive
							? "font-medium text-accent"
							: isHighlighted
							? "bg-raised/50 text-ink"
							: "text-ink-dim hover:bg-raised/40 hover:text-ink data-[popup-open]:bg-raised/40 data-[popup-open]:text-ink"
					}`}
				>
					{isActive && (
						<motion.span
							// Armed only after the first navigation — see `hasNavigated` above.
							// The key forces a re-register so motion measures a fresh box at
							// arming time instead of reusing the pre-arm node.
							key={hasNavigated ? "sg-live" : "sg-ssr"}
							layoutId={hasNavigated ? "sg-sidebar__active" : undefined}
							className="pointer-events-none absolute inset-0 z-0 rounded-sm bg-accent/10"
							transition={{ type: "spring", stiffness: 350, damping: 30 }}
						>
							{/* Corner-bracket reticle — the instrument-bench selection motif. */}
							<span className="absolute -start-px -top-px size-2.5 border-s border-t border-accent" />
							<span className="absolute -end-px -top-px size-2.5 border-e border-t border-accent" />
							<span className="absolute -bottom-px -start-px size-2.5 border-b border-s border-accent" />
							<span className="absolute -bottom-px -end-px size-2.5 border-b border-e border-accent" />
						</motion.span>
					)}
					<span className="relative z-10 flex min-w-0 flex-1 items-center gap-1.5">
						{/* Tiny corner dot instead of the full pill — sidebar rows are
						    narrow, and absolute positioning keeps the name column aligned. */}
						<NewBadge addedAt={entry.addedAt} variant="tiny" />
						<span className="min-w-0 flex-1 truncate font-sans">
							{entry.name}
						</span>
						<ProBadge pro={entry.pro} variant="tiny" />
					</span>
				</RowLink>
			</li>
		);
	};

	return (
		<>
			{canHoverPreview && <SidebarHoverPreview />}
			{sidebarOpen && (
				<button
					type="button"
					aria-label={t("closeNavigation")}
					onClick={() => setSidebarOpen(false)}
					className="fixed inset-0 z-30 bg-white/40 backdrop-blur-xs lg:hidden dark:bg-black/50"
				/>
			)}
			<aside
				className={`fixed inset-y-0 start-0 z-40 flex w-72 flex-col bg-panel transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-(--sg-sidebar-w,18rem) lg:translate-x-0 ${
					sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
				}`}
			>
				<div className="flex items-center px-4 h-10 md:h-14">
					<Link
						href={pathname === "/components" ? "/" : "/components"}
						className="flex items-baseline gap-0"
						onClick={() => setSidebarOpen(false)}
					>
						<Wordmark size="sm" face="title" />
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
							? t("catalogCountFiltered", {
									matched: scored.length,
									total: filtered.length,
							  })
							: t("catalogCount", { count: filtered.length })}
					</p>
					<input
						type="search"
						value={search}
						onChange={(event) => {
							typeKey();
							setSearch(event.target.value);
						}}
						onKeyDown={onSearchKeyDown}
						placeholder={t("searchPlaceholder")}
						aria-label={t("searchLabel")}
						className="w-full rounded-md border border-transparent bg-surface px-3 py-1.5 font-mono text-xs text-ink placeholder:text-ink-mute outline-none focus-visible:border-accent"
					/>
					{/* Pre-mount the active pill is drawn by CSS off html[data-catalog-filter]
					    (see the pre-paint script), so `value` stays at the SSR default until
					    React owns it — otherwise the indicator would slide across the track
					    on every refresh as the persisted value landed. */}
					<PillTabs<CatalogFilter>
						aria-label={t("filterLabel")}
						value={effectiveFilter}
						onValueChange={setCatalogFilter}
						items={filterTabs}
						layoutId="sidebar-catalog-filter"
						fullWidth
						size="md"
						className="sg-catalog-tabs mt-2 bg-surface"
					/>
				</div>

				{/* AutoMaskVertical auto-hides the scrollbar (reveals on hover / while
			      scrolling), same treatment as the palette. Its edge fade is off here:
			      the category headers are sticky, and a mask on the scroller would
			      fade the pinned header along with the rows sliding under it. The
			      bottom edge gets its fade from the footer strip below instead. */}
				<AutoMaskVertical
					ref={listRef}
					fadeSizePercent={0}
					className="flex-1 px-3 pb-16 md:pb-20"
					aria-label={t("componentsLabel")}
					role="navigation"
				>
					{searching ? (
						scored.length === 0 ? (
							<p className="px-2.5 py-2 font-mono text-xs text-ink-mute">
								{t("noMatches")}
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
										// z-20, not z-10: each row's label span is `relative z-10` (it has
										// to clear the active row's fill at z-0), the row's own `relative`
										// carries no z so it opens no stacking context, and the label
										// therefore lands in the same layer as this header. A tie is
										// settled by DOM order and the rows come later, so at z-10 the
										// names scrolled straight over the pinned header's opaque ground.
										className="sticky top-0 z-20 flex w-full items-center gap-1.5 bg-panel px-2.5 py-1 font-display text-[10px] uppercase tracking-[0.18em] text-ink-mute hover:text-ink-dim"
									>
										<ChevronDown
											aria-hidden
											className={`size-3.5 shrink-0 transition-transform ${
												isCollapsed ? "-rotate-90" : ""
											}`}
										/>
										{copy(
											`pages.categories.${anchorFor(group.category)}`,
											group.category,
										)}
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
				<div className="relative inset-x-0 bottom-0 z-20 bg-surface">
					{/* Bottom fade for the list above, standing in for the scroller's
					    own mask (see AutoMaskVertical above). */}
					<div
						aria-hidden
						className="pointer-events-none absolute inset-x-0 bottom-full h-10 bg-linear-to-t from-panel to-transparent"
					/>
					<FeedbackWidget />
				</div>

				{/* Desktop drag-to-resize handle — 1px hairline, widened hit area,
            amethyst on hover/drag. Double-click resets; arrows nudge. */}
				{mounted && (
					<div
						{...handleProps}
						data-dragging={isDragging}
						aria-label={t("resizeHandle")}
						title={t("resizeHint")}
						className="group absolute inset-y-0 end-0 z-30 hidden w-px cursor-col-resize bg-transparent transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 data-[dragging=true]:bg-accent lg:block"
					>
						<span className="absolute -inset-x-1 inset-y-0" />
					</div>
				)}
			</aside>
		</>
	);
}

// A row is a plain link, or — where hover previews apply — the same link
// rendered through the shared preview card's trigger, carrying its slug.
function RowLink({
	slug,
	preview,
	href,
	...props
}: ComponentProps<typeof Link> & { slug: string; preview: boolean }) {
	if (!preview) return <Link href={href} {...props} />;
	return (
		<PreviewCardTrigger
			handle={sidebarPreviewHandle}
			payload={slug}
			delay={250}
			closeDelay={150}
			render={<Link href={href} />}
			{...props}
		/>
	);
}
