"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { useLenis } from "lenis/react";
import type { NavSection } from "@/components/landing/data";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMediaQuery } from "@/hooks/use-media-query";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { useScramble } from "@/hooks/use-scramble";
import { cn } from "@/lib/utils";

// The section rail — a fixed vertical column of ticks on the right edge, one per
// plate, modeled on grok's conversation scrubber. Hover a tick and its label
// decodes from cryptic glyphs; click it and lenis glides you there. Desktop-only
// (a tick-rail has no place on touch), and it renders null on the server + first
// client paint so there's no hydration seam and no portal during SSR.

const ACTIVE_LINE = 96; // px below the fixed header where a section turns "current"

export default function SectionRail({ sections }: { sections: NavSection[] }) {
	const isDesktop = useMediaQuery("(min-width: 1024px)");
	const lenis = useLenis();
	const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? "");

	// Active tick = the last section whose top has crossed the line, clamped to
	// the final section once the page bottoms out (so the short η footer still
	// lights). rAF-throttled; the zero-height #hero at top is the base case.
	useEffect(() => {
		if (!isDesktop) return;
		const ids = sections.map((s) => s.id);
		let frame = 0;

		const measure = () => {
			frame = 0;
			const atBottom =
				window.innerHeight + window.scrollY >=
				document.documentElement.scrollHeight - 2;
			if (atBottom) {
				setActiveId(ids[ids.length - 1] ?? "");
				return;
			}
			let current = ids[0] ?? "";
			for (const id of ids) {
				const el = document.getElementById(id);
				if (el && el.getBoundingClientRect().top <= ACTIVE_LINE) current = id;
			}
			setActiveId(current);
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
	}, [isDesktop, sections]);

	const jumpTo = useCallback(
		(id: string, e: MouseEvent<HTMLAnchorElement>) => {
			if (!lenis) return; // reduced motion → SmoothScroll is absent → native jump
			e.preventDefault();
			// scrollTo reads the target's scroll-margin-top, so scroll-mt-10 holds.
			lenis.scrollTo(`#${id}`, {
				duration: 2,
				easing: (t) => 1 - Math.pow(1 - t, 3), // easeOutCubic — matches SmoothAnchor
			});
			history.pushState(null, "", `#${id}`);
		},
		[lenis],
	);

	if (!isDesktop) return null;

	return (
		<TooltipProvider delay={0}>
			<nav
				aria-label="Section navigation"
				className="fixed right-3 top-1/2 z-120 hidden -translate-y-1/2 lg:block"
			>
				<ol className="flex flex-col items-end gap-3">
					{sections.map((section) => (
						<li key={section.id}>
							<RailTick
								section={section}
								isActive={section.id === activeId}
								onJump={jumpTo}
							/>
						</li>
					))}
				</ol>
			</nav>
		</TooltipProvider>
	);
}

function RailTick({
	section,
	isActive,
	onJump,
}: {
	section: NavSection;
	isActive: boolean;
	onJump: (id: string, e: MouseEvent<HTMLAnchorElement>) => void;
}) {
	// Mirror Base UI's open state so the scramble only runs while the popup shows.
	const [open, setOpen] = useState(false);

	return (
		<Tooltip onOpenChange={setOpen}>
			<TooltipTrigger
				className="group flex cursor-pointer items-center py-1.5 pl-6 outline-none"
				render={
					<a
						href={`#${section.id}`}
						aria-label={section.label}
						aria-current={isActive ? "true" : undefined}
						onClick={(e) => onJump(section.id, e)}
					/>
				}
			>
				<span
					aria-hidden
					className={cn(
						"block h-0.5 rounded-full transition-all duration-300 ease-out",
						isActive
							? "w-8 bg-accent"
							: "w-4.5 bg-ink-mute/50 group-hover:w-5 group-hover:bg-ink group-focus-visible:w-5 group-focus-visible:bg-ink",
					)}
				/>
			</TooltipTrigger>
			<TooltipContent side="left" sideOffset={8}>
				<TickLabel target={section.label} active={open} />
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
