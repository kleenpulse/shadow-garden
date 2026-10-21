"use client";

import { useEffect, useRef, useState } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import Scratch from "./scratch";

// Showcase-only reset. A real scratch card never covers itself again, so the
// component has no auto-reset; the stage mounts a fresh card a moment after
// each reveal instead, and holds the revealed card while paused.
const RESET_AFTER = 2600;

export default function ScratchPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	const stageRef = useRef<HTMLDivElement>(null);
	const refocus = useRef(false);
	const [round, setRound] = useState(0);
	const [revealed, setRevealed] = useState(false);

	useEffect(() => {
		if (!revealed || paused) return;
		const id = window.setTimeout(() => {
			refocus.current = Boolean(stageRef.current?.contains(document.activeElement));
			setRevealed(false);
			setRound((n) => n + 1);
		}, RESET_AFTER);
		return () => window.clearTimeout(id);
	}, [revealed, paused]);

	// Keyboard users keep their place: if focus was on the old card, it moves to
	// the fresh one instead of falling back to the page.
	useEffect(() => {
		if (!refocus.current) return;
		refocus.current = false;
		stageRef.current
			?.querySelector<HTMLElement>('[role="button"]')
			?.focus({ preventScroll: true });
	}, [round]);

	return (
		<div
			ref={stageRef}
			className="relative flex h-full w-full items-center justify-center"
		>
			<Scratch
				key={round}
				brushSize={values.brushSize as number}
				threshold={values.threshold as number}
				revealDuration={values.revealDuration as number}
				flakes={values.flakes as boolean}
				glint={values.glint as boolean}
				glintColor={values.glintColor as string}
				foilColor={values.foilColor as string}
				paused={paused}
				reducedMotion={reducedMotion}
				onReveal={() => setRevealed(true)}
				label="Scratch to reveal your invitation"
				className="aspect-[16/10] w-[min(80%,max(54%,18rem),40rem)] rounded-xl shadow-[0_22px_48px_-24px_rgb(0_0_0/0.55)] ring-1 ring-hairline"
			>
				<Invitation />
			</Scratch>
		</div>
	);
}

function Invitation() {
	return (
		<div className="@container relative h-full w-full overflow-hidden bg-raised">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 bg-linear-to-br from-accent/15 via-transparent to-transparent"
			/>
			<div className="relative flex h-full flex-col justify-between p-[6cqw]">
				<div className="flex items-center justify-between gap-[3cqw]">
					<p className="flex items-center gap-[1.6cqw] font-display text-[2.4cqw] tracking-[0.3em] text-accent uppercase">
						<span
							aria-hidden
							className="grid size-[4.6cqw] place-items-center rounded-full border border-accent/60 font-sans text-[2.6cqw] tracking-normal normal-case"
						>
							ε
						</span>
						Shadow Garden
					</p>
					<p className="font-display text-[2.2cqw] tracking-[0.2em] text-ink-mute">
						No. 664
					</p>
				</div>
				<div>
					<p className="text-[2.7cqw] text-ink-dim">
						You are invited. Your codename is
					</p>
					<p className="mt-[1.2cqw] font-display text-[8.4cqw] leading-none font-bold tracking-[0.06em] text-ink">
						EPSILON
					</p>
				</div>
				<div className="flex items-end justify-between gap-[3cqw] border-t border-hairline pt-[3cqw]">
					<p className="font-display text-[3.4cqw] tracking-[0.16em] text-accent">
						SG7-EPS-0664
					</p>
					<p className="text-right text-[2.2cqw] leading-snug text-ink-mute">
						We hide in the shadows
						<br />
						and hunt the shadows.
					</p>
				</div>
			</div>
		</div>
	);
}
