"use client";

import { useEffect, useState } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import Masonry from "./Masonry";
import AutoMaskVertical from "@/components/ui/auto-mask-vertical";

// Procedural, so the stage carries no image payload and nothing resolves from a
// network. The ratios are the point: masonry only earns its keep when heights
// disagree.
type Item =
	| { kind: "tile"; id: string; ratio: string; from: string; to: string }
	| { kind: "note"; id: string; title: string; body: string }
	| { kind: "late"; id: string }
	| { kind: "expand"; id: string };

const ITEMS: Item[] = [
	{ kind: "tile", id: "01", ratio: "3 / 4", from: "#7c3aed", to: "#1e1b2e" },
	{
		kind: "note",
		id: "n1",
		title: "Shortest column wins",
		body: "Each item drops into whichever column is currently least tall, so a tall neighbour never leaves a hole beside a short one.",
	},
	{ kind: "tile", id: "02", ratio: "1 / 1", from: "#2a2438", to: "#0f0d14" },
	{ kind: "late", id: "late" },
	{ kind: "tile", id: "03", ratio: "16 / 9", from: "#a855f7", to: "#312244" },
	{ kind: "expand", id: "expand" },
	{ kind: "tile", id: "04", ratio: "2 / 3", from: "#1a1725", to: "#4c1d95" },
	{
		kind: "note",
		id: "n2",
		title: "Order survives",
		body: "Reading order and tab order stay the same order. Nothing is reparented in order to move.",
	},
	{ kind: "tile", id: "05", ratio: "4 / 5", from: "#3b2f5c", to: "#0b0a0f" },
	{ kind: "tile", id: "06", ratio: "1 / 1", from: "#5b21b6", to: "#17141f" },
	{
		kind: "note",
		id: "n3",
		title: "Measured, not guessed",
		body: "Heights are read from the DOM in one pass and written back in another — never one item at a time.",
	},
	{ kind: "tile", id: "07", ratio: "5 / 4", from: "#211d2c", to: "#6d28d9" },
];

function Tile({
	ratio,
	from,
	to,
	label,
}: {
	ratio: string;
	from: string;
	to: string;
	label: string;
}) {
	return (
		<div
			className="relative overflow-hidden rounded-xl border border-hairline"
			style={{
				aspectRatio: ratio,
				background: `linear-gradient(155deg, ${from}, ${to})`,
			}}
		>
			<span className="absolute bottom-2 left-2.5 font-display text-[9px] uppercase tracking-[0.2em] text-white/70">
				{label}
			</span>
		</div>
	);
}

function Note({ title, body }: { title: string; body: string }) {
	return (
		<article className="rounded-xl border border-hairline bg-panel p-3.5">
			<h3 className="font-display text-xs tracking-tight text-ink">{title}</h3>
			<p className="mt-1.5 font-sans text-[12px] leading-relaxed text-ink-dim">
				{body}
			</p>
		</article>
	);
}

// The awkward case every masonry has to survive: content that settles late. This
// stands in for an image with no intrinsic size — a skeleton for a beat, then it
// grows, and the column underneath has to repack around it.
function LateTile() {
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		const t = setTimeout(() => setLoaded(true), 1500);
		return () => clearTimeout(t);
	}, []);

	return (
		<div
			className="relative overflow-hidden rounded-xl border border-hairline"
			style={{
				aspectRatio: loaded ? "3 / 4" : "5 / 2",
				background: loaded
					? "linear-gradient(155deg, #c084fc, #2a1f42)"
					: "linear-gradient(155deg, #1b1922, #131118)",
			}}
		>
			<span className="absolute bottom-2 left-2.5 font-display text-[9px] uppercase tracking-[0.2em] text-white/70">
				{loaded ? "Resolved" : "Loading…"}
			</span>
		</div>
	);
}

// Proof that a repack is not a remount: this card holds its open state through
// every resize, column change and reflow the controls can throw at it.
function ExpandCard() {
	const [open, setOpen] = useState(false);

	return (
		<article className="rounded-xl border border-hairline bg-panel p-3.5">
			<h3 className="font-display text-xs tracking-tight text-ink">
				State survives a repack
			</h3>
			<p className="mt-1.5 font-sans text-[12px] leading-relaxed text-ink-dim">
				Items are moved by transform inside one parent, never reparented.
			</p>
			{open && (
				<p className="mt-2 font-sans text-[12px] leading-relaxed text-ink-mute">
					A column-per-div masonry has to unmount this card and mount it again
					elsewhere every time it changes column. Anything living inside —
					focus, a playing video, this toggle — dies with it. Leave it open and
					drag the width slider: it stays open, and the column repacks around
					the new height.
				</p>
			)}
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="mt-2.5 rounded-lg border border-hairline px-2 py-1 font-display text-[9px] uppercase tracking-[0.18em] text-ink-dim transition-colors hover:border-accent-muted hover:text-accent"
			>
				{open ? "Collapse" : "Expand"}
			</button>
		</article>
	);
}

export default function MasonryPreview({
	values,
	reducedMotion,
}: PreviewProps) {
	return (
		<AutoMaskVertical
			fadeSizePercent={10}
			className="h-full w-full max-h-100 md:max-h-150 p-2 sm:p-4 overscroll-contain"
		>
			<Masonry
				minColumnWidth={values.minColumnWidth as number}
				maxColumns={values.maxColumns as number}
				gap={values.gap as number}
				packing={values.packing as "balanced" | "sequential"}
				transition={values.transition as number}
				stagger={values.stagger as number}
				revealOnScroll={values.revealOnScroll as boolean}
				revealDistance={values.revealDistance as number}
				reducedMotion={reducedMotion}
			>
				{ITEMS.map((item) => {
					if (item.kind === "tile") {
						return (
							<Tile
								key={item.id}
								ratio={item.ratio}
								from={item.from}
								to={item.to}
								label={item.id}
							/>
						);
					}
					if (item.kind === "note") {
						return <Note key={item.id} title={item.title} body={item.body} />;
					}
					if (item.kind === "late") return <LateTile key={item.id} />;
					return <ExpandCard key={item.id} />;
				})}
			</Masonry>
		</AutoMaskVertical>
	);
}
