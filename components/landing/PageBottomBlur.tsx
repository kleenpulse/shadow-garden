"use client";

import { useEffect, useRef } from "react";
import MaskBlur from "@/components/registry/mask-blur/mask-blur";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

// Fixed frosted strip along the bottom of the viewport that blurs content
// scrolling under it. Its vertical offset is driven by scroll position:
//  - tucked below the fold while the hero (first svh) is in view,
//  - risen into place for the body of the page,
//  - tucked away again as the page bottoms out, so the footer is read clean.
// We move it with the `bottom` offset rather than `transform` on purpose — a
// transformed ancestor becomes a backdrop root and the backdrop-filter would blur nothing.

// Fraction of a viewport over which the strip sinks back out at the end. The
// rise window is 0.2svh, so this is a touch longer: the approach to the footer
// should read as settling, not as the strip being yanked away.
const SINK_SPAN = 0.25;

interface PageBottomBlurProps {
	/** Merged onto the fixed strip. `inset-x-0` is the default span, so a
	 *  caller under the docs sidebar passes `lg:start-(--sg-sidebar-w,18rem)`. */
	className?: string;
	/** Pinned in place, never scroll-driven. */
	static?: boolean;
	/** Whether the page opens on a full-viewport hero the strip hides under
	 *  before rising. Off, the strip is up from the first pixel and only sinks
	 *  at the end. Ignored when static. */
	hero?: boolean;
	/** Deepen the frost toward the page surface colour, so the strip reads as
	 *  a shadowed sill rather than clear glass. */
	shade?: boolean;
}

export default function PageBottomBlur({
	className,
	static: isStatic = false,
	hero = true,
	shade = false,
}: PageBottomBlurProps) {
	const ref = useRef<HTMLDivElement>(null);
	// Trim the stacked backdrop-filter layers on phones — 6 full-width blur passes
	// are costly on mobile GPUs; 3 is visually identical on a thin strip.
	const compact = useMediaQuery("(max-width: 640px)");

	useEffect(() => {
		const el = ref.current;
		if (isStatic || !el) return;
		// Full strip height → offset needed to clear it entirely below the fold.
		// Cached alongside the scroll limit: reading scrollHeight inside the scroll
		// handler would force a layout on every frame of every scroll, and this
		// page carries masonry and a WebGL backdrop that cannot spare it.
		let sinkMax = el.offsetHeight || 112;
		let limit = 0;
		let ticking = false;

		const measure = () => {
			sinkMax = el.offsetHeight || 112;
			limit = document.documentElement.scrollHeight - window.innerHeight;
		};

		const apply = () => {
			ticking = false;
			const scrollY = window.scrollY;
			const innerH = window.innerHeight;
			// Rise out from under the hero: 0 while it fills the view, 1 once its
			// last quarter has scrolled past.
			const revealStart = innerH * 0.75;
			const revealEnd = innerH * 0.95;
			const rise = hero ? clamp((scrollY - revealStart) / (revealEnd - revealStart)) : 1;
			// Sink back out as the page bottoms out, so the footer is not read
			// through frosted glass. Guarded on `limit`: a page too short to scroll
			// has no end to approach, and dividing by it would tuck the strip away
			// permanently.
			const sink = limit > 0 ? clamp((limit - scrollY) / (innerH * SINK_SPAN)) : 1;
			// Whichever end wants it hidden more wins, so the two windows can never
			// fight on a page short enough for them to overlap.
			const shown = Math.min(rise, sink);

			el.style.bottom = `${-(1 - shown) * sinkMax}px`;
		};

		const onScroll = () => {
			if (!ticking) {
				ticking = true;
				requestAnimationFrame(apply);
			}
		};

		const onResize = () => {
			measure();
			onScroll();
		};

		measure();
		apply();
		// The page grows as images and previews resolve, which moves the scroll
		// end; a resize listener alone never hears about that.
		const observer = new ResizeObserver(onResize);
		observer.observe(document.body);
		observer.observe(el);
		window.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("resize", onResize, { passive: true });
		return () => {
			observer.disconnect();
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("resize", onResize);
		};
		// `compact` swaps the strip height, so the cached sinkMax must be re-measured.
	}, [isStatic, hero, compact]);

	return (
		<div
			ref={ref}
			aria-hidden
			style={{
				// Start tucked away; the scroll handler takes over on mount.
				bottom: isStatic ? "0rem" : "-8rem",
				height: compact ? "3rem" : "5rem",
			}}
			className={cn("pointer-events-none fixed inset-x-0 z-[110]", className)}
		>
			{shade ? (
				<div className="absolute inset-0 bg-linear-to-b from-transparent via-surface/70 to-surface" />
			) : null}
			<MaskBlur
				target="parent"
				position="bottom"
				exponential
				strength={3}
				divCount={compact ? 3 : 6}
				opacity={1}
				height={compact ? "3rem" : "5rem"}
			/>
		</div>
	);
}

const clamp = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
