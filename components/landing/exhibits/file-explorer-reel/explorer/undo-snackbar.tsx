"use client";

// Self-contained delete-undo toast — no `sonner` dependency, so the component
// folder stays portable. The parent owns the actual deferred-delete timer; this
// only renders the message, the Undo button, and a countdown bar synced to the
// same window.

import { motion } from "motion/react";
import { RotateCcw, Trash2 } from "lucide-react";
import { cn } from "./util";

export function UndoSnackbar({
	label,
	windowMs,
	onUndo,
	reducedMotion = false,
	className,
}: {
	label: string;
	windowMs: number;
	onUndo: () => void;
	reducedMotion?: boolean;
	className?: string;
}) {
	return (
		<motion.div
			role="status"
			initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
			animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
			exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
			transition={{ duration: 0.18 }}
			className={cn(
				"pointer-events-auto absolute bottom-4 start-1/2 z-50 -translate-x-1/2",
				"flex items-center gap-3 overflow-hidden rounded-md border border-hairline bg-raised px-3 py-2 shadow-lg",
				className,
			)}
		>
			<Trash2 className="h-4 w-4 shrink-0 text-ink-mute" />
			<span className="max-w-[30ch] truncate text-xs text-ink-dim">{label}</span>
			<button
				type="button"
				onClick={onUndo}
				className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium text-accent transition-colors hover:bg-accent/15"
			>
				<RotateCcw className="h-3.5 w-3.5" />
				Undo
			</button>
			{!reducedMotion && windowMs > 0 ? (
				<motion.span
					aria-hidden
					initial={{ scaleX: 1 }}
					animate={{ scaleX: 0 }}
					transition={{ duration: windowMs / 1000, ease: "linear" }}
					style={{ originX: 0 }}
					className="absolute inset-x-0 bottom-0 h-0.5 bg-accent/60"
				/>
			) : null}
		</motion.div>
	);
}
