"use client";

// The command strip above the content area. Two faces: the normal toolbar
// (search · sort · view · new folder · add), and a bulk-action bar that takes
// over the left side whenever items are selected.

import { useState } from "react";
import {
	ArrowDownUp,
	Check,
	ClipboardPaste,
	FolderPlus,
	LayoutGrid,
	List as ListIcon,
	Search,
	Trash2,
	Upload,
	X,
} from "lucide-react";
import type { SortDir, SortKey, ViewMode } from "./types";
import { cn } from "./util";

const SORT_LABEL: Record<SortKey, string> = {
	name: "Name",
	date: "Date modified",
	size: "Size",
	type: "Type",
};

export interface ToolbarProps {
	view: ViewMode;
	sortBy: SortKey;
	sortDir: SortDir;
	search: string;
	/** Name of the current folder — used in the search placeholder (Win11-style). */
	folderName: string;
	selectionCount: number;
	clipboardCount: number;
	allowUpload: boolean;
	allowDelete: boolean;
	onViewChange: (view: ViewMode) => void;
	/** Choose a sort field; re-choosing the active field flips direction. */
	onSort: (sortBy: SortKey) => void;
	onSearch: (value: string) => void;
	onAdd: () => void;
	onNewFolder: () => void;
	onDeleteSelected: () => void;
	onClearSelection: () => void;
	onPaste: () => void;
}

export function Toolbar(props: ToolbarProps) {
	const bulk = props.selectionCount > 0;
	return (
		<div className="flex items-center gap-2 border-b border-hairline px-2 py-2">
			{bulk ? (
				<BulkBar {...props} />
			) : (
				<label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-hairline bg-surface px-2.5 py-1.5 focus-within:border-accent">
					<Search className="h-3.5 w-3.5 shrink-0 text-ink-mute" />
					<input
						value={props.search}
						onChange={(e) => props.onSearch(e.target.value)}
						placeholder={`Search ${props.folderName}`}
						className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-ink-mute"
					/>
					{props.search ? (
						<button
							type="button"
							onClick={() => props.onSearch("")}
							aria-label="Clear search"
							className="text-ink-mute hover:text-ink"
						>
							<X className="h-3.5 w-3.5" />
						</button>
					) : null}
				</label>
			)}

			<div className="flex shrink-0 items-center gap-1">
				{props.clipboardCount > 0 ? (
					<IconButton
						label={`Paste ${props.clipboardCount}`}
						onClick={props.onPaste}
					>
						<ClipboardPaste className="h-4 w-4" />
					</IconButton>
				) : null}

				<SortMenu sortBy={props.sortBy} sortDir={props.sortDir} onSort={props.onSort} />

				<div className="flex items-center rounded-md border border-hairline p-0.5">
					<ViewButton
						active={props.view === "grid"}
						label="Grid view"
						onClick={() => props.onViewChange("grid")}
					>
						<LayoutGrid className="h-4 w-4" />
					</ViewButton>
					<ViewButton
						active={props.view === "list"}
						label="List view"
						onClick={() => props.onViewChange("list")}
					>
						<ListIcon className="h-4 w-4" />
					</ViewButton>
				</div>

				{props.allowUpload ? (
					<>
						<IconButton label="New folder" onClick={props.onNewFolder}>
							<FolderPlus className="h-4 w-4" />
						</IconButton>
						<button
							type="button"
							onClick={props.onAdd}
							className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover"
						>
							<Upload className="h-3.5 w-3.5" />
							<span className="hidden sm:inline">Add</span>
						</button>
					</>
				) : null}
			</div>
		</div>
	);
}

function BulkBar(props: ToolbarProps) {
	return (
		<div className="flex min-w-0 flex-1 items-center gap-2">
			<span className="rounded-md bg-accent/15 px-2 py-1 font-display text-[11px] uppercase tracking-[0.15em] text-accent">
				{props.selectionCount} selected
			</span>
			{props.allowDelete ? (
				<button
					type="button"
					onClick={props.onDeleteSelected}
					className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1.5 text-xs text-ink-dim transition-colors hover:border-danger hover:text-danger"
				>
					<Trash2 className="h-3.5 w-3.5" />
					Delete
				</button>
			) : null}
			<button
				type="button"
				onClick={props.onClearSelection}
				className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-ink-mute transition-colors hover:text-ink"
			>
				<X className="h-3.5 w-3.5" />
				Clear
			</button>
		</div>
	);
}

function SortMenu({
	sortBy,
	sortDir,
	onSort,
}: {
	sortBy: SortKey;
	sortDir: SortDir;
	onSort: (key: SortKey) => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<div className="relative">
			<IconButton
				label={`Sort by ${SORT_LABEL[sortBy]}, ${sortDir === "asc" ? "ascending" : "descending"}`}
				onClick={() => setOpen((v) => !v)}
				active={open}
			>
				<ArrowDownUp className="h-4 w-4" />
			</IconButton>
			{open ? (
				<>
					{/* click-away backdrop */}
					<button
						type="button"
						aria-hidden
						tabIndex={-1}
						onClick={() => setOpen(false)}
						className="fixed inset-0 z-40 cursor-default"
					/>
					<div
						role="menu"
						className="absolute end-0 top-full z-50 mt-1 min-w-44 overflow-hidden rounded-md border border-hairline bg-panel py-1 shadow-lg"
					>
						{(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
							<button
								key={key}
								type="button"
								role="menuitemradio"
								aria-checked={sortBy === key}
								onClick={() => {
									onSort(key);
									setOpen(false);
								}}
								className={cn(
									"flex w-full items-center justify-between px-3 py-1.5 text-start text-xs transition-colors hover:bg-raised",
									sortBy === key ? "text-accent" : "text-ink-dim",
								)}
							>
								<span>{SORT_LABEL[key]}</span>
								{sortBy === key ? (
									<span className="flex items-center gap-1 font-mono text-[10px] text-ink-mute">
										{sortDir === "asc" ? "A→Z" : "Z→A"}
										<Check className="h-3 w-3 text-accent" />
									</span>
								) : null}
							</button>
						))}
					</div>
				</>
			) : null}
		</div>
	);
}

function IconButton({
	children,
	label,
	onClick,
	active,
}: {
	children: React.ReactNode;
	label: string;
	onClick: () => void;
	active?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={label}
			title={label}
			className={cn(
				"flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-ink-dim transition-colors hover:bg-raised hover:text-ink",
				active && "border-hairline bg-raised text-ink",
			)}
		>
			{children}
		</button>
	);
}

function ViewButton({
	children,
	label,
	active,
	onClick,
}: {
	children: React.ReactNode;
	label: string;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={label}
			aria-pressed={active}
			title={label}
			className={cn(
				"flex h-7 w-7 items-center justify-center rounded transition-colors",
				active
					? "bg-accent/15 text-accent"
					: "text-ink-mute hover:text-ink",
			)}
		>
			{children}
		</button>
	);
}
