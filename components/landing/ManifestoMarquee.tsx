"use client";

import MarqueeVelocity from "@/components/registry/marquee-velocity/marquee-velocity";
import PreviewBoundary from "@/components/shell/PreviewBoundary";

const CREED = [
	"We operate in the dark",
	"We render in the light",
	"Every parameter accounted for",
	"Nothing ships uncalibrated",
];

// One creed cycle — MarqueeVelocity tiles this to fill the band, so the
// trailing separator is what keeps the seam reading as another beat.
function Creed() {
	return (
		<span className="flex items-center font-display text-[11px] uppercase tracking-[0.3em] text-ink-mute">
			{CREED.map((line) => (
				<span key={line} className="flex items-center">
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
