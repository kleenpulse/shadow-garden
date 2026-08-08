"use client";

// Contextual empty states: a fresh/empty folder, a search that matched nothing,
// or a browser with no persistent storage at all.

import { FolderOpen, SearchX, ServerCrash, Upload } from "lucide-react";
import { cn } from "./util";

export type EmptyVariant = "empty" | "no-results" | "unsupported";

const COPY: Record<
	EmptyVariant,
	{ Icon: typeof FolderOpen; title: string; body: string }
> = {
	empty: {
		Icon: FolderOpen,
		title: "This folder is empty",
		body: "Drag files in, or use the Add button to upload.",
	},
	"no-results": {
		Icon: SearchX,
		title: "No matches",
		body: "Nothing here matches your search.",
	},
	unsupported: {
		Icon: ServerCrash,
		title: "Storage unavailable",
		body: "This browser has no persistent file storage available.",
	},
};

export function EmptyState({
	variant,
	onAdd,
	className,
}: {
	variant: EmptyVariant;
	/** Show an inline upload CTA (only meaningful when uploads are allowed). */
	onAdd?: () => void;
	className?: string;
}) {
	const { Icon, title, body } = COPY[variant];
	return (
		<div
			className={cn(
				"flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center",
				className,
			)}
		>
			<Icon className="h-10 w-10 text-ink-mute" strokeWidth={1.25} />
			<div className="space-y-1">
				<p className="font-display text-xs uppercase tracking-[0.2em] text-ink-dim">
					{title}
				</p>
				<p className="mx-auto max-w-[32ch] text-xs text-ink-mute">{body}</p>
			</div>
			{variant === "empty" && onAdd ? (
				<button
					type="button"
					onClick={onAdd}
					className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-hairline bg-panel px-3 py-1.5 text-xs text-ink-dim transition-colors hover:border-accent hover:text-accent"
				>
					<Upload className="h-3.5 w-3.5" />
					Add files
				</button>
			) : null}
		</div>
	);
}
