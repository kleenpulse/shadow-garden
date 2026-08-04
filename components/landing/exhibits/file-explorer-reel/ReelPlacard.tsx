"use client";

// The beat readout, centred in the shell's storage bar alongside the backend
// meter. The bench already speaks in mono readouts (see SpecimenPlate), so it
// reads as instrumentation on the instrument rather than as a caption stuck to
// the glass.

import { motion, type MotionValue } from "motion/react";
import { cn } from "@/lib/utils";

export default function ReelPlacard({
	index,
	label,
	progress,
}: {
	/** Zero-padded beat number, or null for the reduced-motion still. */
	index: string | null;
	label: string;
	/** Null when there is no beat running to measure. */
	progress: MotionValue<number> | null;
}) {
	const idle = label.length === 0;

	return (
		<div
			className={cn(
				"flex min-w-0 items-center gap-2 font-display text-[10px] uppercase tracking-[0.18em] transition-opacity duration-300",
				idle ? "opacity-0" : "opacity-100",
			)}
		>
			<span aria-hidden className="shrink-0 text-accent">
				▸
			</span>
			{index ? (
				<span className="shrink-0 tabular-nums text-accent">{index}</span>
			) : null}
			{/* aria-live so the beat is announced rather than silently repainted. */}
			<span aria-live="polite" className="min-w-0 truncate text-ink-dim">
				{label}
			</span>
			{progress ? (
				<span
					aria-hidden
					className="hidden h-px w-16 shrink-0 overflow-hidden bg-hairline lg:block"
				>
					<motion.span
						style={{ scaleX: progress, originX: 0 }}
						className="block h-full w-full bg-accent"
					/>
				</span>
			) : null}
		</div>
	);
}
