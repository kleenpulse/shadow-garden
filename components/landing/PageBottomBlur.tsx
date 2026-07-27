"use client";

import { useEffect, useRef } from "react";
import GradualBlur from "@/components/registry/gradual-blur/GradualBlur";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

// Fixed frosted strip along the bottom of the viewport that blurs content
// scrolling under it. Its vertical offset is driven by scroll position:
//  - tucked below the fold while the hero (first svh) is in view,
//  - risen into place, then cemented flush to the bottom for the rest of the page.
// We move it with the `bottom` offset rather than `transform` on purpose — a
// transformed ancestor becomes a backdrop root and the backdrop-filter would blur nothing.

export default function PageBottomBlur({ className }: { className?: string }) {
	const ref = useRef<HTMLDivElement>(null);
	// Trim the stacked backdrop-filter layers on phones — 6 full-width blur passes
	// are costly on mobile GPUs; 3 is visually identical on a thin strip.
	const compact = useMediaQuery("(max-width: 640px)");

	useEffect(() => {
		const el = ref.current;
		if (className) return; // if a className is provided, we don't want to apply the scroll effect
		if (!el) return;
		// Full strip height → offset needed to clear it entirely below the fold.
		const sinkMax = el.offsetHeight || 112;
		let ticking = false;

		const apply = () => {
			ticking = false;
			const scrollY = window.scrollY;
			const innerH = window.innerHeight;
			// Rise out from under the hero (0 while it fills the view → 1 as its last
			// quarter scrolls past), then stay cemented flush to the bottom for the rest
			// of the page — no sink-away at the footer.
			const revealStart = innerH * 0.75;
			const revealEnd = innerH * 0.95;
			const rise = clamp((scrollY - revealStart) / (revealEnd - revealStart));

			el.style.bottom = `${-(1 - rise) * sinkMax}px`;
		};

		const onScroll = () => {
			if (!ticking) {
				ticking = true;
				requestAnimationFrame(apply);
			}
		};

		apply();
		window.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("resize", onScroll, { passive: true });
		return () => {
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("resize", onScroll);
		};
	}, [className]);

	return (
		<div
			ref={ref}
			aria-hidden
			style={{
				position: "fixed",
				left: 0,
				right: 0,
				bottom: className ? "0rem" : "-8rem", // start tucked away; the scroll handler takes over on mount
				height: compact ? "3rem" : "5rem",
				zIndex: 110,
				pointerEvents: "none",
			}}
			className={cn(className)}
		>
			<GradualBlur
				target={className ? "page" : "parent"}
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
