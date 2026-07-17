"use client";

import type { PreviewProps } from "@/lib/registry/types";
import WorldMapAscii from "./WorldMapAscii";

export default function WorldMapAsciiPreview({
	values,
	reducedMotion,
}: PreviewProps) {
	return (
		<WorldMapAscii
			color={values.color as string}
			particleSize={values.particleSize as number}
			density={values.density as number}
			mouseRadius={values.mouseRadius as number}
			drift={reducedMotion ? 0 : (values.drift as number)}
		/>
	);
}
