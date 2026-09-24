"use client";

import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type MouseEvent,
} from "react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { useLenis } from "lenis/react";
import { SECTION_IDS, type NavSection } from "@/components/landing/data";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDataCopy } from "@/lib/i18n/data-copy";
import { useMediaQuery } from "@/hooks/use-media-query";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { useScramble } from "@/hooks/use-scramble";
import { cn } from "@/lib/utils";

// The four framing ticks (Top/Calibration/Sealed Archive/Colophon) key off
// landing.nav.<id>; every other tick is a registry category and keys off the
// shared pages.categories.<slug> namespace instead — anchorFor(category)
// already produces that slug, and it's what `id` is built from in data.ts.
const STATIC_NAV_IDS = new Set<string>(Object.values(SECTION_IDS));

// The section rail — a fixed column of ticks in the frame's right gutter, one
// per plate. Context aware: idle (no scroll, no hover) every tick is a dot;
// while the page scrolls or the pointer is anywhere over the gutter they grow
// to full length. Hover a tick and its label decodes from cryptic glyphs;
// click it and lenis glides you there. Desktop with a real pointer only —
// a tick-rail has no place on touch, and below `lg` the gutter is too narrow
// to hold it. It renders null on the server + first client paint so there's
// no hydration seam.

const EASE = [0.22, 1, 0.36, 1] as const;
const RAIL_MEDIA = "(min-width: 1024px) and (hover: hover) and (pointer: fine)";
// px from the viewport top. A section is "current" once its top crosses this.
// Deeper than the widest landing offset (header + scroll-mt) so a jump never
// hands the tick straight back to the previous section.
const ACTIVE_LINE = 120;
// Extra hold after Lenis goes idle / the pointer leaves before ticks shrink.
const HOLD_MS = 600;
// easeOutCubic — the glide from the source rail.
const JUMP = { duration: 1.4, easing: (t: number) => 1 - Math.pow(1 - t, 3) };
// Dot ↔ line morph. A soft ease-in-out, not the site's quint: on a ~28px width
// change the quint's hard start reads as a snap. The change ripples outward
// from the active tick, `TICK_STAGGER_MS` per step.
const TICK_MS = 550;
const TICK_EASE = "cubic-bezier(0.45, 0.05, 0.2, 1)";
const TICK_STAGGER_MS = 25;

