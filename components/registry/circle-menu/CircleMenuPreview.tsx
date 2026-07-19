"use client";

import type { PreviewProps } from "@/lib/registry/types";
import CircleMenu from "./CircleMenu";

const DEMO_ITEMS = ["HOME", "GARDEN", "REGISTRY", "ABOUT"];

export default function CircleMenuPreview({
	values,
	reducedMotion,
}: PreviewProps) {
	return (
		// Unthemed dark stage — the overlay bloom needs a surface to wipe over.
		<div className="relative h-full w-full overflow-hidden bg-bench-950">
			{/* Backdrop content so the reveal visibly covers something. */}
			<div className="flex h-full w-full flex-col items-center justify-center gap-3">
				<span className="font-display text-2xl tracking-tight text-white/25 md:text-4xl">
					SHADOW GARDEN
				</span>
				<span className="font-display text-[10px] uppercase tracking-[0.28em] text-white/20">
					Open the menu — the circle blooms over this
				</span>
			</div>
			<div className="absolute inset-x-8 top-1/3 h-px bg-white/5" />
			<div className="absolute inset-x-8 bottom-1/3 h-px bg-white/5" />
			<CircleMenu
				items={DEMO_ITEMS}
				openStiffness={values.openStiffness as number}
				stagger={values.stagger as number}
				blur={values.blur as number}
				overlayColor={values.overlayColor as string}
				overlayOpacity={values.overlayOpacity as number}
				reducedMotion={reducedMotion}
				className="font-display"
			/>
		</div>
	);
}
