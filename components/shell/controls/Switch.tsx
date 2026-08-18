"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

// Panel-switch toggle — round thumb, evenly inset in the track. Native <button>
// with role="switch" gives Enter/Space activation and focus for free.
//
// Extracted from BooleanControl so the cookbook's flame controls reuse the exact
// visual and ARIA contract instead of forking a second switch.
export default function Switch({
	label,
	checked,
	onChange,
	disabled = false,
	id,
	className,
}: {
	label: string;
	checked: boolean;
	onChange: (value: boolean) => void;
	disabled?: boolean;
	/** Stable id for the label element; generated when omitted. */
	id?: string;
	className?: string;
}) {
	const fallback = useId();
	const labelId = `lbl-${id ?? fallback}`;
	return (
		// No justify-between: in the full-width bench grid a cell can span a third
		// of the workspace, which would strand the switch far from its label.
		<div
			className={cn(
				"flex items-center gap-3 transition-opacity",
				disabled && "opacity-40",
				className,
			)}
		>
			<label id={labelId} className="font-mono text-xs text-ink-dim">
				{label}
			</label>
			<button
				type="button"
				role="switch"
				aria-checked={checked}
				aria-labelledby={labelId}
				disabled={disabled}
				onClick={() => onChange(!checked)}
				className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
					checked
						? "border-accent-active bg-accent/25"
						: "border-hairline bg-raised"
				}`}
			>
				<span
					className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${
						checked ? "start-[18px] bg-accent" : "start-0.5 bg-ink-mute"
					}`}
				/>
			</button>
		</div>
	);
}
