"use client";

// Grid view. Auto-fills columns to the tunable thumbnail size; each tile is a
// drag source, a drop target (for folders), and carries selection / cut /
// rename state. The inner Tile is private to this view.

import { useState } from "react";
import type { FileStore } from "./store/types";
import type { ItemCallbacks, Row } from "./types";
import { InlineRename } from "./inline-rename";
import { Thumbnail } from "./thumbnail";
import { cn, kindForNode } from "./util";

export function FileGrid({
	rows,
	store,
	thumbnailSize,
	callbacks,
}: {
	rows: Row[];
	store: FileStore | null;
	thumbnailSize: number;
	callbacks: ItemCallbacks;
}) {
	return (
		<div
			className="grid content-start justify-start gap-1 p-3"
			style={{
				// Fixed-width tracks (not 1fr) so tiles never rescale when the
				// container width changes — e.g. when the detail panel opens.
				gridTemplateColumns: `repeat(auto-fill, ${thumbnailSize}px)`,
			}}
		>
			{rows.map((row) => (
				<Tile
					key={row.node.path}
					row={row}
					store={store}
					callbacks={callbacks}
				/>
			))}
		</div>
	);
}

function Tile({
	row,
	store,
	callbacks,
}: {
	row: Row;
	store: FileStore | null;
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
				"group flex cursor-default flex-col items-center gap-1.5 rounded-md border border-transparent p-2 transition-colors",
				selected
					? "border-accent/40 bg-accent/15"
					: "hover:bg-raised",
				cut && "opacity-50",
				dropActive && "ring-2 ring-accent",
			)}
		>
			<div
				className={cn(
					"flex aspect-square w-full items-center justify-center overflow-hidden rounded-md",
					kindForNode(node) === "image"
						? "bg-surface"
						: "bg-surface/60",
				)}
			>
				<Thumbnail node={node} store={store} />
			</div>
			{renaming ? (
				<InlineRename
					initial={node.name}
					onCommit={(next) => callbacks.onRenameCommit(node, next)}
					onCancel={callbacks.onRenameCancel}
					className="text-center text-xs"
				/>
			) : (
				<span
					title={node.name}
					className={cn(
						"line-clamp-2 w-full text-center text-xs leading-tight",
						selected ? "text-ink" : "text-ink-dim",
					)}
				>
					{node.name}
				</span>
			)}
		</div>
	);
}
