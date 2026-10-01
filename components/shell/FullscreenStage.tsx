"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@bprogress/next/app";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import {
	ChevronLeft,
	ChevronRight,
	Minimize2,
	SlidersHorizontal,
} from "lucide-react";
import type { ComponentEntry } from "@/lib/registry/types";
import type { Neighbors } from "@/lib/registry";
import { displayName } from "@/lib/display-name";
import { useTunedProps } from "@/lib/registry/useTunedProps";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { usePauseState } from "@/hooks/use-pause-state";
import { useIdleHud } from "@/hooks/use-idle-hud";
import { previews } from "@/components/registry/previews";
import PlaceholderPreview from "./PlaceholderPreview";
import PreviewBoundary from "./PreviewBoundary";
import ControlsPanel from "./ControlsPanel";
import ControlsLocked from "./ControlsLocked";

export default function FullscreenStage({
	entry,
	neighbors,
	controlsLocked,
}: {
	entry: ComponentEntry;
	neighbors?: Neighbors;
	/** Server-created promise (isControlsLocked), read via use() — same
	    no-async-parent rule as LiveWorkspace (Flight soft-nav decode). */
	controlsLocked?: Promise<boolean>;
}) {
	const locked = controlsLocked ? use(controlsLocked) : false;
	const { values, setValue, syncValue, reset } = useTunedProps(entry.props);
	const reducedMotion = usePrefersReducedMotion();
	const paused = usePauseState(entry.slug);
	const t = useTranslations("chrome.fullscreenStage");
	const tLocked = useTranslations("chrome.controlsLocked");
	const router = useRouter();
	const searchParams = useSearchParams();
	const [controlsOpen, setControlsOpen] = useState(false);

	const chromeRef = useRef<HTMLDivElement>(null);
	const toggleRef = useRef<HTMLButtonElement>(null);
	// Stable tuple: the hook keys its effect on it.
	const hudRegions = useMemo(() => [chromeRef, toggleRef], []);

	const hudVisible = useIdleHud(hudRegions, controlsOpen);

	const hudHidden = hudVisible
		? " duration-300 ease-out"
		: " duration-[420ms] ease-in pointer-events-none opacity-0 blur-sm";
	const hudMotion =
		" transition-[opacity,filter,color] motion-reduce:transition-none";
	const Preview = previews[entry.slug] ?? PlaceholderPreview;
	const valuesKey = useMemo(() => JSON.stringify(values), [values]);

	const qs = searchParams.toString();
	const backHref = qs
		? `/components/${entry.slug}?${qs}`
		: `/components/${entry.slug}`;
	// Neighbours get a clean URL: the query string is this entry's tuning, keyed
	// by its prop names, and would be noise (or a collision) on another schema.
	const prevHref = neighbors ? `/components/${neighbors.prev.slug}/full` : null;
	const nextHref = neighbors ? `/components/${neighbors.next.slug}/full` : null;

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			// Previews that consume a key (e.g. command palette on Escape) win via preventDefault.
			if (e.defaultPrevented) return;
			if (e.key === "Escape") {
				// Escape peels one layer at a time: docked controls first, then fullscreen.
				if (controlsOpen) setControlsOpen(false);
				else router.push(backHref);
				return;
			}
			if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

			if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
			const active = document.activeElement;
			const idle =
				!active ||
				active === document.body ||
				chromeRef.current?.contains(active);
			if (!idle) return;
			const href = e.key === "ArrowLeft" ? prevHref : nextHref;
			if (!href) return;
			e.preventDefault();
			router.push(href);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [router, backHref, prevHref, nextHref, controlsOpen]);

	// Warm both neighbours: the ring only ever has two exits from here, and a
	// prefetched full page swaps in without the pulse fallback.
	useEffect(() => {
		if (prevHref) router.prefetch(prevHref);
		if (nextHref) router.prefetch(nextHref);
	}, [router, prevHref, nextHref]);

	return (
		<div dir="ltr" className="relative grid h-dvh overflow-hidden bg-surface">
			<PreviewBoundary
				slug={entry.slug}
				variant="stage"
				resetKeys={[entry.slug, valuesKey]}
			>
				<Preview
					values={values}
					reducedMotion={reducedMotion}
					paused={paused}
					onValueChange={syncValue}
				/>
			</PreviewBoundary>
			<div
				ref={chromeRef}
				className={`absolute start-3 top-1 z-10 flex items-center gap-2${hudMotion}${hudHidden}`}
			>
				<Link
					href={backHref}
					aria-label={t("exitAria", { name: entry.name })}
					className="grid h-8 w-8 place-items-center rounded-md border border-hairline bg-surface/80 text-ink-dim backdrop-blur transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none"
				>
					<Minimize2 className="h-4 w-4" aria-hidden />
				</Link>
				<span className="rounded-md border border-hairline bg-surface/80 px-2 py-1 font-display text-[11px] uppercase tracking-[0.2em] text-ink-dim backdrop-blur">
					{displayName(entry.name)}
				</span>
				{neighbors && prevHref && nextHref && (
					<nav
						aria-label={t("navAria")}
						className="flex items-center rounded-md border border-hairline bg-surface/80 backdrop-blur"
					>
						<NeighborLink
							href={prevHref}
							name={displayName(neighbors.prev.name)}
							label={t("prevAria", { name: displayName(neighbors.prev.name) })}
							side="prev"
						/>
						<span
							aria-hidden
							className="select-none px-1 font-display text-[11px] tabular-nums tracking-[0.15em] text-ink-dim"
						>
							{neighbors.index}/{neighbors.total}
						</span>
						<NeighborLink
							href={nextHref}
							name={displayName(neighbors.next.name)}
							label={t("nextAria", { name: displayName(neighbors.next.name) })}
							side="next"
						/>
					</nav>
				)}
			</div>
			{entry.props.length > 0 && (
				<>
					{controlsOpen && (
						<motion.div
							id="sg-fullscreen-controls"
							initial={reducedMotion ? false : { opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.2, ease: "easeOut" }}
							className="absolute bottom-14 end-3 z-10 max-h-[70dvh] w-[min(380px,calc(100vw-1.5rem))] overflow-y-auto"
						>
							<ControlsPanel
								dense
								props={entry.props}
								values={values}
								onChange={setValue}
								onReset={reset}
								pausable={entry.pausable}
								locked={
									locked ? (
										<ControlsLocked
											dense
											name={entry.name}
											propCount={entry.props.length}
											// This route has no PricingModal — it lives in the (shell)
											// layout — so the CTA leaves rather than opening in place.
											cta={
												<Link
													href={`${backHref}#subscribe`}
													className="inline-flex h-9 items-center justify-center rounded-lg bg-accent px-4 font-sans text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
												>
													{tLocked("cta")}
												</Link>
											}
										/>
									) : null
								}
							/>
						</motion.div>
					)}
					<button
						ref={toggleRef}
						type="button"
						onClick={() => setControlsOpen((open) => !open)}
						aria-expanded={controlsOpen}
						aria-controls="sg-fullscreen-controls"
						aria-label={controlsOpen ? t("hideControls") : t("showControls")}
						className={`absolute bottom-3 end-3 z-10 grid h-8 w-8 place-items-center rounded-md border border-hairline bg-surface/80 text-ink-dim backdrop-blur hover:text-accent focus-visible:text-accent focus-visible:outline-none${hudMotion}${hudHidden}`}
					>
						<SlidersHorizontal className="h-4 w-4" aria-hidden />
					</button>
				</>
			)}
		</div>
	);
}

