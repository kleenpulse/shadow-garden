"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Flipdot, { type FlipdotCascade } from "./flipdot";

// Six glyphs at most: a 14-row sign is about 41 columns wide, and that is what
// a 5x7 face fits with a dot between letters.
const WORDS = ["SHADOW", "GARDEN", "SEVEN", "I AM", "ATOMIC"];

export default function FlipdotPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	return (
		<div className="relative h-full w-full">
			<Flipdot
				words={WORDS}
				rows={values.rows as number}
				cascade={values.cascade as FlipdotCascade}
				stagger={values.stagger as number}
				flipDuration={values.flipDuration as number}
				overshoot={values.overshoot as number}
				hold={values.hold as number}
				ripple={values.ripple as boolean}
				onColor={values.onColor as string}
				offColor={values.offColor as string}
				boardColor={values.boardColor as string}
				paused={paused}
				reducedMotion={reducedMotion}
			/>
		</div>
	);
}
