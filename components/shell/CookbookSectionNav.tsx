"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useDataCopy } from "@/lib/i18n/data-copy";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/lib/store";
import { CookbookFlameControlsMobile } from "./CookbookFlameControls";

// Mirrors scripts/i18n/gen-catalog.ts — the slug the generated
// cookbookSections keys are written under. Item ids stay termAnchor-derived
// (English) so the in-page anchors never change; only the display text moves.
const sectionKey = (s: string) =>
	s
		.toLowerCase()
		.replace(/&/g, "and")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

// The desktop rail's mobile counterpart: a corner pill that reads out where you
// are in the glossary and morphs open into the section index. Deliberately no
// `layoutId` on the active row — the rail is `display:none`, not unmounted, so a
// shared id would make motion fly one marker between the two trees.

export interface SectionNavItem {
	id: string;
	title: string;
}

// Closed pill geometry. Fixed rather than measured: the label is the active
// section title, which changes ~12 times per read-through, and animating to
// `width: "auto"` would spring the pill sideways at every boundary.
const CLOSED_W = 200;
const PILL_H = 32;

// Panel ceilings, clamped against the viewport in the resize effect below.
const OPEN_W = 320;
const OPEN_H = 424;
const ROW_H = 34;
// The pinned flame-controls footer. Counted into the derived height so a
// filtered-down list of two sections doesn't crush the controls out of the box.
const FOOTER_H = 40;

const IOS_EASE = [0.32, 0.72, 0, 1] as const;
const FULL_CLIP = "inset(-8% -8% -8% -8% round 14px)";

type MorphCtx = { pillClip: string };

// Variant FUNCTIONS of `custom`, so the exit clip is re-resolved against the
// current viewport instead of freezing the value captured at enter time.
// Clip-path is compositor-only, so the panel never reflows while it grows.
const panelVariants = {
	initial: ({ pillClip }: MorphCtx) => ({ clipPath: pillClip, opacity: 0.6 }),
	animate: () => ({
		clipPath: FULL_CLIP,
		opacity: 1,
		transition: { duration: 0.42, ease: IOS_EASE },
	}),
	exit: ({ pillClip }: MorphCtx) => ({
		clipPath: pillClip,
		opacity: 0,
		transition: { duration: 0.26, ease: "linear" as const },
	}),
};

