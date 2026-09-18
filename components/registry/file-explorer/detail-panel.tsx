"use client";

// The right pane: preview + metadata + actions for the file opened via
// double-click.
//
// Note on the port: the source explorer painted an animated WebGL "siderays"
// glow behind this panel in dark mode. It's intentionally dropped here — the
// panel is a plain, solid `bg-panel` surface in both themes. No background
// layer, no `ogl` dependency.

import { useEffect, useState } from "react";
import { Download, Pencil, Trash2, X } from "lucide-react";
import type { FileNode, FileStore } from "./store/types";
import { parentPath } from "./store/types";
import { AutoScroll, autoScrollClasses } from "./auto-scroll";
import { InlineRename } from "./inline-rename";
import { Thumbnail } from "./thumbnail";
import { cn, fileExtension, formatBytes, kindForNode } from "./util";

export function DetailPanel({
	node,
	store,
	allowDelete,
	onRename,
	onSaveText,
	onDownload,
	onDelete,
	onClose,
}: {
	node: FileNode;
	store: FileStore | null;
	allowDelete: boolean;
	onRename: (nextName: string) => void;
	/** Persist edited text-file contents. */
	onSaveText: (text: string) => void;
	onDownload: () => void;
	onDelete: () => void;
	onClose: () => void;
}) {
	const [renaming, setRenaming] = useState(false);
	const kind = kindForNode(node);
	const location = parentPath(node.path);

	return (
		<aside className="flex h-full flex-col bg-panel">
			<header className="flex h-9 items-center justify-between gap-2 border-b border-hairline px-3">
				<span className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute">
					Details
				</span>
				<button
					type="button"
					onClick={onClose}
					aria-label="Close details"
					className="text-ink-mute transition-colors hover:text-ink"
				>
					<X className="h-4 w-4" />
				</button>
			</header>

			<AutoScroll className="min-h-0 flex-1">
				<div className="flex items-center justify-center border-b border-hairline bg-surface/50 p-4">
					<div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-md bg-surface">
						{/* Keyed by path so preview + edit state reset cleanly per file. */}
						<Preview
							key={node.path}
							node={node}
							store={store}
							canEdit={allowDelete}
							onSaveText={onSaveText}
						/>
					</div>
				</div>

				<div className="space-y-4 p-3">
					<div className="space-y-1">
						{renaming ? (
							<InlineRename
								initial={node.name}
								onCommit={(next) => {
									onRename(next);
									setRenaming(false);
								}}
								onCancel={() => setRenaming(false)}
								className="text-sm"
							/>
						) : (
							<button
								type="button"
								onDoubleClick={() => setRenaming(true)}
								title="Double-click to rename"
								className="block w-full wrap-break-word text-left text-sm font-medium text-ink"
							>
								{node.name}
							</button>
						)}
					</div>

					<dl className="space-y-2 text-xs">
						<Meta label="Kind" value={kind === "file" ? "File" : capitalize(kind)} />
						<Meta
							label="Type"
							value={node.mime || fileExtension(node.name) || "unknown"}
						/>
						<Meta label="Size" value={formatBytes(node.size)} />
						<Meta label="Modified" value={formatFull(node.mtime)} />
						<Meta label="Location" value={location ? `/${location}` : "Home"} />
					</dl>
				</div>
			</AutoScroll>

			<footer className="flex items-center gap-2 border-t border-hairline p-3">
				<button
					type="button"
					onClick={onDownload}
					className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs text-ink-dim transition-colors hover:border-accent hover:text-accent"
				>
					<Download className="h-3.5 w-3.5" />
					Download
				</button>
				{allowDelete ? (
					<>
						<button
							type="button"
							onClick={() => setRenaming(true)}
							aria-label="Rename"
							className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline text-ink-dim transition-colors hover:border-accent hover:text-accent"
						>
							<Pencil className="h-3.5 w-3.5" />
						</button>
						<button
							type="button"
							onClick={onDelete}
							aria-label="Delete"
							className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline text-ink-dim transition-colors hover:border-danger hover:text-danger"
						>
							<Trash2 className="h-3.5 w-3.5" />
						</button>
					</>
				) : null}
			</footer>
		</aside>
	);
}

