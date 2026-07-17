"use client";

import { motion, useReducedMotion } from "motion/react";
import { TriangleAlert, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PreviewErrorFallbackProps {
	error: Error;
	onRetry: () => void;
	/** `stage` fills the crashed slot with a full card; `inline` is a compact row. */
	variant?: "stage" | "inline";
	/** Component name, used in the message and the log. */
	label?: string;
	/** Hide the retry button where it would be inert (e.g. a decorative,
	 *  pointer-events-none thumbnail). Defaults to shown. */
	showRetry?: boolean;
}

// Bench-styled fallback shared by <PreviewBoundary> and the route error.tsx.
// Danger read comes from the --sg-danger token (no red existed before); motion
// is gated on reduced-motion per the shell's hard rule.
export default function PreviewErrorFallback({
	error,
	onRetry,
	variant = "stage",
	label,
	showRetry = true,
}: PreviewErrorFallbackProps) {
	const reduce = useReducedMotion() ?? false;
	const inline = variant === "inline";
	const title = label ? `${label} failed` : "Preview failed";

	const cardClass = cn(
		"flex h-full w-full rounded-lg border border-danger/15 bg-danger/[0.03]",
		inline
			? "items-center justify-center gap-2 px-3 py-2"
			: "flex-col items-center justify-center gap-4 p-6 text-center",
	);

	const body = inline ? (
		<>
			<TriangleAlert className="h-4 w-4 shrink-0 text-danger" aria-hidden />
			<span className="truncate font-mono text-[11px] uppercase tracking-wider text-ink-dim">
				{title}
			</span>
			{showRetry && (
				<button
					type="button"
					onClick={onRetry}
					aria-label="Retry"
					className="grid h-6 w-6 shrink-0 place-items-center rounded border border-hairline bg-surface text-ink-dim transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-ink"
				>
					<RotateCcw className="h-3 w-3" aria-hidden />
				</button>
			)}
		</>
	) : (
		<>
			<div className="grid h-14 w-14 place-items-center rounded-xl bg-danger/10">
				<TriangleAlert className="h-6 w-6 text-danger" aria-hidden />
			</div>
			<div className="space-y-1.5">
				<h3 className="font-display text-sm uppercase tracking-[0.15em] text-ink">
					{title}
				</h3>
				<p className="mx-auto max-w-sm font-sans text-xs leading-relaxed text-ink-dim line-clamp-3">
					{error.message || "This component crashed while rendering."}
				</p>
			</div>
			{showRetry && (
				<button
					type="button"
					onClick={onRetry}
					className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-dim transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-ink"
				>
					<RotateCcw className="h-3.5 w-3.5" aria-hidden />
					Retry
				</button>
			)}
		</>
	);

	if (reduce) {
		return (
			<div role="alert" className={cardClass}>
				{body}
			</div>
		);
	}

	return (
		<motion.div
			role="alert"
			className={cardClass}
			initial={{ opacity: 0, scale: 0.98 }}
			animate={{ opacity: 1, scale: 1 }}
			transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
		>
			{body}
		</motion.div>
	);
}
