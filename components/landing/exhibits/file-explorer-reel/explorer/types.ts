// Public API surface + internal state shapes for FileExplorer.

import type { DragEvent, MouseEvent } from "react";
import type { FileNode, StorePath } from "./store/types";
import type { StoreSource } from "./use-file-store";

export type ViewMode = "grid" | "list";
export type SortKey = "name" | "date" | "size" | "type";
export type SortDir = "asc" | "desc";
export type Density = "comfortable" | "compact";

/** One demo entry written once when the store is empty. */
export interface SeedEntry {
	/** Full path from the store root. */
	path: StorePath;
	/** Provide bytes to seed a file; omit to seed an empty directory. */
	blob?: Blob;
}

/**
 * FileExplorer props. Only `store`/`namespace`/`seed` carry data; everything
 * else is a display or capability knob (these mirror the registry's tunable
 * schema). All are optional with sensible defaults — `<FileExplorer />` alone
 * renders a working, auto-persisted explorer.
 */
export interface FileExplorerProps {
	/**
	 * Persistence backend: a ready FileStore, or a factory returning one.
	 * Omit to auto-select OPFS → IndexedDB → memory via `namespace`.
	 */
	store?: StoreSource;
	/** Isolates stored data (OPFS directory + IndexedDB name). */
	namespace?: string;
	/** Written once, only if the store is empty on first load. */
	seed?: SeedEntry[];

	/** Initial content layout. The toolbar toggle overrides it live. */
	defaultView?: ViewMode;
	/** Grid tile edge length, px. */
	thumbnailSize?: number;
	/** Row height / padding profile. */
	density?: Density;
	/** Initial sort field. The toolbar sort menu overrides it live. */
	sortBy?: SortKey;
	/** Initial sort direction. */
	sortDir?: SortDir;
	/** Show the left folder-tree rail. */
	showFolderRail?: boolean;
	/** Open the detail panel when a file is selected. */
	showDetails?: boolean;
	/** Reveal entries whose name starts with a dot. */
	showHidden?: boolean;
	/** Enable drag-drop + the Add button. Off makes adds impossible. */
	allowUpload?: boolean;
	/** Enable delete + move. Off locks the store's contents. */
	allowDelete?: boolean;
	/** Grace period (ms) to undo a delete. 0 deletes immediately. */
	undoWindowMs?: number;
	/** Accent for selection / active folder / focus. Applied as --fx-accent. */
	accent?: string;

	/** OR'd into every animation gate (preview passes paused || reducedMotion). */
	reducedMotion?: boolean;
	/** Extra class on the root element. */
	className?: string;
}

// --- Reducer state ---------------------------------------------------------

export interface ContextMenuState {
	x: number;
	y: number;
	/** Path the menu was opened on, or null for the empty background. */
	targetPath: string | null;
}

export interface ExplorerState {
	currentPath: StorePath;
	view: ViewMode;
	sortBy: SortKey;
	sortDir: SortDir;
	search: string;
	/** Selected paths (unordered set, held as an array for stable rendering). */
	selection: string[];
	/** Anchor for shift-range selection. */
	lastSelected: string | null;
	/**
	 * File explicitly opened in the detail panel via double-click. Distinct
	 * from selection: a single click only highlights and never opens details.
	 */
	detailPath: string | null;
	/** Path currently being renamed inline, if any. */
	renaming: string | null;
	/** Paths marked for a cut/paste move. */
	clipboard: string[];
	contextMenu: ContextMenuState | null;
}

export type ExplorerAction =
	| { type: "NAVIGATE"; path: StorePath }
	| { type: "SET_VIEW"; view: ViewMode }
	| { type: "SET_SORT"; sortBy: SortKey; sortDir: SortDir }
	| { type: "TOGGLE_SORT"; sortBy: SortKey }
	| { type: "SET_SEARCH"; search: string }
	| {
			type: "SELECT";
			path: string;
			mode: "single" | "toggle" | "range";
			ordered: string[];
	  }
	| { type: "SELECT_ALL"; ordered: string[] }
	| { type: "CLEAR_SELECTION" }
	| { type: "SET_SELECTION"; paths: string[] }
	| { type: "OPEN_DETAIL"; path: string }
	| { type: "CLOSE_DETAIL" }
	| { type: "BEGIN_RENAME"; path: string }
	| { type: "END_RENAME" }
	| { type: "CUT"; paths: string[] }
	| { type: "CLEAR_CLIPBOARD" }
	| { type: "OPEN_CONTEXT"; x: number; y: number; targetPath: string | null }
	| { type: "CLOSE_CONTEXT" }
	| { type: "SYNC_PROPS"; view?: ViewMode; sortBy?: SortKey; sortDir?: SortDir };

/** A row in the content area — a store node plus view-derived flags. */
export interface Row {
	node: FileNode;
	selected: boolean;
	cut: boolean;
	renaming: boolean;
}

/**
 * Interaction callbacks the root threads down to every tile/row. Bundling them
 * keeps the grid/list/tile/row prop lists stable and consistent.
 */
export interface ItemCallbacks {
	/** Double-click / Enter: enter a directory or open a file's detail. */
	onOpen: (node: FileNode) => void;
	/** Click, honoring Ctrl (toggle) and Shift (range) modifiers. */
	onSelect: (node: FileNode, e: MouseEvent) => void;
	/** Right-click: open the context menu at the pointer. */
	onContextMenu: (node: FileNode, e: MouseEvent) => void;
	/** Commit an inline rename to `nextName`. */
	onRenameCommit: (node: FileNode, nextName: string) => void;
	/** Abandon an in-progress rename. */
	onRenameCancel: () => void;
	/** Drag started on an item (move source). */
	onItemDragStart: (node: FileNode, e: DragEvent) => void;
	/** Drop landed on an item — a no-op unless the target is a directory. */
	onItemDrop: (node: FileNode, e: DragEvent) => void;
}
