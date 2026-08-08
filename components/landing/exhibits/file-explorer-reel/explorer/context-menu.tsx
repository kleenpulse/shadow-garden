"use client";

// Right-click menu, positioned within the explorer's bounds (coordinates are
// relative to the root, which is `position: relative`). Items are filtered by
// what was clicked — a file, a folder, or the empty background.

import {
	Download,
	FolderInput,
	FolderPlus,
	Pencil,
	Scissors,
	SquareArrowOutUpRight,
	Trash2,
} from "lucide-react";
import type { FileNode } from "./store/types";
import { cn } from "./util";

export interface ContextMenuProps {
	x: number;
	y: number;
	/** The clicked node, or null for the empty background. */
	target: FileNode | null;
	hasClipboard: boolean;
	allowUpload: boolean;
	allowDelete: boolean;
	onOpen: () => void;
	onDownload: () => void;
	onRename: () => void;
	onCut: () => void;
	onPaste: () => void;
	onDelete: () => void;
	onNewFolder: () => void;
	onClose: () => void;
}

export function ContextMenu(props: ContextMenuProps) {
	const { target } = props;
	const isDir = target?.kind === "directory";
	const isFile = target?.kind === "file";

	return (
		<>
			<button
				type="button"
				aria-hidden
				tabIndex={-1}
				onClick={props.onClose}
				onContextMenu={(e) => {
					e.preventDefault();
					props.onClose();
				}}
				className="fixed inset-0 z-40 cursor-default"
			/>
			<div
				role="menu"
				style={{ left: props.x, top: props.y }}
				className="absolute z-50 min-w-48 overflow-hidden rounded-md border border-hairline bg-panel py-1 shadow-xl"
			>
				{target ? (
					<Item
						icon={SquareArrowOutUpRight}
						label={isDir ? "Open" : "Preview"}
						onClick={run(props.onOpen, props.onClose)}
					/>
				) : null}

				{props.hasClipboard && (isDir || !target) ? (
					<Item
						icon={FolderInput}
						label={target ? "Paste into folder" : "Paste"}
						onClick={run(props.onPaste, props.onClose)}
					/>
				) : null}

				{!target && props.allowUpload ? (
					<Item
						icon={FolderPlus}
						label="New folder"
						onClick={run(props.onNewFolder, props.onClose)}
					/>
				) : null}

				{isFile ? (
					<Item
						icon={Download}
						label="Download"
						onClick={run(props.onDownload, props.onClose)}
					/>
				) : null}

				{target && props.allowDelete ? (
					<Item
						icon={Pencil}
						label="Rename"
						onClick={run(props.onRename, props.onClose)}
					/>
				) : null}

				{target && props.allowDelete ? (
					<Item
						icon={Scissors}
						label="Cut"
						onClick={run(props.onCut, props.onClose)}
					/>
				) : null}

				{target && props.allowDelete ? (
					<>
						<div className="my-1 h-px bg-hairline/60" />
						<Item
							icon={Trash2}
							label="Delete"
							danger
							onClick={run(props.onDelete, props.onClose)}
						/>
					</>
				) : null}
			</div>
		</>
	);
}

function run(action: () => void, close: () => void) {
	return () => {
		action();
		close();
	};
}

function Item({
	icon: Icon,
	label,
	onClick,
	danger,
}: {
	icon: typeof Download;
	label: string;
	onClick: () => void;
	danger?: boolean;
}) {
	return (
		<button
			type="button"
			role="menuitem"
			onClick={onClick}
			className={cn(
				"flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors",
				danger
					? "text-ink-dim hover:bg-danger/10 hover:text-danger"
					: "text-ink-dim hover:bg-raised hover:text-ink",
			)}
		>
			<Icon className="h-3.5 w-3.5 shrink-0" />
			{label}
		</button>
	);
}
