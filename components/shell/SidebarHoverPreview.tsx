"use client";

import { useState } from "react";
import { useReducedMotion } from "motion/react";
import { defaultsFromSchema, getEntry } from "@/lib/registry";
import type { ComponentEntry, PropSchema } from "@/lib/registry/types";
import { useDataCopy } from "@/lib/i18n/data-copy";
import { anchorFor } from "@/components/landing/data";
import { previews } from "@/components/registry/previews";
import {
	PreviewCard,
	PreviewCardContent,
	createPreviewCardHandle,
} from "@/components/ui/preview-card";
import PreviewBoundary from "./PreviewBoundary";

// One card, many rows: every sidebar link is a detached trigger on this handle,
// carrying its slug as the payload, so hovering down the list re-anchors the
// same card instead of opening and closing one per row.
export const sidebarPreviewHandle = createPreviewCardHandle<string>();

type ColorProp = Extract<PropSchema, { kind: "color" }>;

function firstColor(entry: ComponentEntry): string | undefined {
	return entry.props.find((p): p is ColorProp => p.kind === "color")?.default;
}

export default function SidebarHoverPreview() {
	const reduced = useReducedMotion();
	// The glide between rows is a transition on the positioner's transform (Base
	// UI places it with translate, not top/left). Armed only once the card has
	// finished opening: on first open the positioner goes from its unmeasured
	// origin to the row, and a live transition would fly the card in from the
	// corner of the viewport.
	const [glide, setGlide] = useState(false);

	return (
		<PreviewCard
			handle={sidebarPreviewHandle}
			onOpenChange={(open) => {
				if (!open) setGlide(false);
			}}
			onOpenChangeComplete={(open) => setGlide(open)}
		>
			{({ payload }) => {
				const entry = payload ? getEntry(payload) : undefined;
				if (!entry) return null;
				return (
					<PreviewCardContent
						aria-hidden
						sideOffset={24}
						positionerClassName={
							glide && !reduced
								? "transition-transform duration-300 ease-out"
								: undefined
						}
					>
						<PreviewCardBody entry={entry} reduced={Boolean(reduced)} />
					</PreviewCardContent>
				);
			}}
		</PreviewCard>
	);
}

function PreviewCardBody({
	entry,
	reduced,
}: {
	entry: ComponentEntry;
	reduced: boolean;
}) {
	const copy = useDataCopy();
	const Preview = previews[entry.slug];
	// Landing-page templates preview as an iframe of a whole page — far too heavy
	// to boot on a pointer pass over the list.
	const showLive = !reduced && Boolean(Preview) && entry.kind !== "template";
	const tint = firstColor(entry);

	return (
		<div className="w-[22rem]">
			{/* Keyed by slug: moving to another row swaps the live preview outright
			    and the newcomer blurs in. No exit layer — cross-fading would mean two
			    live previews (two WebGL contexts) for the length of the fade. */}
			<div
				key={entry.slug}
				dir="ltr"
				className="relative aspect-16/10 w-full overflow-hidden rounded-md bg-raised transition-[opacity,filter] duration-300 ease-out starting:opacity-0 starting:blur-sm"
			>
				<div
					className="absolute inset-0"
					style={
						tint
							? {
									background: `radial-gradient(120% 100% at 30% 0%, ${tint}22, transparent 70%)`,
								}
							: undefined
					}
				/>
				{showLive && Preview && (
					<div className="pointer-events-none absolute inset-0">
						<PreviewBoundary
							slug={entry.slug}
							label={entry.name}
							variant="inline"
							showRetry={false}
						>
							<Preview
								values={defaultsFromSchema(entry.props)}
								reducedMotion={false}
								paused={false}
							/>
						</PreviewBoundary>
					</div>
				)}
			</div>
			<div className="flex items-baseline justify-between gap-3 px-1.5 pb-0.5 pt-2">
				<span className="truncate font-sans text-sm font-medium text-ink">
					{entry.name}
				</span>
				<span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-mute">
					{copy(`pages.categories.${anchorFor(entry.category)}`, entry.category)}
				</span>
			</div>
		</div>
	);
}
