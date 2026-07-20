"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn } from "@/lib/utils";

// shadcn/ui Tooltip (Base UI variant), restyled to Shadow Garden bench tokens:
// graphite panel, a hairline border, mono readout ink. Base UI drives behavior
// and a11y; the class strings are ours. Note the Base UI dialect — `delay` on
// the Provider (not `delayDuration`), `data-starting-style`/`data-ending-style`
// for enter/exit (not `data-state`), and the `--transform-origin` var — so the
// tw-animate-css `data-state` classes select.tsx uses do NOT apply here.

function TooltipProvider({
	delay = 0,
	...props
}: TooltipPrimitive.Provider.Props) {
	return <TooltipPrimitive.Provider delay={delay} {...props} />;
}

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

function TooltipContent({
	className,
	side = "left",
	sideOffset = 10,
	align = "center",
	children,
	...props
}: TooltipPrimitive.Popup.Props &
	Pick<TooltipPrimitive.Positioner.Props, "side" | "sideOffset" | "align">) {
	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Positioner
				side={side}
				sideOffset={sideOffset}
				align={align}
				className="isolate z-[200]"
			>
				<TooltipPrimitive.Popup
					className={cn(
						"relative w-fit select-none rounded-md border border-hairline bg-panel px-2.5 py-1.5 font-display text-[10px] uppercase tracking-[0.22em] text-ink shadow-lg shadow-black/25",
						"origin-[var(--transform-origin)] transition-[transform,opacity] duration-150 ease-out",
						"data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[instant]:duration-0",
						className,
					)}
					{...props}
				>
					{children}
				</TooltipPrimitive.Popup>
			</TooltipPrimitive.Positioner>
		</TooltipPrimitive.Portal>
	);
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
