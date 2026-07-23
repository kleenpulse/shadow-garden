"use client";

import { useId, type KeyboardEvent, type ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const TAB_SPRING = { type: "spring" as const, stiffness: 350, damping: 30 };

export type PillTabItem<V extends string = string> = {
	value: V;
	label: ReactNode;
};

type PillTabsProps<V extends string = string> = {
	value: V;
	onValueChange: (value: V) => void;
	items: PillTabItem<V>[];
	/**
	 * Framer `layoutId` for the sliding indicator. Two instances sharing an id on
	 * one page would cross-animate, so it auto-generates via `useId()` when omitted.
	 */
	layoutId?: string;
	"aria-label"?: string;
	className?: string;
	/** Stretch to fill the container, distributing tabs evenly. */
	fullWidth?: boolean;
	/** "md" matches the sidebar search input's height; "sm" (default) is the compact workspace-tab size. */
	size?: "sm" | "md" | "xs";
};

const SIZE_CLASSES = {
	xs: { track: "p-0.5", tab: "py-0.5 text-[10px]" },
	sm: { track: "p-1", tab: "py-1 text-[11px]" },
	md: { track: "p-0.5", tab: "py-1 text-xs" },
} as const;

/**
 * Pill-style tab toggle with an animated sliding indicator (motion `layoutId`).
 * Adapted from ellum's shared PillTabs, restyled into Shadow Garden's shell voice
 * (hairline panel, amethyst accent, uppercase display type) while keeping our
 * border radii. Arrow keys move between tabs (roving tabIndex).
 */
export default function PillTabs<V extends string = string>({
	value,
	onValueChange,
	items,
	layoutId,
	"aria-label": ariaLabel,
	className,
	fullWidth = false,
	size = "sm",
}: PillTabsProps<V>) {
	const fallbackId = useId();
	const effectiveLayoutId = layoutId ?? fallbackId;
	const sizeClasses = SIZE_CLASSES[size];

	const onKeyDown = (event: KeyboardEvent) => {
		const index = items.findIndex((t) => t.value === value);
		if (index === -1) return;
		if (event.key === "ArrowRight") {
			event.preventDefault();
			onValueChange(items[(index + 1) % items.length].value);
		} else if (event.key === "ArrowLeft") {
			event.preventDefault();
			onValueChange(items[(index - 1 + items.length) % items.length].value);
		}
	};

	return (
		<div
			role="tablist"
			aria-label={ariaLabel}
			onKeyDown={onKeyDown}
			className={cn(
				// Shadow Garden radius (rounded-lg) + hairline panel chrome kept as-is.
				"relative inline-flex items-center gap-1 rounded-lg border border-hairline bg-panel",
				sizeClasses.track,
				fullWidth ? "w-full" : "w-fit",
				className,
			)}
		>
			{items.map((item) => {
				const active = item.value === value;
				return (
					<button
						key={item.value}
						role="tab"
						aria-selected={active}
						tabIndex={active ? 0 : -1}
						onClick={() => onValueChange(item.value)}
						className={cn(
							"relative inline-flex items-center justify-center rounded-md px-3 font-display uppercase tracking-[0.15em] outline-none transition-colors",
							sizeClasses.tab,
							fullWidth && "flex-1",
							active ? "text-accent" : "text-ink-dim hover:text-ink",
						)}
					>
						{active && (
							<motion.span
								layoutId={effectiveLayoutId}
								// Inner radius stays rounded-md (ours). Amethyst-tinted fill.
								className="absolute inset-0 z-0 rounded-md bg-accent/10 dark:border dark:border-accent/40 dark:bg-accent/15"
								transition={TAB_SPRING}
							/>
						)}
						<span className="relative z-10">{item.label}</span>
					</button>
				);
			})}
		</div>
	);
}
