"use client";

import { useRef } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import Lumen from "./Lumen";

const COPY =
	"They say the strongest are those who never had to prove it. A shadow does not announce itself, does not ask permission, does not wait for the light to grant it shape. It simply arrives, and the room is already different. Read on, and every word you pass stays lit behind you.";

export default function LumenPreview({ values, reducedMotion }: PreviewProps) {
	const containerRef = useRef<HTMLDivElement>(null);

	return (
		<div
			ref={containerRef}
			// `relative` is load-bearing, not cosmetic: useScroll measures the target
			// by walking offsetParent up to the container, and a static container is
			// not in that chain — the walk sails past it to the document and the
			// progress is measured against the page instead of this port.
			className="relative h-full min-h-[320px] w-full overflow-y-auto overscroll-y-contain"
		>
			{/* Tall track above and below so the copy has a full pass to scroll through.
			    The spacers must be DIRECT children of the scroll port: a percentage
			    height only resolves against a definite parent, and an intermediate
			    auto-height wrapper collapses them to zero — the port then has nothing
			    to scroll and the wheel falls through to the page.

			    The sizes are the pass, not decoration. A lead-in shorter than the port
			    leaves the copy already partway through its window at rest (words lit
			    before you have scrolled anything), and a tail shorter than one full
			    port height ends the track before the last word can light. One port
			    height of tail makes the pass resolve to exactly 1.0 at any stage size,
			    so the whole endOffset control range stays reachable. */}
			<div className="flex h-[85%] items-end justify-center pb-6">
				<span className="font-display text-[10px] uppercase tracking-[0.25em] text-ink-mute">
					Scroll ↓
				</span>
			</div>

			<div className="flex justify-center px-6">
				<Lumen
					text={COPY}
					dimOpacity={values.dimOpacity as number}
					fadeSpan={values.fadeSpan as number}
					blurAmount={values.blurAmount as number}
					startOffset={values.startOffset as number}
					endOffset={values.endOffset as number}
					highlightColor={values.highlightColor as string}
					scrollContainerRef={containerRef}
					reducedMotion={reducedMotion}
					className="max-w-md font-display text-xl leading-relaxed tracking-tight text-ink"
				/>
			</div>

			<div className="h-full" />
		</div>
	);
}
