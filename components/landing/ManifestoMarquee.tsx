"use client";

import { useTranslations } from "next-intl";
import MarqueeVelocity from "./marquee-velocity";
import PreviewBoundary from "@/components/shell/PreviewBoundary";

// One creed cycle — MarqueeVelocity tiles this to fill the band, so the
// trailing separator is what keeps the seam reading as another beat.
function Creed() {
	const t = useTranslations("landing.manifesto");
	// Four separate literal-key calls rather than mapping over an id array —
	// next-intl's typed `t()` chokes on a union-typed key argument here
	// (TS2590, "union type too complex"), same shape already tolerated
	// elsewhere in the codebase (components/shell/PreviewErrorFallback.tsx).
	const CREED = [t("dark"), t("light"), t("parameters"), t("uncalibrated")];
	return (
		<span className="flex items-center font-display text-[11px] uppercase tracking-[0.3em] text-ink-mute">
			{CREED.map((line, i) => (
				<span key={i} className="flex items-center">
					{line}
					<span className="mx-6 text-accent/60">·</span>
				</span>
			))}
		</span>
	);
}

// Manifesto band — the registry's own MarqueeVelocity, one row, drifting on
// page scroll velocity. The component reads the OS reduced-motion preference
// itself and parks the row when it's set.
export default function ManifestoMarquee() {
	return (
		<div
			className="flex h-10.5 items-center border-y border-hairline"
			aria-hidden
		>
			<PreviewBoundary
				slug="marquee-velocity"
				label="MarqueeVelocity"
				variant="silent"
			>
				<MarqueeVelocity
					velocity={28}
					damping={30}
					stiffness={650}
					containerClassName="w-full"
				>
					<Creed />
				</MarqueeVelocity>
			</PreviewBoundary>
		</div>
	);
}
