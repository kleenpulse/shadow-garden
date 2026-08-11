"use client";

import { Settings, Settings2 } from "lucide-react";
import Switch from "@/components/shell/controls/Switch";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useFlameStore } from "@/lib/cookbook-flame-store";
import { cn } from "@/lib/utils";

// Reader controls for the ambient flame behind /cookbook. Two switches over
// lib/cookbook-flame-store, mounted twice: a rail-footer popover on desktop and
// a pinned footer row inside the mobile section panel. The store is the only
// channel — the flame is a sibling of the browser under a server component, so
// there is no shared React tree to pass props through.

function FlameControlRows({ dense = false }: { dense?: boolean }) {
	const enabled = useFlameStore((s) => s.enabled);
	const paused = useFlameStore((s) => s.paused);
	const setEnabled = useFlameStore((s) => s.setEnabled);
	const setPaused = useFlameStore((s) => s.setPaused);

	return (
		<div
			className={cn("flex", dense ? "items-center gap-4" : "flex-col gap-2.5")}
		>
			<Switch
				id="sg-flame-enabled"
				label="Flame "
				checked={enabled}
				onChange={setEnabled}
				className="justify-between"
			/>
			{/* Motion over a torn-down canvas is a dead control, so it follows. */}
			<Switch
				id="sg-flame-motion"
				label="Motion"
				checked={enabled && !paused}
				disabled={!enabled}
				onChange={(v) => setPaused(!v)}
			/>
		</div>
	);
}

/** Desktop: gear button pinned to the section rail's floor, popover opens up. */
export function CookbookFlameControlsDesktop({
	className,
}: {
	className?: string;
}) {
	return (
		<Popover>
			<PopoverTrigger
				aria-label="Background settings"
				className={cn(
					"grid size-9 place-items-center rounded-md border border-hairline bg-panel/80 text-ink-dim backdrop-blur transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none data-popup-open:text-accent",
					className,
				)}
			>
				<Settings className="size-5" aria-hidden />
			</PopoverTrigger>
			<PopoverContent side="top" align="start" className="p-3">
				<p className="mb-2.5 font-display text-[10px] uppercase tracking-[0.2em] text-ink-mute">
					Background
				</p>
				<FlameControlRows />
			</PopoverContent>
		</Popover>
	);
}

/** Mobile: the same rows laid out horizontally for the section panel's footer. */
export function CookbookFlameControlsMobile({
	className,
}: {
	className?: string;
}) {
	return (
		<div className={cn("flex items-center justify-between gap-3", className)}>
			<FlameControlRows dense />
		</div>
	);
}
