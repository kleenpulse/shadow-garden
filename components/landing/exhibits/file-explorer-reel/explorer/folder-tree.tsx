"use client";

// The left rail: a lazily-loaded, recursive directory tree. Each node fetches
// its child directories only when expanded, and auto-expands to reveal the
// current path. Folders accept file drops (move) and can be dropped onto to
// relocate items.

import { useEffect, useState } from "react";
import { ChevronRight, Folder, House } from "lucide-react";
import type { FileNode, FileStore, StorePath } from "./store/types";
import type { Density } from "./types";
import { cn } from "./util";

interface TreeCallbacks {
	onNavigate: (path: StorePath) => void;
	/** A drag payload was dropped onto a directory row. */
	onDropOnFolder: (dir: StorePath, e: React.DragEvent) => void;
}

export function FolderTree({
	store,
	revision,
	currentPath,
	density,
	className,
	...callbacks
}: TreeCallbacks & {
	store: FileStore | null;
	revision: number;
	currentPath: StorePath;
	density: Density;
	className?: string;
}) {
	return (
		<div className={cn("min-w-0 py-1 text-sm", className)}>
			<TreeRow
				store={store}
				revision={revision}
				path=""
				name="Home"
				depth={0}
				currentPath={currentPath}
				density={density}
				{...callbacks}
			/>
		</div>
	);
}

function TreeRow({
	store,
	revision,
	path,
	name,
	depth,
	currentPath,
	density,
	onNavigate,
	onDropOnFolder,
}: TreeCallbacks & {
	store: FileStore | null;
	revision: number;
	path: StorePath;
	name: string;
	depth: number;
	currentPath: StorePath;
	density: Density;
}) {
	const inPath =
		path === "" || currentPath === path || currentPath.startsWith(`${path}/`);
	// Default to following navigation (auto-expand ancestors of the current
	// path); once the user toggles manually, respect their choice. Derived, so
	// there's no effect syncing prop → state.
	const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
	const expanded = manualExpanded ?? inPath;
	const [children, setChildren] = useState<FileNode[] | null>(null);
	const [dragOver, setDragOver] = useState(false);

	useEffect(() => {
		if (!expanded || !store) return;
		let cancelled = false;
		store
			.list(path)
			.then((list) => {
				if (!cancelled) {
					setChildren(list.filter((n) => n.kind === "directory"));
				}
			})
			.catch(() => {
				if (!cancelled) setChildren([]);
			});
		return () => {
			cancelled = true;
		};
	}, [expanded, store, path, revision]);

	const active = currentPath === path;
	const isRoot = path === "";
	const pad = density === "compact" ? "py-1" : "py-1.5";

	return (
		<div className="min-w-0">
			<div
				onDragOver={(e) => {
					e.preventDefault();
					setDragOver(true);
				}}
				onDragLeave={() => setDragOver(false)}
				onDrop={(e) => {
					setDragOver(false);
					onDropOnFolder(path, e);
				}}
				className={cn(
					"group flex min-w-0 items-center gap-1 rounded-sm pe-1.5 transition-colors",
					pad,
					active ? "bg-accent/15 text-ink" : "text-ink-dim hover:bg-raised",
					dragOver && "ring-1 ring-accent",
				)}
				style={{ paddingLeft: depth * 12 + 4 }}
			>
				<button
					type="button"
					aria-label={expanded ? "Collapse" : "Expand"}
					onClick={() => setManualExpanded(!expanded)}
					className="flex h-4 w-4 shrink-0 items-center justify-center text-ink-mute hover:text-ink"
				>
					<ChevronRight
						className={cn(
							"h-3.5 w-3.5 transition-transform",
							expanded && "rotate-90",
						)}
					/>
				</button>
				<button
					type="button"
					onClick={() => onNavigate(path)}
					className="flex min-w-0 flex-1 items-center gap-1.5"
				>
					{isRoot ? (
						<House className="h-4 w-4 shrink-0 text-accent" />
					) : (
						<Folder
							className={cn(
								"h-4 w-4 shrink-0",
								active ? "text-accent" : "text-ink-mute",
							)}
							strokeWidth={1.5}
						/>
					)}
					<span className="truncate">{name}</span>
				</button>
			</div>

			{expanded &&
				children?.map((child) => (
					<TreeRow
						key={child.path}
						store={store}
						revision={revision}
						path={child.path}
						name={child.name}
						depth={depth + 1}
						currentPath={currentPath}
						density={density}
						onNavigate={onNavigate}
						onDropOnFolder={onDropOnFolder}
					/>
				))}
		</div>
	);
}
