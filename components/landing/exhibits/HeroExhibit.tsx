"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import ExhibitFrame from "@/components/landing/ExhibitFrame";
import PreviewBoundary from "@/components/shell/PreviewBoundary";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

const Monolith = dynamic(() => import("@/components/registry/monolith/monolith"), {
	ssr: false,
});

// Hero Templates plate. The category sells landing openers, so the exhibit IS
// one: Monolith live in the frame, running only while in view, headline
// overlay laid on top the way a consumer would compose it.
export default function HeroExhibit() {
	const reducedMotion = usePrefersReducedMotion();
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	return (
		<ExhibitFrame plate className="h-72 sm:h-105">
			{({ active }) => (
				<div className="absolute inset-0">
					<PreviewBoundary slug="monolith" label="Monolith" variant="stage">
						<Monolith
							paused={!active || !mounted}
							reducedMotion={reducedMotion}
						/>
					</PreviewBoundary>
					{/* The plate is hardcoded dark (Monolith is a dark-only scene), so the
					    overlay hardcodes light text too — semantic ink tokens would flip
					    dark in light mode and vanish. Same rule as the sealed archive. */}
					<div className="pointer-events-none absolute inset-x-6 bottom-6 sm:inset-x-10">
						<p className="font-display text-[10px] tracking-[0.32em] text-bench-500 uppercase">
							hero templates
						</p>
						<h3 className="mt-2 font-title text-2xl font-black leading-none tracking-tight text-bench-100 sm:text-4xl">
							MONO<span className="text-amethyst">·</span>LITH
						</h3>
					</div>
				</div>
			)}
		</ExhibitFrame>
	);
}
