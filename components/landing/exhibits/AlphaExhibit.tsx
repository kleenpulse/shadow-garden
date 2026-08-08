"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import ExhibitFrame from "@/components/landing/ExhibitFrame";
import PreviewBoundary from "@/components/shell/PreviewBoundary";

const DotField = dynamic(
	() => import("@/components/registry/dot-field/dot-field"),
	{
		ssr: false,
	},
);

// The α exhibit is the one plate visual that isn't a dark-only WebGL glow — the
// DotField is canvas-2D and reads fine on a light surface. So it gets a
// theme-aware palette instead of the forced-graphite plate: subtle purple on
// graphite in dark, stronger amethyst on the light panel where thin dots would
// otherwise wash out. Dark stays the default (matches defaultTheme + no flash).
const PALETTE = {
	dark: {
		gradientFrom: "rgba(168, 85, 247, 0.35)",
		gradientTo: "rgba(180, 151, 207, 0.25)",
		glowColor: "#a855f7",
	},
	light: {
		gradientFrom: "rgba(126, 34, 206, 0.55)",
		gradientTo: "rgba(88, 28, 135, 0.4)",
		glowColor: "#7e22ce",
	},
} as const;

// α — Backgrounds. Live DotField (canvas-2D, cheap): ambient wave while in view,
// cursor bulge on hover.
export default function AlphaExhibit() {
	const { resolvedTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	// Until mounted, resolvedTheme is unknown on both server and first client
	// render — pin to dark so hydration matches, then swap if the user is on light.
	const isDark = !mounted || resolvedTheme !== "light";
	const palette = isDark ? PALETTE.dark : PALETTE.light;

	return (
		<ExhibitFrame plate={isDark} className="h-72 sm:h-105">
			{({ active }) => (
				<div className="absolute inset-0">
					<PreviewBoundary slug="dot-field" label="DotField" variant="stage">
						<DotField
							sparkle={false}
							waveAmplitude={active ? 6 : 0}
							paused={!active}
							gradientFrom={palette.gradientFrom}
							gradientTo={palette.gradientTo}
							glowColor={palette.glowColor}
							dotRadius={active ? 2 : 1}
						/>
					</PreviewBoundary>
				</div>
			)}
		</ExhibitFrame>
	);
}