export default function CookbookSectionNav({
	sections,
	active,
	onJump,
}: {
	sections: SectionNavItem[];
	active: string | null;
	onJump: (id: string) => void;
}) {
	const setNavOverlayOpen = useUIStore((s) => s.setNavOverlayOpen);

	const t = useTranslations("chrome.cookbookNav");
	const copy = useDataCopy();
	const sectionTitle = (title: string) =>
		copy(`cookbookSections.${sectionKey(title)}.title`, title);

	const [open, setOpen] = useState(false);
	const pillRef = useRef<HTMLButtonElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);

	const total = sections.length;
	const index = sections.findIndex((s) => s.id === active);
	const activeItem = index >= 0 ? sections[index] : sections[0];
	// Empty before the spy's first commit — treat that as "section 1 of n" rather
	// than an empty ring, which would read as a broken control.
	const position = index >= 0 ? index + 1 : 1;

	// Panel box, clamped to the viewport. `openH` is derived, not measured: row
	// height is ours to set, so a ResizeObserver here would be over-engineering —
	// and a few percent of error in a 420ms transient is invisible.
	const [box, setBox] = useState({ w: OPEN_W, h: OPEN_H });
	useEffect(() => {
		const calc = () =>
			setBox({
				w: Math.min(OPEN_W, window.innerWidth - 32),
				h: Math.min(
					OPEN_H,
					window.innerHeight * 0.6,
					total * ROW_H + 44 + FOOTER_H,
				),
			});
		calc();
		window.addEventListener("resize", calc);
		return () => window.removeEventListener("resize", calc);
	}, [total]);

	// The sliver left visible at rest is the panel's bottom-left corner, sized to
	// the pill sitting directly beneath it. Both keyframes stay pure percentages —
	// a `calc()` inside `inset()` degrades motion's interpolation to a hard swap.
	const pillClip = `inset(${((1 - PILL_H / box.h) * 100).toFixed(2)}% ${(
		(1 - CLOSED_W / box.w) *
		100
	).toFixed(2)}% 0% 0% round 18px)`;

	// GotoTop shares this corner band and outranks everything at z-9999, so it
	// stands down while the panel is up.
	useEffect(() => {
		setNavOverlayOpen(open);
	}, [open, setNavOverlayOpen]);
	useEffect(() => () => setNavOverlayOpen(false), [setNavOverlayOpen]);

	// Outside-pointerdown + Escape, only while open. Capture phase so a tap that
	// starts a scroll gesture elsewhere on the page dismisses immediately.
	useEffect(() => {
		if (!open) return;
		const onDown = (e: PointerEvent) => {
			const t = e.target as Node;
			if (!panelRef.current?.contains(t) && !pillRef.current?.contains(t)) {
				setOpen(false);
			}
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			setOpen(false);
			pillRef.current?.focus();
		};
		document.addEventListener("pointerdown", onDown, true);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("pointerdown", onDown, true);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	const select = useCallback(
		(id: string) => {
			onJump(id);
			setOpen(false);
		},
		[onJump],
	);

	// Filtered down to nothing — a nav with no destinations is a dead control.
	if (total === 0) return null;

	return (
		<div className="fixed bottom-4 start-2 z-111 lg:hidden">
			<motion.button
				ref={pillRef}
				type="button"
				aria-haspopup="dialog"
				aria-expanded={open}
				aria-label={
					open
						? t("collapseLabel", {
								title: sectionTitle(activeItem.title),
								position,
								total,
							})
						: t("expandLabel", {
								title: sectionTitle(activeItem.title),
								position,
								total,
							})
				}
				onClick={() => setOpen((o) => !o)}
				initial={false}
				animate={{ width: open ? box.w : CLOSED_W }}
				transition={
					open
						? // Track the panel's clip-grow on the same beat.
							{ duration: 0.42, ease: IOS_EASE }
						: // Springy yoyo back to the compact readout.
							{ type: "spring", bounce: 0.5, duration: 0.7 }
				}
				style={{ willChange: "width" }}
				className="relative flex h-8 items-center gap-2 overflow-hidden rounded-full border border-hairline bg-panel/80 px-2 text-start shadow-lg shadow-black/20 backdrop-blur-2xl transition-colors hover:border-accent-muted focus-visible:border-accent focus-visible:outline-none"
			>
				<MiniRing value={position / total} />

				<AnimatePresence mode="popLayout" initial={false}>
					<motion.span
						key={activeItem.id}
						initial={{ opacity: 0, y: 4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -4 }}
						transition={{ duration: 0.12 }}
						className="min-w-0 max-w-34 truncate font-sans font-medium text-xs text-ink-dim"
					>
						{sectionTitle(activeItem.title)}
					</motion.span>
				</AnimatePresence>

				<span className="ms-auto shrink-0 pe-1 font-mono text-[10px] tabular-nums text-ink-mute">
					{position}/{total}
				</span>
			</motion.button>

			{/* Keyed child directly under AnimatePresence — wrapping it in a fragment
			    would skip the exit animation, since AnimatePresence doesn't recurse. */}
			<AnimatePresence custom={{ pillClip }}>
				{open && (
					<motion.div
						key="panel"
						ref={panelRef}
						role="dialog"
						aria-modal="false"
						aria-label={t("sections")}
						variants={panelVariants}
						custom={{ pillClip }}
						initial="initial"
						animate="animate"
						exit="exit"
						style={{
							width: box.w,
							maxHeight: box.h,
							willChange: "clip-path, opacity",
						}}
						className="absolute bottom-9 start-0 z-30 flex origin-bottom-left flex-col overflow-hidden rounded-xl border border-hairline bg-panel/80 backdrop-blur-2xl"
					>
						{/* The scroll lives on this inner box, not the panel: the panel
						    itself has to stay unscrolled so the footer below can hold
						    the floor while the list moves behind it. */}
						<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 scrollbar-none">
							<p className="px-2 pb-1 pt-0.5 font-display text-[10px] uppercase tracking-[0.2em] text-ink-mute">
								{t("sections")}
							</p>
							<ul>
								{sections.map((section) => {
									const isActive = section.id === active;
									return (
										<li key={section.id}>
											<a
												href={`#${section.id}`}
												onClick={() => select(section.id)}
												aria-current={isActive ? "true" : undefined}
												className={cn(
													"block truncate rounded-sm border-s-2 px-2 py-1.5 font-sans text-sm transition-colors",
													isActive
														? "border-accent bg-accent/10 text-accent"
														: "border-transparent text-ink-dim hover:bg-raised/40 hover:text-ink",
												)}
											>
												{sectionTitle(section.title)}
											</a>
										</li>
									);
								})}
							</ul>
						</div>

						{/* Flame controls. Deliberately does not close the panel — the
						    point is to watch the background react while toggling. */}
						<div className="shrink-0 border-t border-hairline bg-panel/60 px-3 py-2">
							<CookbookFlameControlsMobile />
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

function MiniRing({ value }: { value: number }) {
	const size = 32;
	const stroke = 3;
	const r = (size - stroke) / 2;
	return (
		<span
			aria-hidden
			className="relative grid size-5 shrink-0 place-items-center"
		>
			<svg
				width={size}
				height={size}
				viewBox={`0 0 ${size} ${size}`}
				className="size-5 -rotate-90"
			>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={r}
					className="fill-none stroke-current text-accent/15"
					strokeWidth={stroke}
				/>
				<motion.circle
					cx={size / 2}
					cy={size / 2}
					r={r}
					fill="none"
					className="stroke-current text-accent"
					strokeWidth={stroke}
					strokeLinecap="round"
					initial={false}
					animate={{ pathLength: value }}
					transition={{ duration: 0.5, ease: IOS_EASE, type: "spring" }}
				/>
			</svg>
		</span>
	);
}
