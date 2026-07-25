"use client";

/**
 * FileExplorer — a persistent, three-pane file manager.
 *
 * Uploads (images, video, any blob) are written to a real client-side file
 * system and survive reloads — because `localStorage` can only hold strings,
 * persistence goes through a pluggable {@link FileStore}. The bundled
 * `createFileStore` auto-selects the strongest backend available:
 *
 *   OPFS (navigator.storage.getDirectory) → IndexedDB → in-memory
 *
 * The component is storage-agnostic: pass your own `store` (an S3 adapter, a
 * REST API, a mock) to back it with anything. See ./store/types.ts for the
 * one interface you implement, and ./README.md for the recipe.
 *
 * Blob URLs for previews are created lazily and revoked on unmount (see
 * ./useObjectUrl.ts) so images and video never leak memory.
 *
 * Everything is self-contained — no imports outside this folder — so it drops
 * into any React app. Styling uses semantic CSS-variable tokens
 * (bg-panel, text-ink, border-hairline, bg-accent) which theme automatically;
 * only the `accent` prop flows in, as a scoped --color-accent override.
 */

import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type DragEvent,
	type KeyboardEvent,
	type MouseEvent,
} from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { AnimatePresence } from "motion/react";
import { Upload } from "lucide-react";
import {
	baseName,
	joinPath,
	parentPath,
	type FileNode,
	type StorePath,
} from "./store/types";
import { AutoScroll } from "./AutoScroll";
import { Breadcrumb } from "./Breadcrumb";
import { ContextMenu } from "./ContextMenu";
import { DetailPanel } from "./DetailPanel";
import { EmptyState } from "./EmptyState";
import { FileGrid } from "./FileGrid";
import { FileList } from "./FileList";
import { FolderTree } from "./FolderTree";
import { StorageMeter } from "./StorageMeter";
import { Toolbar } from "./Toolbar";
import { UndoSnackbar } from "./UndoSnackbar";
import type { FileExplorerProps, ItemCallbacks, Row, SortKey } from "./types";
import {
	filterNodes,
	sortNodes,
	useFileExplorer,
} from "./useFileExplorer";
import {
	useDirectory,
	useFileStore,
	useStorageEstimate,
} from "./useFileStore";
import { cn, uniqueName } from "./util";

const MOVE_MIME = "application/x-fx-move";

interface PendingDelete {
	paths: string[];
	label: string;
}