/**
 * Rich preview for the opened file: media players, an editable text view, or an
 * icon. Text/code files can be edited in place (double-click) when `canEdit`.
 */
function Preview({
	node,
	store,
	canEdit,
	onSaveText,
}: {
	node: FileNode;
	store: FileStore | null;
	canEdit: boolean;
	onSaveText: (text: string) => void;
}) {
	const kind = kindForNode(node);
	const [text, setText] = useState<string | null>(null);
	const [mediaUrl, setMediaUrl] = useState<string | null>(null);
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState("");

	// Media (image/video/audio): revocable object URL.
	useEffect(() => {
		let cancelled = false;
		let created: string | null = null;
		const isMedia = kind === "image" || kind === "video" || kind === "audio";
		if (!store || !isMedia) return; // keyed remount handles reset
		store
			.read(node.path)
			.then((blob) => {
				if (cancelled) return;
				created = URL.createObjectURL(blob);
				setMediaUrl(created);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
			if (created) URL.revokeObjectURL(created);
		};
	}, [store, node.path, node.mtime, kind]);

	// Text/code: read a bounded slice as text.
	useEffect(() => {
		let cancelled = false;
		if (!store || (kind !== "text" && kind !== "code")) return; // keyed remount handles reset
		store
			.read(node.path)
			.then((blob) => blob.slice(0, 64_000).text())
			.then((t) => {
				if (!cancelled) setText(t);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [store, node.path, node.mtime, kind]);

	if (kind === "image" && mediaUrl) {
		// eslint-disable-next-line @next/next/no-img-element -- object URL
		return <img src={mediaUrl} alt={node.name} className="h-full w-full object-contain" />;
	}
	if (kind === "video" && mediaUrl) {
		return <video src={mediaUrl} controls className="h-full w-full" />;
	}
	if (kind === "audio" && mediaUrl) {
		return (
			<div className="flex w-full items-center justify-center p-4">
				<audio src={mediaUrl} controls className="w-full" />
			</div>
		);
	}
	if ((kind === "text" || kind === "code") && text !== null) {
		if (editing) {
			const commit = () => {
				onSaveText(draft);
				setEditing(false);
			};
			return (
				<div className="flex h-full w-full flex-col bg-surface">
					<textarea
						value={draft}
						autoFocus
						spellCheck={false}
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Escape") {
								e.preventDefault();
								setEditing(false);
							} else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
								e.preventDefault();
								commit();
							}
							e.stopPropagation();
						}}
						className={cn(
							"min-h-0 flex-1 resize-none bg-transparent p-2 font-mono text-[11px] leading-relaxed text-ink outline-none",
							autoScrollClasses,
						)}
					/>
					<div className="flex items-center justify-end gap-1.5 border-t border-hairline p-1.5">
						<button
							type="button"
							onClick={() => setEditing(false)}
							className="rounded-sm px-2 py-1 text-[11px] text-ink-mute transition-colors hover:text-ink"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={commit}
							className="rounded-sm bg-accent px-2 py-1 text-[11px] font-medium text-on-accent transition-colors hover:bg-accent-hover"
						>
							Save
						</button>
					</div>
				</div>
			);
		}
		return (
			<pre
				onDoubleClick={
					canEdit
						? () => {
								setDraft(text);
								setEditing(true);
							}
						: undefined
				}
				title={canEdit ? "Double-click to edit" : undefined}
				className={cn(
					"h-full w-full overflow-auto p-3 text-left font-mono text-[11px] leading-relaxed text-ink-dim",
					canEdit && "cursor-text",
					autoScrollClasses,
				)}
			>
				{text}
			</pre>
		);
	}
	return (
		<div className="h-16 w-16">
			<Thumbnail node={node} store={store} />
		</div>
	);
}

function Meta({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<dt className="shrink-0 font-display text-[10px] uppercase tracking-[0.15em] text-ink-mute">
				{label}
			</dt>
			<dd className="min-w-0 truncate text-right font-mono text-ink-dim">{value}</dd>
		</div>
	);
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatFull(mtime: number): string {
	if (!mtime) return "—";
	return new Date(mtime).toLocaleString(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});
}
