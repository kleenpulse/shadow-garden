"use client";

import type { PreviewProps } from "@/lib/registry/types";
import HoverList from "./hover-list";

const DEMO_ITEMS = [
	{ label: "ALPHA", meta: "STRATEGY" },
	{ label: "BETA", meta: "AUTHORSHIP" },
	{ label: "GAMMA", meta: "LOGISTICS" },
	{ label: "DELTA", meta: "FORCE" },
	{ label: "EPSILON", meta: "POLISH" },
	{ label: "ZETA", meta: "ESPIONAGE" },
	{ label: "ETA", meta: "RESEARCH" },
];

export default function HoverListPreview({
	values,
	reducedMotion,
}: PreviewProps) {
	return (
		<div className="flex h-full w-full items-center overflow-hidden px-6 md:px-10">
			<HoverList
				items={DEMO_ITEMS}
				highlightColor={values.highlightColor as string}
				invertedColor={values.invertedColor as string}
				stiffness={values.stiffness as number}
				damping={values.damping as number}
				indent={values.indent as number}
				textSize={values.textSize as "sm" | "md" | "lg"}
				showIcon={values.showIcon as boolean}
				rounded={values.rounded as number}
				reducedMotion={reducedMotion}
				className="w-full font-display text-ink"
			/>
		</div>
	);
}
