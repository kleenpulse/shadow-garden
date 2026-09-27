"use client";

import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";

import { cn } from "@/lib/utils";

// Base UI PreviewCard (hover card), restyled to Motion Garden bench tokens. Same
// dialect as tooltip.tsx: `data-starting-style`/`data-ending-style` for
// enter/exit, `--transform-origin` for the scale pivot. One Root can serve many
// detached triggers through `createPreviewCardHandle()` + a `payload` per
// trigger — the positioner re-anchors to whichever trigger is hovered.
//
// Enter/exit is opacity + a short slide, never scale: live previews measure
// their box with getBoundingClientRect on mount, which reads the transformed
// size — a scale-95 entrance sizes every canvas to 95% and nothing re-measures
// when the scale settles (ResizeObserver ignores transforms). A translate
// moves the box without changing its measured size.

const PreviewCard = PreviewCardPrimitive.Root;

const PreviewCardTrigger = PreviewCardPrimitive.Trigger;

const createPreviewCardHandle = PreviewCardPrimitive.createHandle;

function PreviewCardContent({
	className,
	positionerClassName,
	side = "right",
	sideOffset = 12,
	align = "center",
	children,
	...props
}: PreviewCardPrimitive.Popup.Props &
	Pick<PreviewCardPrimitive.Positioner.Props, "side" | "sideOffset" | "align"> & {
		positionerClassName?: string;
	}) {
	return (
		<PreviewCardPrimitive.Portal>
			<PreviewCardPrimitive.Positioner
				side={side}
				sideOffset={sideOffset}
				align={align}
				className={cn("isolate z-[200]", positionerClassName)}
			>
				<PreviewCardPrimitive.Popup
					className={cn(
						"rounded-lg border border-hairline bg-panel p-1.5 shadow-xl shadow-black/30",
						"transition-[translate,opacity] duration-150 ease-out",
						"data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
						"data-[side=right]:data-[starting-style]:-translate-x-1.5 data-[side=right]:data-[ending-style]:-translate-x-1.5",
						"data-[side=left]:data-[starting-style]:translate-x-1.5 data-[side=left]:data-[ending-style]:translate-x-1.5",
						className,
					)}
					{...props}
				>
					{children}
				</PreviewCardPrimitive.Popup>
			</PreviewCardPrimitive.Positioner>
		</PreviewCardPrimitive.Portal>
	);
}

export {
	PreviewCard,
	PreviewCardContent,
	PreviewCardTrigger,
	createPreviewCardHandle,
};
