"use client";

import { useEffect, useState } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import { AnimatedHamburger } from "./animated-hamburger";

export default function AnimatedHamburgerPreview({ values }: PreviewProps) {
	// Clickable demo: local toggle owns the state, but the Controls panel's
	// `open` switch still wins whenever it changes.
	const controlOpen = values.toggle as boolean;
	const [open, setOpen] = useState(controlOpen);
	useEffect(() => setOpen(controlOpen), [controlOpen]);

	return (
		<div className="flex h-full w-full items-center justify-center">
			<button
				type="button"
				aria-label={open ? "Close menu" : "Open menu"}
				aria-expanded={open}
				onClick={() => setOpen((prev) => !prev)}
				className="grid h-32 w-32 cursor-pointer place-items-center rounded-md border border-hairline bg-panel text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
			>
				<span className="block scale-200">
					<AnimatedHamburger open={open} />
				</span>
			</button>
		</div>
	);
}
