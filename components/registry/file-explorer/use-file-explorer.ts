"use client";

// The explorer's state machine: navigation, selection (single/toggle/range),
// live view + sort, search, inline rename, cut clipboard, and the context-menu
// anchor. Deliberately a plain useReducer with no external store dependency, so
// the component drops into any app without pulling in Zustand.

import { useReducer } from "react";
import type { FileNode } from "./store/types";
import type {
	ExplorerAction,
	ExplorerState,
	FileExplorerProps,
} from "./types";
import { fileExtension, kindForNode } from "./util";

export function initExplorerState(
	props: Pick<FileExplorerProps, "defaultView" | "sortBy" | "sortDir">,
): ExplorerState {
	return {
		currentPath: "",
		view: props.defaultView ?? "grid",
		sortBy: props.sortBy ?? "name",
		sortDir: props.sortDir ?? "asc",
		search: "",
		selection: [],
		lastSelected: null,
		detailPath: null,
		renaming: null,
		clipboard: [],
		contextMenu: null,
	};
}

export function explorerReducer(
	state: ExplorerState,
	action: ExplorerAction,
): ExplorerState {
	switch (action.type) {
		case "NAVIGATE":
			return {
				...state,
				currentPath: action.path,
				selection: [],
				lastSelected: null,
				detailPath: null,
				search: "",
				renaming: null,
				contextMenu: null,
			};

		case "SET_VIEW":
			return { ...state, view: action.view };

		case "SET_SORT":
			return { ...state, sortBy: action.sortBy, sortDir: action.sortDir };

		case "TOGGLE_SORT":
			return {
				...state,
				sortBy: action.sortBy,
				sortDir:
					state.sortBy === action.sortBy
						? state.sortDir === "asc"
							? "desc"
							: "asc"
						: "asc",
			};

		case "SET_SEARCH":
			return { ...state, search: action.search };

		case "SELECT": {
			const { path, mode, ordered } = action;
			if (mode === "single") {
				return { ...state, selection: [path], lastSelected: path, contextMenu: null };
			}
			if (mode === "toggle") {
				const has = state.selection.includes(path);
				return {
					...state,
					selection: has
						? state.selection.filter((p) => p !== path)
						: [...state.selection, path],
					lastSelected: path,
					contextMenu: null,
				};
			}
			// range: anchor..path inclusive, in listing order
			const anchor = state.lastSelected ?? path;
			const a = ordered.indexOf(anchor);
			const b = ordered.indexOf(path);
			if (a === -1 || b === -1) {
				return { ...state, selection: [path], lastSelected: path };
			}
			const [lo, hi] = a <= b ? [a, b] : [b, a];
			return {
				...state,
				selection: ordered.slice(lo, hi + 1),
				lastSelected: anchor,
				contextMenu: null,
			};
		}

		case "SELECT_ALL":
			return {
				...state,
				selection: action.ordered,
				lastSelected: action.ordered.at(-1) ?? null,
			};

		case "CLEAR_SELECTION":
			return { ...state, selection: [], lastSelected: null };

		case "SET_SELECTION":
			return {
				...state,
				selection: action.paths,
				lastSelected: action.paths.at(-1) ?? null,
			};

		case "OPEN_DETAIL":
			// Double-click a file: open its detail panel and select it.
			return {
				...state,
				detailPath: action.path,
				selection: [action.path],
				lastSelected: action.path,
				contextMenu: null,
			};

		case "CLOSE_DETAIL":
			return { ...state, detailPath: null };

		case "BEGIN_RENAME":
			return { ...state, renaming: action.path, contextMenu: null };

		case "END_RENAME":
			return { ...state, renaming: null };

		case "CUT":
			return { ...state, clipboard: action.paths, contextMenu: null };

		case "CLEAR_CLIPBOARD":
			return { ...state, clipboard: [] };

		case "OPEN_CONTEXT": {
			// Right-clicking an unselected item selects just it first (OS behavior).
			const selection =
				action.targetPath && !state.selection.includes(action.targetPath)
					? [action.targetPath]
					: state.selection;
			return {
				...state,
				selection,
				lastSelected: action.targetPath ?? state.lastSelected,
				contextMenu: {
					x: action.x,
					y: action.y,
					targetPath: action.targetPath,
				},
			};
		}

		case "CLOSE_CONTEXT":
			return { ...state, contextMenu: null };

		case "SYNC_PROPS":
			return {
				...state,
				view: action.view ?? state.view,
				sortBy: action.sortBy ?? state.sortBy,
				sortDir: action.sortDir ?? state.sortDir,
			};

		default:
			return state;
	}
}

export function useFileExplorer(
	props: Pick<FileExplorerProps, "defaultView" | "sortBy" | "sortDir">,
) {
	return useReducer(explorerReducer, props, initExplorerState);
}

// --- Pure view derivation --------------------------------------------------

/** Filter out hidden entries (unless allowed) and apply a word-AND search. */
export function filterNodes(
	nodes: FileNode[],
	search: string,
	showHidden: boolean,
): FileNode[] {
	let out = showHidden ? nodes : nodes.filter((n) => !n.name.startsWith("."));
	const query = search.trim().toLowerCase();
	if (query) {
		const words = query.split(/\s+/);
		out = out.filter((n) => {
			const hay = n.name.toLowerCase();
			return words.every((w) => hay.includes(w));
		});
	}
	return out;
}

/**
 * Sort a listing the way a desktop file manager does.
 *
 * Folders are a separate band that always sits above the files, under every
 * sort field AND both directions — the grouping is structural, not part of
 * what the direction toggle reverses. Windows Explorer and Finder both behave
 * this way, and it is why "sort by size descending" still opens with folders
 * rather than burying them at the bottom on a 0-byte tiebreak.
 *
 * Within each band the chosen key applies, with `numeric` collation so
 * `render-2` precedes `render-10` instead of following it.
 */
export function sortNodes(
	nodes: FileNode[],
	sortBy: ExplorerState["sortBy"],
	sortDir: ExplorerState["sortDir"],
): FileNode[] {
	const dir = sortDir === "asc" ? 1 : -1;
	return [...nodes].sort((a, b) => {
		// Not multiplied by `dir` — flipping the direction reorders each band, it
		// does not send folders to the bottom.
		if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;

		let cmp = 0;
		switch (sortBy) {
			case "name":
				cmp = collate(a.name, b.name);
				break;
			case "date":
				cmp = a.mtime - b.mtime;
				break;
			case "size":
				cmp = a.size - b.size;
				break;
			case "type":
				// Kind before extension: a Type sort is asked for to put like with
				// like, and raw extension alphabetising scatters one media set
				// across the listing (.mov far from .mp4, .avif next to .avi).
				cmp =
					kindForNode(a).localeCompare(kindForNode(b)) ||
					fileExtension(a.name).localeCompare(fileExtension(b.name));
				break;
		}
		// Stable tiebreak on name keeps ordering deterministic.
		if (cmp === 0) cmp = collate(a.name, b.name);
		return cmp * dir;
	});
}

function collate(a: string, b: string): number {
	return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
