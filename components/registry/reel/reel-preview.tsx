"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Reel, { type ReelDirection, type ReelMode } from "./reel";

// Deliberately uneven: one short word, one long phrase with a space in it. A
// slot whose words are all the same length proves nothing about the width.
//
// A module constant, not an inline literal, so the list keeps its identity
// while the Controls panel moves a slider.
const WORDS = ["unseen", "in silence", "from the shadows", "by design"];

export default function ReelPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	return (
		<div className="@container flex h-full w-full items-center justify-center p-8">
			<div className="flex flex-col items-center gap-5 text-center">
				<p className="font-display text-[10px] tracking-[0.28em] text-ink-mute uppercase">
					drum · stagger · width
				</p>
				{/* The slot sits mid-line on a centered row, so a change of width
				    moves the words on both sides of it. */}
				<p className="font-title text-[clamp(1.5rem,6.2cqi,3.75rem)] leading-[1.15] font-black tracking-tight text-ink">
					The Garden moves
					<br />
					<Reel
						words={WORDS}
						interval={values.interval as number}
						mode={values.mode as ReelMode}
						stagger={values.stagger as number}
						stiffness={values.stiffness as number}
						damping={values.damping as number}
						direction={values.direction as ReelDirection}
						pauseOnHover={values.pauseOnHover as boolean}
						underline={values.underline as boolean}
						accentColor={values.accentColor as string}
						paused={paused}
						reducedMotion={reducedMotion}
					/>{" "}
					tonight.
				</p>
			</div>
		</div>
	);
}
