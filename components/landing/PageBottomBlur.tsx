"use client";

import { useEffect, useRef } from "react";
import GradualBlur from "@/components/registry/gradual-blur/GradualBlur";

// Fixed frosted strip along the bottom of the viewport that blurs content
// scrolling under it. Its vertical offset is driven directly by scroll position:
//  - tucked below the fold while the hero (first svh) is in view,
//  - risen into place through the content sections,
//  - sunk back below the fold over the last stretch so the footer reads clean.
// Everything is scroll-linked (1:1, reverses on the way up). We move it with the
// `bottom` offset rather than `transform` on purpose — a transformed ancestor
// becomes a backdrop root and the backdrop-filter would blur nothing.

const SINK_RANGE = 200; // px from the page bottom over which the strip sinks away

export default function PageBottomBlur() {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		// Full strip height → offset needed to clear it entirely below the fold.
		const sinkMax = el.offsetHeight || 112;
		let ticking = false;

		const apply = () => {
			ticking = false;
			const scrollY = window.scrollY;
			const innerH = window.innerHeight;
			const docH = document.documentElement.scrollHeight;

			// Rise out from under the hero: 0 while the hero fills the view, → 1 as its
			// last quarter scrolls past.
			const revealStart = innerH * 0.75;
			const revealEnd = innerH * 0.95;
			const rise = clamp((scrollY - revealStart) / (revealEnd - revealStart));

			// Sink toward the footer: 0 mid-page, → 1 over the last SINK_RANGE px.
			const gap = docH - (scrollY + innerH);
			const sink = clamp(1 - gap / SINK_RANGE);

			// How far "up" the strip sits (1 = fully in place, 0 = fully tucked away).
			const visible = rise * (1 - sink);
			el.style.bottom = `${-(1 - visible) * sinkMax}px`;
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
	}, []);

	return (
		<div
			ref={ref}
			aria-hidden
			style={{
				position: "fixed",
				left: 0,
				right: 0,
				bottom: "-8rem", // start tucked away; the scroll handler takes over on mount
				height: "5rem",
				zIndex: 110,
				pointerEvents: "none",
			}}
		>
			<GradualBlur
				target="parent"
				position="bottom"
				exponential
				strength={3}
				divCount={6}
				opacity={1}
				height="5rem"
			/>
		</div>
	);
}

const clamp = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
