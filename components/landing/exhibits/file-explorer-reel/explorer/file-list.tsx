"use client";

// List view: a sortable header plus dense rows (icon · name · size · modified).
// Column headers double as sort controls. The inner Row is private to this view.

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { FileStore } from "./store/types";
import type { Density, ItemCallbacks, Row, SortDir, SortKey } from "./types";
import { InlineRename } from "./inline-rename";
import { Thumbnail } from "./thumbnail";
import { cn, fileExtension, formatBytes, formatRelativeTime } from "./util";

const GRID = "grid grid-cols-[1fr_5rem_7rem] items-center gap-3";

export function FileList({
	rows,
	store,
	density,
	sortBy,
	sortDir,
	onSort,
	callbacks,
}: {
	rows: Row[];
	store: FileStore | null;
	density: Density;
	sortBy: SortKey;
	sortDir: SortDir;
	onSort: (key: SortKey) => void;
	callbacks: ItemCallbacks;
}) {
	return (
		<div className="min-w-0">
			<div
				className={cn(
					GRID,
					"sticky top-0 z-10 h-9 border-b border-hairline bg-panel px-3 font-display text-[10px] uppercase tracking-[0.15em] text-ink-mute",
				)}
			>
				<Header label="Name" col="name" {...{ sortBy, sortDir, onSort }} />
				<Header
					label="Size"
					col="size"
					className="justify-end"
					{...{ sortBy, sortDir, onSort }}
				/>
				<Header
					label="Modified"
					col="date"
					className="justify-end"
					{...{ sortBy, sortDir, onSort }}
				/>
			</div>
			<div className="divide-y divide-hairline/50">
				{rows.map((row) => (
					<ListRow
						key={row.node.path}
						row={row}
						store={store}
						density={density}
						callbacks={callbacks}
					/>
				))}
			</div>
		</div>
	);
}

function Header({
	label,
	col,
	sortBy,
	sortDir,
	onSort,
	className,
}: {
	label: string;
	col: SortKey;
	sortBy: SortKey;
	sortDir: SortDir;
	onSort: (key: SortKey) => void;
	className?: string;
}) {
	const active = sortBy === col;
	return (
		<button
			type="button"
			onClick={() => onSort(col)}
			className={cn(
				"flex items-center gap-1 transition-colors hover:text-ink",
				active && "text-accent",
				className,
			)}
		>
			<span>{label}</span>
			{active ? (
				sortDir === "asc" ? (
					<ArrowUp className="h-3 w-3" />
				) : (
					<ArrowDown className="h-3 w-3" />
				)
			) : null}
		</button>
	);
}

function ListRow({
	row,
	store,
	density,
	callbacks,
}: {
	row: Row;
	store: FileStore | null;
	density: Density;
	callbacks: ItemCallbacks;
}) {
	const { node, selected, cut, renaming } = row;
	const isDir = node.kind === "directory";
	const [dropActive, setDropActive] = useState(false);

	return (
		<div
			role="option"
			aria-selected={selected}
			tabIndex={-1}
			draggable={!renaming}
			onDragStart={(e) => callbacks.onItemDragStart(node, e)}
			onDragOver={(e) => {
				if (!isDir) return;
				e.preventDefault();
				setDropActive(true);
			}}
			onDragLeave={() => setDropActive(false)}
			onDrop={(e) => {
				setDropActive(false);
				callbacks.onItemDrop(node, e);
			}}
			onClick={(e) => callbacks.onSelect(node, e)}
			onDoubleClick={() => callbacks.onOpen(node)}
			onContextMenu={(e) => callbacks.onContextMenu(node, e)}
			className={cn(
				GRID,
				"cursor-default px-3 transition-colors",
				density === "compact" ? "py-1" : "py-1.5",
				selected ? "bg-accent/15" : "hover:bg-raised",
				cut && "opacity-50",
				dropActive && "ring-1 ring-inset ring-accent",
			)}
		>
			<div className="flex min-w-0 items-center gap-2.5">
				<span className="h-6 w-6 shrink-0">
					<Thumbnail node={node} store={store} />
				</span>
				{renaming ? (
					<InlineRename
						initial={node.name}
						onCommit={(next) => callbacks.onRenameCommit(node, next)}
						onCancel={callbacks.onRenameCancel}
						className="text-xs"
					/>
				) : (
					<span
						title={node.name}
						className={cn(
							"truncate text-xs",
							selected ? "text-ink" : "text-ink-dim",
						)}
					>
						{node.name}
					</span>
				)}
			</div>
			<span className="text-end font-mono text-[11px] tabular-nums text-ink-mute">
				{isDir ? "—" : formatBytes(node.size)}
			</span>
			<span className="truncate text-end font-mono text-[11px] text-ink-mute">
				{isDir
					? fileExtension(node.name) || "folder"
					: formatRelativeTime(node.mtime)}
			</span>
		</div>
	);
}