export default function SectionRail({ sections }: { sections: NavSection[] }) {
	const t = useTranslations("landing.nav");
	const copy = useDataCopy();
	const isDesktop = useMediaQuery(RAIL_MEDIA);
	const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? "");
	const [expanded, setExpanded] = useState(false);

	// The three inputs live in refs so per-frame calls cost nothing when
	// nothing changed; `sync` folds them into the one rendered boolean.
	const hovering = useRef(false);
	const focusWithin = useRef(false);
	const scrolling = useRef(false);
	const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastScroll = useRef<number | null>(null);

	const sync = () =>
		setExpanded(hovering.current || focusWithin.current || scrolling.current);
	const clearHold = () => {
		if (hold.current) clearTimeout(hold.current);
		hold.current = null;
	};
	// One timer for both idle paths. It always ends the scrolling state; if the
	// pointer is still over the gutter `sync` keeps the rail open anyway.
	const armHold = () => {
		clearHold();
		hold.current = setTimeout(() => {
			hold.current = null;
			scrolling.current = false;
			sync();
		}, HOLD_MS);
	};
	useEffect(() => clearHold, []);

	const labelFor = (section: NavSection) =>
		STATIC_NAV_IDS.has(section.id)
			? copy(`landing.nav.${section.id}`, section.label)
			: copy(`pages.categories.${section.id}`, section.label);

	// Active tick = the last section whose top has crossed the line, clamped to
	// the final section once the page bottoms out (so the short η footer still
	// lights).
	const spy = (scroll: number, limit: number) => {
		if (sections.length === 0) return;
		let current = sections[0].id;
		if (scroll >= limit - 2) {
			current = sections[sections.length - 1].id;
		} else {
			for (const s of sections) {
				const el = document.getElementById(s.id);
				if (el && el.getBoundingClientRect().top <= ACTIVE_LINE) current = s.id;
			}
		}
		setActiveId(current);
	};

	const lenis = useLenis((lenis) => {
		// Clamp ignores rubber-band overscroll.
		const scroll = Math.max(0, Math.min(lenis.scroll, lenis.limit));
		const prev = lastScroll.current;
		lastScroll.current = scroll;
		// useLenis invokes the callback on registration (every render); that is
		// not a scroll, and a reload mid-page must not pop the rail open.
		if (prev !== null && scroll !== prev) {
			clearHold();
			if (!scrolling.current) {
				scrolling.current = true;
				sync();
			}
		}
		if (lenis.isScrolling === false && scrolling.current && !hold.current)
			armHold();
		spy(scroll, lenis.limit);
	});

	// Lenis does not emit on resize; the line a section has to cross does move.
	useEffect(() => {
		if (!lenis) return;
		const onResize = () => spy(lenis.scroll, lenis.limit);
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
		// `spy` closes over `sections`; re-binding per section list keeps it fresh.
	}, [lenis, sections]);

	// Reduced-motion fallback: SmoothScroll is absent, so there is no lenis to
	// drive the spy — a rAF-throttled window scroll listener covers it instead.
	useEffect(() => {
		if (lenis || !isDesktop) return;
		let frame = 0;
		const measure = () => {
			frame = 0;
			const limit = document.documentElement.scrollHeight - window.innerHeight;
			spy(Math.max(0, Math.min(window.scrollY, limit)), limit);
		};
		const onScroll = () => {
			if (frame) return;
			frame = window.requestAnimationFrame(measure);
		};
		measure();
		window.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("resize", onScroll);
		return () => {
			if (frame) window.cancelAnimationFrame(frame);
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("resize", onScroll);
		};
	}, [lenis, isDesktop, sections]);

	const jumpTo = useCallback(
		(id: string, e: MouseEvent<HTMLAnchorElement>) => {
			if (!lenis) return; // reduced motion → SmoothScroll is absent → native jump
			e.preventDefault();
			// Every section carries scroll-mt-10, so the anchor scroll lands clear
			// of the top edge on its own — no manual offset math needed. The
			// header is taller than that margin, but it auto-hides: a downward
			// jump pushes it off screen before the target lands, and an upward
			// jump reveals it over the same 24px it already covered back when the
			// header was permanently fixed. The first section just means "top".
			if (id === sections[0]?.id) lenis.scrollTo(0, JUMP);
			else lenis.scrollTo(`#${id}`, JUMP);
			history.pushState(null, "", `#${id}`);
		},
		[lenis, sections],
	);

	if (!isDesktop || sections.length === 0) return null;

	const activeIndex = sections.findIndex((s) => s.id === activeId);

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.5, ease: EASE }}
			data-expanded={expanded}
			// The hover zone is the whole right gutter. Nothing else lives there
			// except GotoTop, which sits above at z-9999 and stays clickable —
			// as does the header (z-99) over this z-40 strip. Anchored to the
			// page's max-w-7xl column, not the viewport: past 80rem the strip
			// keeps the same 6px inset from the column edge it has at `lg`.
			className="fixed inset-y-0 right-[calc(max(0px,(100%_-_80rem)/2)_+_0.375rem)] z-40 w-10"
			onPointerEnter={() => {
				hovering.current = true;
				sync();
			}}
			onPointerLeave={() => {
				hovering.current = false;
				armHold();
			}}
			onFocusCapture={() => {
				focusWithin.current = true;
				sync();
			}}
			onBlurCapture={(e) => {
				if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
				focusWithin.current = false;
				armHold();
			}}
		>
			<TooltipProvider delay={0}>
				<nav
					aria-label={t("ariaLabel")}
					className="absolute top-1/2 right-0.5 -translate-y-1/2"
				>
					<ol className="flex flex-col items-end gap-3">
						{sections.map((section, i) => (
							<li key={section.id}>
								<RailTick
									section={section}
									label={labelFor(section)}
									isActive={section.id === activeId}
									expanded={expanded}
									delay={
										Math.abs(i - Math.max(0, activeIndex)) * TICK_STAGGER_MS
									}
									onJump={jumpTo}
								/>
							</li>
						))}
					</ol>
				</nav>
			</TooltipProvider>
		</motion.div>
	);
}

function RailTick({
	section,
	label,
	isActive,
	expanded,
	delay,
	onJump,
}: {
	section: NavSection;
	label: string;
	isActive: boolean;
	expanded: boolean;
	delay: number;
	onJump: (id: string, e: MouseEvent<HTMLAnchorElement>) => void;
}) {
	// Mirror Base UI's open state so the scramble only runs while the popup shows.
	const [open, setOpen] = useState(false);

	return (
		<Tooltip onOpenChange={setOpen}>
			<TooltipTrigger
				className="group flex cursor-pointer items-center py-1.5 ps-6 outline-none"
				render={
					<a
						href={`#${section.id}`}
						aria-label={label}
						aria-current={isActive ? "true" : undefined}
						onClick={(e) => onJump(section.id, e)}
					/>
				}
			>
				<span
					aria-hidden
					// Only width morphs. Height is fixed per tick (active vs not) so the
					// dot grows sideways into a line of the same weight; a height that
					// also tweened would flatten every tick on the way out.
					style={{
						transition: `width ${TICK_MS}ms ${TICK_EASE} ${delay}ms, background-color 300ms ease`,
					}}
					className={cn(
						"block rounded-full",
						isActive
							? "h-1.5 bg-accent"
							: "h-1 bg-ink-mute/50 group-hover:bg-ink group-focus-visible:bg-ink",
						expanded
							? isActive
								? "w-7"
								: "w-4 group-hover:w-5 group-focus-visible:w-5"
							: isActive
							? "w-1.5"
							: "w-1",
					)}
				/>
			</TooltipTrigger>
			<TooltipContent side="left" sideOffset={8}>
				<TickLabel target={label} active={open} />
			</TooltipContent>
		</Tooltip>
	);
}

function TickLabel({ target, active }: { target: string; active: boolean }) {
	const reduced = usePrefersReducedMotion();
	// Duration is held ~constant in the hook, so "POWER-USER SYSTEMS" and "TOP"
	// decode in about the same wall-clock time.
	const text = useScramble(target, active, { reduced });

	return (
		<span className="block whitespace-nowrap">
			<span className="sr-only">{target}</span>
			<span aria-hidden>{text}</span>
		</span>
	);
}