export default function FileExplorer({
	store: storeSource,
	namespace = "sg-file-explorer",
	seed,
	defaultView = "grid",
	thumbnailSize = 112,
	density = "comfortable",
	sortBy = "name",
	sortDir = "asc",
	showFolderRail = true,
	showDetails = true,
	showHidden = false,
	allowUpload = true,
	allowDelete = true,
	undoWindowMs = 5000,
	accent = "#a855f7",
	reducedMotion = false,
	className,
}: FileExplorerProps) {
	const { store, ready, backend, error, revision, reload } = useFileStore(
		storeSource,
		namespace,
	);
	const [state, dispatch] = useFileExplorer({ defaultView, sortBy, sortDir });
	const { entries } = useDirectory(store, state.currentPath, revision);
	const estimate = useStorageEstimate(store, revision);

	const rootRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const seededRef = useRef(false);
	const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
	const [dragging, setDragging] = useState(false);

	// Re-sync live view/sort when the tuned props change (control drags), while
	// leaving navigation/selection/search untouched.
	useEffect(() => {
		dispatch({ type: "SYNC_PROPS", view: defaultView, sortBy, sortDir });
	}, [defaultView, sortBy, sortDir, dispatch]);

	// Seed demo content once, only when the store is completely empty.
	useEffect(() => {
		if (!ready || !store || !seed?.length || seededRef.current) return;
		seededRef.current = true;
		(async () => {
			const root = await store.list("");
			if (root.length > 0) return;
			for (const entry of seed) {
				if (entry.blob) await store.write(entry.path, entry.blob);
				else await store.mkdir(entry.path);
			}
			reload();
		})();
	}, [ready, store, seed, reload]);

	// --- Derived view ------------------------------------------------------
	const displayed = useMemo(() => {
		let list = entries;
		if (pendingDelete) {
			const hidden = new Set(pendingDelete.paths);
			list = list.filter((n) => !hidden.has(n.path));
		}
		return sortNodes(
			filterNodes(list, state.search, showHidden),
			state.sortBy,
			state.sortDir,
		);
	}, [entries, pendingDelete, state.search, state.sortBy, state.sortDir, showHidden]);

	const orderedPaths = useMemo(() => displayed.map((n) => n.path), [displayed]);

	const rows: Row[] = useMemo(
		() =>
			displayed.map((node) => ({
				node,
				selected: state.selection.includes(node.path),
				cut: state.clipboard.includes(node.path),
				renaming: state.renaming === node.path,
			})),
		[displayed, state.selection, state.clipboard, state.renaming],
	);

	// The detail panel tracks the explicitly-opened file (double-click), not the
	// selection — a single click only highlights.
	const detailNode: FileNode | null = useMemo(() => {
		if (!showDetails || !state.detailPath) return null;
		const found = displayed.find((n) => n.path === state.detailPath);
		return found && found.kind === "file" ? found : null;
	}, [showDetails, state.detailPath, displayed]);

	// --- Mutations ---------------------------------------------------------
	const uploadFiles = useCallback(
		async (files: FileList | File[], dir: StorePath) => {
			if (!store || !allowUpload) return;
			const taken = new Set((await store.list(dir)).map((n) => n.name));
			for (const file of Array.from(files)) {
				const name = uniqueName(file.name, taken);
				taken.add(name);
				await store.write(joinPath(dir, name), file, file.type);
			}
			reload();
		},
		[store, allowUpload, reload],
	);

	const moveInto = useCallback(
		async (srcPath: StorePath, destDir: StorePath) => {
			if (!store || !allowDelete || !srcPath) return;
			// Can't move a folder into itself or a descendant.
			if (destDir === srcPath || destDir.startsWith(`${srcPath}/`)) return;
			if (parentPath(srcPath) === destDir) return; // already there
			const taken = new Set((await store.list(destDir)).map((n) => n.name));
			const name = uniqueName(baseName(srcPath), taken);
			try {
				await store.move(srcPath, joinPath(destDir, name));
				reload();
			} catch {
				/* collision or race — leave as-is */
			}
		},
		[store, allowDelete, reload],
	);

	// Route a drop to the right action: OS files → upload, internal → move.
	const handleDropPayload = useCallback(
		(e: DragEvent, destDir: StorePath) => {
			if (e.dataTransfer.files?.length) {
				void uploadFiles(e.dataTransfer.files, destDir);
				return;
			}
			const src = e.dataTransfer.getData(MOVE_MIME);
			if (src) void moveInto(src, destDir);
		},
		[uploadFiles, moveInto],
	);

	const newFolder = useCallback(async () => {
		if (!store || !allowUpload) return;
		const taken = new Set((await store.list(state.currentPath)).map((n) => n.name));
		const name = uniqueName("New folder", taken);
		const path = joinPath(state.currentPath, name);
		await store.mkdir(path);
		reload();
		dispatch({ type: "BEGIN_RENAME", path });
	}, [store, allowUpload, state.currentPath, reload, dispatch]);

	const commitRename = useCallback(
		async (node: FileNode, nextName: string) => {
			if (!store) return;
			const wasDetail = state.detailPath === node.path;
			dispatch({ type: "END_RENAME" });
			try {
				const moved = await store.rename(node.path, nextName);
				// Keep the detail panel on the renamed file; else just reselect it.
				if (wasDetail) dispatch({ type: "OPEN_DETAIL", path: moved.path });
				else dispatch({ type: "SET_SELECTION", paths: [moved.path] });
				reload();
			} catch {
				/* collision — keep the original */
			}
		},
		[store, state.detailPath, dispatch, reload],
	);

	// Overwrite a text file's contents from the detail-panel editor.
	const saveText = useCallback(
		async (node: FileNode, text: string) => {
			if (!store) return;
			const mime = node.mime || "text/plain";
			await store.write(node.path, new Blob([text], { type: mime }), mime);
			reload();
		},
		[store, reload],
	);

	const commitDelete = useCallback(
		async (paths: string[]) => {
			if (!store) return;
			for (const path of paths) await store.remove(path);
			reload();
		},
		[store, reload],
	);

	const requestDelete = useCallback(
		(paths: string[]) => {
			if (!store || !allowDelete || paths.length === 0) return;
			if (undoWindowMs <= 0) {
				void commitDelete(paths);
				return;
			}
			// Deferred: hide now, remove for real when the window lapses.
			const label =
				paths.length === 1
					? `Deleted ${baseName(paths[0])}`
					: `Deleted ${paths.length} items`;
			setPendingDelete({ paths, label });
			dispatch({ type: "CLEAR_SELECTION" });
			if (deleteTimer.current) clearTimeout(deleteTimer.current);
			deleteTimer.current = setTimeout(() => {
				void commitDelete(paths);
				setPendingDelete(null);
			}, undoWindowMs);
		},
		[store, allowDelete, undoWindowMs, commitDelete, dispatch],
	);

	const undoDelete = useCallback(() => {
		if (deleteTimer.current) clearTimeout(deleteTimer.current);
		setPendingDelete(null); // nothing was removed — the paths simply reappear
	}, []);

	const paste = useCallback(
		async (destDir: StorePath) => {
			if (!state.clipboard.length) return;
			for (const src of state.clipboard) await moveInto(src, destDir);
			dispatch({ type: "CLEAR_CLIPBOARD" });
		},
		[state.clipboard, moveInto, dispatch],
	);

	const download = useCallback(
		async (node: FileNode) => {
			if (!store || node.kind !== "file") return;
			const blob = await store.read(node.path);
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = node.name;
			a.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		},
		[store],
	);

	// --- Interaction callbacks --------------------------------------------
	// Double-click / Enter: folders navigate, files open the detail panel.
	const openNode = useCallback(
		(node: FileNode) => {
			if (node.kind === "directory") {
				dispatch({ type: "NAVIGATE", path: node.path });
			} else {
				dispatch({ type: "OPEN_DETAIL", path: node.path });
			}
		},
		[dispatch],
	);

	// Single click: select / highlight only — never opens the detail panel.
	// A plain click on an already-selected item within a multi-selection
	// deselects just that item (keeps the rest).
	const selectNode = useCallback(
		(node: FileNode, e: MouseEvent) => {
			let mode: "single" | "toggle" | "range";
			if (e.metaKey || e.ctrlKey) mode = "toggle";
			else if (e.shiftKey) mode = "range";
			else if (state.selection.length > 1 && state.selection.includes(node.path))
				mode = "toggle";
			else mode = "single";
			dispatch({ type: "SELECT", path: node.path, mode, ordered: orderedPaths });
		},
		[dispatch, orderedPaths, state.selection],
	);

	const openContextAt = useCallback(
		(clientX: number, clientY: number, targetPath: string | null) => {
			const rect = rootRef.current?.getBoundingClientRect();
			const x = rect ? Math.min(clientX - rect.left, rect.width - 200) : clientX;
			const y = rect ? Math.min(clientY - rect.top, rect.height - 260) : clientY;
			dispatch({
				type: "OPEN_CONTEXT",
				x: Math.max(4, x),
				y: Math.max(4, y),
				targetPath,
			});
		},
		[dispatch],
	);

	const itemCallbacks: ItemCallbacks = useMemo(
		() => ({
			onOpen: openNode,
			onSelect: selectNode,
			onContextMenu: (node, e) => {
				e.preventDefault();
				e.stopPropagation();
				openContextAt(e.clientX, e.clientY, node.path);
			},
			onRenameCommit: commitRename,
			onRenameCancel: () => dispatch({ type: "END_RENAME" }),
			onItemDragStart: (node, e) => {
				e.dataTransfer.setData(MOVE_MIME, node.path);
				e.dataTransfer.effectAllowed = "move";
			},
			onItemDrop: (node, e) => {
				e.preventDefault();
				e.stopPropagation();
				if (node.kind !== "directory") return;
				handleDropPayload(e, node.path);
			},
		}),
		[openNode, selectNode, openContextAt, commitRename, handleDropPayload, dispatch],
	);

	// --- Keyboard ----------------------------------------------------------
	const onKeyDown = useCallback(
		(e: KeyboardEvent) => {
			const target = e.target as HTMLElement;
			if (
				state.renaming ||
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA"
			) {
				return;
			}
			if (e.key === "Escape") {
				if (state.contextMenu) dispatch({ type: "CLOSE_CONTEXT" });
				else if (state.detailPath) dispatch({ type: "CLOSE_DETAIL" });
				else dispatch({ type: "CLEAR_SELECTION" });
			} else if ((e.key === "Delete" || e.key === "Del") && state.selection.length) {
				e.preventDefault();
				requestDelete(state.selection);
			} else if (e.key === "Backspace") {
				e.preventDefault();
				dispatch({ type: "NAVIGATE", path: parentPath(state.currentPath) });
			} else if (e.key === "Enter" && state.selection.length === 1) {
				const node = displayed.find((n) => n.path === state.selection[0]);
				if (node) openNode(node);
			} else if (e.key === "F2" && state.selection.length === 1 && allowDelete) {
				e.preventDefault();
				dispatch({ type: "BEGIN_RENAME", path: state.selection[0] });
			} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
				e.preventDefault();
				dispatch({ type: "SELECT_ALL", ordered: orderedPaths });
			} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "x" && state.selection.length && allowDelete) {
				dispatch({ type: "CUT", paths: state.selection });
			} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v" && state.clipboard.length) {
				void paste(state.currentPath);
			}
		},
		[state, displayed, orderedPaths, dispatch, requestDelete, openNode, paste, allowDelete],
	);

	useEffect(() => {
		return () => {
			if (deleteTimer.current) clearTimeout(deleteTimer.current);
		};
	}, []);

	// --- Render ------------------------------------------------------------
	const rootStyle = {
		"--color-accent": accent,
		"--fx-accent": accent,
	} as CSSProperties;

	if (!ready) {
		return (
			<div
				className={cn(
					"flex h-full min-h-95 w-full items-center justify-center rounded-lg border border-hairline bg-surface",
					className,
				)}
			>
				<div className="h-6 w-6 animate-spin rounded-full border-2 border-hairline border-t-accent" />
			</div>
		);
	}

	if (error || !store) {
		return (
			<div
				className={cn(
					"flex h-full min-h-95 w-full items-center justify-center rounded-lg border border-hairline bg-surface",
					className,
				)}
				style={rootStyle}
			>
				<EmptyState variant="unsupported" />
			</div>
		);
	}

	const contentEmpty = displayed.length === 0;

	return (
		<div
			ref={rootRef}
			tabIndex={0}
			onKeyDown={onKeyDown}
			onDragEnter={(e) => {
				if (allowUpload && e.dataTransfer.types.includes("Files")) {
					setDragging(true);
				}
			}}
			onDragOver={(e) => {
				if (dragging || e.dataTransfer.types.includes("Files")) e.preventDefault();
			}}
			onDragLeave={(e) => {
				if (e.target === rootRef.current) setDragging(false);
			}}
			onDrop={(e) => {
				e.preventDefault();
				setDragging(false);
				handleDropPayload(e, state.currentPath);
			}}
			style={rootStyle}
			className={cn(
				"relative flex h-full min-h-95 w-full flex-col overflow-hidden rounded-lg border border-hairline bg-surface text-ink outline-none",
				className,
			)}
		>
			<Toolbar
				view={state.view}
				sortBy={state.sortBy}
				sortDir={state.sortDir}
				search={state.search}
				folderName={state.currentPath ? baseName(state.currentPath) : "Home"}
				selectionCount={state.selection.length}
				clipboardCount={state.clipboard.length}
				allowUpload={allowUpload}
				allowDelete={allowDelete}
				onViewChange={(view) => dispatch({ type: "SET_VIEW", view })}
				onSort={(key: SortKey) => dispatch({ type: "TOGGLE_SORT", sortBy: key })}
				onSearch={(search) => dispatch({ type: "SET_SEARCH", search })}
				onAdd={() => fileInputRef.current?.click()}
				onNewFolder={newFolder}
				onDeleteSelected={() => requestDelete(state.selection)}
				onClearSelection={() => dispatch({ type: "CLEAR_SELECTION" })}
				onPaste={() => paste(state.currentPath)}
			/>

			<div className="flex items-center justify-between gap-3 border-b border-hairline px-3 py-1.5">
				<Breadcrumb path={state.currentPath} onNavigate={(path) => dispatch({ type: "NAVIGATE", path })} />
				<span className="shrink-0 font-mono text-[11px] text-ink-mute">
					{displayed.length} item{displayed.length === 1 ? "" : "s"}
				</span>
			</div>

			<div className="min-h-0 flex-1">
				<Group orientation="horizontal" className="flex h-full">
					{showFolderRail ? (
						<>
							<Panel id="rail" defaultSize="22%" minSize="14%" maxSize="34%">
								<AutoScroll className="h-full border-r border-hairline bg-panel/40 px-1">
									<FolderTree
										store={store}
										revision={revision}
										currentPath={state.currentPath}
										density={density}
										onNavigate={(path) => dispatch({ type: "NAVIGATE", path })}
										onDropOnFolder={(dir, e) => {
											e.preventDefault();
											handleDropPayload(e, dir);
										}}
									/>
								</AutoScroll>
							</Panel>
							<Separator className="w-px shrink-0 bg-hairline transition-colors hover:bg-accent data-disabled:pointer-events-none" />
						</>
					) : null}

					<Panel id="content">
						<AutoScroll
							className="h-full"
							onClick={(e) => {
								if (e.target === e.currentTarget) dispatch({ type: "CLEAR_SELECTION" });
							}}
							onContextMenu={(e) => {
								if (e.target === e.currentTarget) {
									e.preventDefault();
									openContextAt(e.clientX, e.clientY, null);
								}
							}}
						>
							{contentEmpty ? (
								<EmptyState
									variant={state.search ? "no-results" : "empty"}
									onAdd={allowUpload ? () => fileInputRef.current?.click() : undefined}
								/>
							) : state.view === "grid" ? (
								<FileGrid
									rows={rows}
									store={store}
									thumbnailSize={thumbnailSize}
									callbacks={itemCallbacks}
								/>
							) : (
								<FileList
									rows={rows}
									store={store}
									density={density}
									sortBy={state.sortBy}
									sortDir={state.sortDir}
									onSort={(key) => dispatch({ type: "TOGGLE_SORT", sortBy: key })}
									callbacks={itemCallbacks}
								/>
							)}
						</AutoScroll>
					</Panel>

					{detailNode ? (
						<>
							<Separator className="w-px shrink-0 bg-hairline transition-colors hover:bg-accent data-disabled:pointer-events-none" />
							<Panel id="detail" defaultSize="28%" minSize="20%" maxSize="46%">
								<DetailPanel
									node={detailNode}
									store={store}
									allowDelete={allowDelete}
									onRename={(next) => commitRename(detailNode, next)}
									onSaveText={(text) => saveText(detailNode, text)}
									onDownload={() => download(detailNode)}
									onDelete={() => requestDelete([detailNode.path])}
									onClose={() => dispatch({ type: "CLOSE_DETAIL" })}
								/>
							</Panel>
						</>
					) : null}
				</Group>
			</div>

			<div className="flex items-center justify-between gap-3 border-t border-hairline px-3 py-1.5">
				<StorageMeter estimate={estimate} backend={backend} />
				{state.clipboard.length > 0 ? (
					<span className="font-mono text-[11px] text-ink-mute">
						{state.clipboard.length} cut · paste into a folder
					</span>
				) : null}
			</div>

			{/* Context menu */}
			{state.contextMenu ? (
				<ContextMenu
					x={state.contextMenu.x}
					y={state.contextMenu.y}
					target={
						state.contextMenu.targetPath
							? (displayed.find((n) => n.path === state.contextMenu?.targetPath) ?? null)
							: null
					}
					hasClipboard={state.clipboard.length > 0}
					allowUpload={allowUpload}
					allowDelete={allowDelete}
					onOpen={() => {
						const node = displayed.find((n) => n.path === state.contextMenu?.targetPath);
						if (node) openNode(node);
					}}
					onDownload={() => {
						const node = displayed.find((n) => n.path === state.contextMenu?.targetPath);
						if (node) void download(node);
					}}
					onRename={() => {
						if (state.contextMenu?.targetPath) {
							dispatch({ type: "BEGIN_RENAME", path: state.contextMenu.targetPath });
						}
					}}
					onCut={() => dispatch({ type: "CUT", paths: state.selection })}
					onPaste={() =>
						paste(state.contextMenu?.targetPath ?? state.currentPath)
					}
					onDelete={() => requestDelete(state.selection)}
					onNewFolder={newFolder}
					onClose={() => dispatch({ type: "CLOSE_CONTEXT" })}
				/>
			) : null}

			{/* Deferred-delete undo */}
			<AnimatePresence>
				{pendingDelete ? (
					<UndoSnackbar
						label={pendingDelete.label}
						windowMs={undoWindowMs}
						onUndo={undoDelete}
						reducedMotion={reducedMotion}
					/>
				) : null}
			</AnimatePresence>

			{/* OS drag-drop overlay */}
			{dragging ? (
				<div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-accent/10 backdrop-blur-[1px]">
					<div className="flex items-center gap-2 rounded-lg border border-accent bg-panel px-4 py-3 text-sm text-accent shadow-lg">
						<Upload className="h-4 w-4" />
						Drop files to upload
					</div>
				</div>
			) : null}

			<input
				ref={fileInputRef}
				type="file"
				multiple
				hidden
				onChange={(e) => {
					if (e.target.files?.length) void uploadFiles(e.target.files, state.currentPath);
					e.target.value = "";
				}}
			/>
		</div>
	);
}