// One chevron that grows a name on hover/focus. The name is a peek, not the
// affordance, so it collapses to zero width and leaves the strip four glyphs
// wide at rest — this is a stage, and the chrome should read as a border.
function NeighborLink({
	href,
	name,
	label,
	side,
}: {
	href: string;
	name: string;
	label: string;
	side: "prev" | "next";
}) {
	const Chevron = side === "prev" ? ChevronLeft : ChevronRight;
	const peek = (
		<span className="max-w-0 overflow-hidden whitespace-nowrap font-display text-[11px] uppercase tracking-[0.15em] opacity-0 transition-[max-width,opacity] duration-200 ease-out group-hover:max-w-40 group-hover:opacity-100 group-focus-visible:max-w-40 group-focus-visible:opacity-100 motion-reduce:transition-none">
			<span className={side === "prev" ? "pe-1.5" : "ps-1.5"}>{name}</span>
		</span>
	);
	return (
		<Link
			href={href}
			aria-label={label}
			title={`${label} (${side === "prev" ? "\u2190" : "\u2192"})`}
			className="group flex h-6 items-center px-1.5 text-ink-dim transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none"
		>
			{side === "prev" && (
				<Chevron className="h-3.5 w-3.5 shrink-0" aria-hidden />
			)}
			{peek}
			{side === "next" && (
				<Chevron className="h-3.5 w-3.5 shrink-0" aria-hidden />
			)}
		</Link>
	);
}
