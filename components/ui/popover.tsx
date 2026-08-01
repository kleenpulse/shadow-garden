"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "@/lib/utils";

// shadcn/ui Popover (Base UI variant), restyled to Shadow Garden bench tokens —
// same construction as components/ui/tooltip.tsx. The Base UI dialect applies
// here too: `data-starting-style`/`data-ending-style` for enter/exit (not
// `data-state`) and the `--transform-origin` var set by the Positioner, so the
// tw-animate-css `data-state` classes select.tsx uses do NOT work on this popup.

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverClose = PopoverPrimitive.Close;

function PopoverContent({
	className,
	side = "top",
	sideOffset = 8,
	align = "start",
	children,
	...props
}: PopoverPrimitive.Popup.Props &
	Pick<PopoverPrimitive.Positioner.Props, "side" | "sideOffset" | "align">) {
	return (
		<PopoverPrimitive.Portal>
			<PopoverPrimitive.Positioner
				side={side}
				sideOffset={sideOffset}
				align={align}
				className="isolate z-[200]"
			>
				<PopoverPrimitive.Popup
					className={cn(
						"relative w-fit rounded-lg border border-hairline bg-panel/95 p-3 text-ink shadow-lg shadow-black/25 backdrop-blur-2xl outline-none",
						"origin-[var(--transform-origin)] transition-[transform,opacity] duration-150 ease-out",
						"data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[instant]:duration-0",
						className,
					)}
					{...props}
				>
					{children}
				</PopoverPrimitive.Popup>
			</PopoverPrimitive.Positioner>
		</PopoverPrimitive.Portal>
	);
}

export { Popover, PopoverClose, PopoverContent, PopoverTrigger };
