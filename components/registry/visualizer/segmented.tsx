"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type SegmentedOption = {
	value: string;
	label: React.ReactNode;
	/** Accessible name when `label` is an icon or abbreviation. */
	spoken?: string;
};

/** Pill radio group: one tab stop, arrow keys move and select, like native radios. */
export function Segmented({
	label,
	value,
	options,
	onChange,
	className,
	inert,
}: {
	label: string;
	value: string;
	options: SegmentedOption[];
	onChange: (value: string) => void;
	className?: string;
	inert?: boolean;
}) {
	const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

	const onKeyDown = (e: React.KeyboardEvent, i: number) => {
		const n = options.length;
		let next = -1;
		if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % n;
		else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + n) % n;
		else if (e.key === "Home") next = 0;
		else if (e.key === "End") next = n - 1;
		if (next < 0) return;
		e.preventDefault();
		onChange(options[next]!.value);
		refs.current[next]?.focus();
	};

	return (
		<div
			role="radiogroup"
			aria-label={label}
			inert={inert}
			className={cn("inline-flex items-center gap-0.5 rounded-full bg-raised p-1", className)}
		>
			{options.map((o, i) => {
				const on = o.value === value;
				return (
					<button
						key={o.value}
						ref={(el) => {
							refs.current[i] = el;
						}}
						type="button"
						role="radio"
						aria-checked={on}
						aria-label={o.spoken}
						tabIndex={on ? 0 : -1}
						onClick={() => onChange(o.value)}
						onKeyDown={(e) => onKeyDown(e, i)}
						className={cn(
							"inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] tabular-nums transition-colors duration-200",
							"focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-raised focus-visible:outline-none",
							on ? "bg-accent text-on-accent" : "text-ink-dim hover:text-ink",
						)}
					>
						{o.label}
					</button>
				);
			})}
		</div>
	);
}
