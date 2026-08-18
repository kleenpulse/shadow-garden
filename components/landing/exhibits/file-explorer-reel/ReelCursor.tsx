"use client";

// The reel's synthetic pointer, plus the two things that make a scripted
// gesture legible: a click pulse, and a labelled ghost with a ring on the drop
// target while dragging.
//
// Deliberately amethyst rather than an OS-cursor lookalike. It is not the
// visitor's pointer and should never be mistaken for it — a demo that appears
// to move your cursor reads as a hijack.

import { motion } from "motion/react";
import { MousePointer2 } from "lucide-react";
import type { ReelTimeline } from "./useReelTimeline";

export default function ReelCursor({ cursor }: { cursor: ReelTimeline["cursor"] }) {
	const { x, y, visible, pressed, ghost, ring, pulseKey } = cursor;

	return (
		<div aria-hidden className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
			{/* Drop-target ring. Drawn as an overlay rather than a class on the tile
			    so FileGrid stays the shipped component, untouched. */}
			{ring ? (
				<motion.span
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.12 }}
					style={{ left: ring.x, top: ring.y, width: ring.w, height: ring.h }}
					className="absolute rounded-md ring-2 ring-accent"
				/>
			) : null}

			<motion.div
				style={{ x, y }}
				animate={{ opacity: visible ? 1 : 0 }}
				transition={{ duration: 0.22 }}
				className="absolute start-0 top-0"
			>
				{/* Keyed so each click remounts the ring and replays it once. */}
				{pulseKey > 0 ? (
					<motion.span
						key={pulseKey}
						initial={{ scale: 0.35, opacity: 0.5 }}
						animate={{ scale: 1.7, opacity: 0 }}
						transition={{ duration: 0.42, ease: "easeOut" }}
						className="absolute -start-4 -top-4 h-8 w-8 rounded-full border border-accent bg-accent/20"
					/>
				) : null}

				<motion.span
					animate={{ scale: pressed ? 0.82 : 1 }}
					transition={{ duration: 0.1 }}
					className="block origin-top-left"
				>
					<MousePointer2
						className="h-5 w-5 -translate-x-[3px] -translate-y-[2px] fill-accent text-accent drop-shadow-[0_1px_4px_rgba(0,0,0,0.45)]"
						strokeWidth={1.5}
					/>
				</motion.span>

				{ghost ? (
					<motion.span
						initial={{ opacity: 0, scale: 0.9 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ duration: 0.14 }}
						className="absolute start-4 top-4 flex max-w-40 items-center gap-1.5 rounded-md border border-accent/50 bg-panel/95 px-2 py-1 shadow-lg backdrop-blur-sm"
					>
						<span className="h-2 w-2 shrink-0 rounded-[2px] bg-accent" />
						<span className="truncate font-mono text-[10px] text-ink-dim">{ghost}</span>
					</motion.span>
				) : null}
			</motion.div>
		</div>
	);
}
