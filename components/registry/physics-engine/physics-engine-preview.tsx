"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import PhysicsEngine, { type PhysicsScene } from "./physics-engine";
import type { PreviewProps } from "@/lib/registry/types";

// Blueprint palettes. The canvas draws with raw JS colors, so the preview —
// not the component — owns theme awareness (same split as the DotField
// exhibit): deep graphite-blue drafting board in dark, graph paper in light.
const PALETTE = {
	dark: {
		background: "#0b0f16",
		gridMinor: "rgba(148, 163, 184, 0.07)",
		gridMajor: "rgba(148, 163, 184, 0.16)",
		ink: "rgba(226, 232, 240, 0.85)",
		staticColor: "rgba(148, 163, 184, 0.45)",
	},
	light: {
		background: "#f6f8fa",
		gridMinor: "rgba(15, 23, 42, 0.08)",
		gridMajor: "rgba(15, 23, 42, 0.16)",
		ink: "rgba(15, 23, 42, 0.8)",
		staticColor: "rgba(71, 85, 105, 0.5)",
	},
} as const;

export default function PhysicsEnginePreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	const { resolvedTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	// Pin dark until mounted so hydration matches the default theme.
	const isDark = !mounted || resolvedTheme !== "light";
	const palette = isDark ? PALETTE.dark : PALETTE.light;

	return (
		<div className="relative h-full min-h-80 w-full">
			<PhysicsEngine
				scene={values.scene as PhysicsScene}
				gravity={values.gravity as number}
				restitution={values.restitution as number}
				friction={values.friction as number}
				timeScale={values.timeScale as number}
				bodyCount={values.bodyCount as number}
				sizeVariation={values.sizeVariation as number}
				showVectors={values.showVectors as boolean}
				trails={values.trails as boolean}
				showEnergy={values.showEnergy as boolean}
				tint={values.tint as string}
				background={palette.background}
				gridMinor={palette.gridMinor}
				gridMajor={palette.gridMajor}
				ink={palette.ink}
				staticColor={palette.staticColor}
				reducedMotion={paused || reducedMotion}
			/>
		</div>
	);
}
