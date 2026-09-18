"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import ExhibitFrame from "@/components/landing/ExhibitFrame";
import PreviewBoundary from "@/components/shell/PreviewBoundary";

const Contour = dynamic(() => import("@/components/registry/contour/contour"), {
	ssr: false,
});

// The α exhibit is the one plate visual that isn't a dark-only WebGL glow —
// Contour is canvas-2D and reads fine on a light surface. So it gets a
// theme-aware palette instead of the forced-graphite plate. Contour paints its
// own paper, so the background matches the surrounding surface per theme:
// its native graphite in dark, the light panel white in light, where the
// ordinary contours go a touch heavier so they don't wash out. Dark stays the
// default (matches defaultTheme + no flash).
const PALETTE = {
	dark: {
		background: "#0d0d12",
		lineColor: "#5b5772",
		indexColor: "#a855f7",
	},
	light: {
		background: "#ffffff",
		lineColor: "#c6c1d6",
		indexColor: "#7e22ce",
	},
} as const;

// α — Backgrounds. Live Contour (canvas-2D, cheap): terrain drifts while in
// view, the pointer raises a hill the rings route around on hover.
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
					<PreviewBoundary slug="contour" label="Contour" variant="stage">
						<Contour
							// Palette props only land on the next drawn frame, and the loop
							// halts under reduced motion / when inactive — a theme flip would
							// leave the old paper on screen. Remount instead; the terrain is
							// noise, so a fresh map costs nothing visible.
							key={isDark ? "dark" : "light"}
							paused={!active}
							background={palette.background}
							lineColor={palette.lineColor}
							indexColor={palette.indexColor}
						/>
					</PreviewBoundary>
				</div>
			)}
		</ExhibitFrame>
	);
}
