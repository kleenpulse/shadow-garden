"use client";

import type { PreviewProps } from "@/lib/registry/types";
import WorldMapAscii from "./world-map-ascii";

export default function WorldMapAsciiPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	const still = paused || reducedMotion;
	return (
		<WorldMapAscii
			color={values.color as string}
			particleSize={values.particleSize as number}
			density={values.density as number}
			mouseRadius={values.mouseRadius as number}
			drift={still ? 0 : (values.drift as number)}
			paused={still}
		/>
	);
}
