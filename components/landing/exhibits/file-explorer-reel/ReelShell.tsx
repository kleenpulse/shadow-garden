"use client";

// A pure renderer for the reel's state, assembled from FileExplorer's own leaf
// components — Toolbar, Breadcrumb, FolderTree, FileGrid/FileList, DetailPanel,
// StorageMeter, UndoSnackbar. Tiles, rows and panels are pixel-identical to the
// product because they ARE the product; only the shell frame is restated here,
// which is the whole surface area exposed to drift.
//
// Every interaction callback is a no-op: the subtree renders `inert`, so
// nothing here can fire, steal focus, or scroll the page. The `data-reel` hooks
// are the only markup the cursor needs — no registry file was edited.

import { AnimatePresence } from "motion/react";
import { Upload } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { baseName } from "@/components/registry/file-explorer/store/types";
import { AutoScroll } from "@/components/registry/file-explorer/AutoScroll";
import { Breadcrumb } from "@/components/registry/file-explorer/Breadcrumb";
import { DetailPanel } from "@/components/registry/file-explorer/DetailPanel";
import { EmptyState } from "@/components/registry/file-explorer/EmptyState";
import { FileGrid } from "@/components/registry/file-explorer/FileGrid";
import { FileList } from "@/components/registry/file-explorer/FileList";
import { FolderTree } from "@/components/registry/file-explorer/FolderTree";
import { StorageMeter } from "@/components/registry/file-explorer/StorageMeter";
import { Toolbar } from "@/components/registry/file-explorer/Toolbar";
import { UndoSnackbar } from "@/components/registry/file-explorer/UndoSnackbar";
import type { ItemCallbacks } from "@/components/registry/file-explorer/types";
import ReelPlacard from "./ReelPlacard";
import { REEL_UNDO_WINDOW_MS, type ReelTimeline } from "./useReelTimeline";

const noop = () => {};

/** Shown when no beat is running — the reduced-motion still, and the loop seam. */
const STILL_LABEL = "File Explorer · click to take over";

/** The reel is inert; these exist only to satisfy the leaves' prop contracts. */
const ITEM_CALLBACKS: ItemCallbacks = {
	onOpen: noop,
	onSelect: noop,
	onContextMenu: noop,
	onRenameCommit: noop,
	onRenameCancel: noop,
	onItemDragStart: noop,
	onItemDrop: noop,
};

const THUMBNAIL_SIZE = 104;

export default function ReelShell({
	timeline,
	reducedMotion,
}: {
	timeline: ReelTimeline;
	reducedMotion: boolean;
}) {
	const {
		ready,
		store,
		backend,
		estimate,
		revision,
		state,
		rows,
		detailNode,
		itemCount,
		pendingDelete,
		dropOverlay,
		listPending,
		beat,
		beatNumber,
		progress,
	} = timeline;

	if (!ready || !store) {
		return (
			<div className="flex h-full w-full items-center justify-center rounded-lg border border-hairline bg-surface">
				<div className="h-6 w-6 animate-spin rounded-full border-2 border-hairline border-t-accent" />
			</div>
		);
	}

	return (
		<div className="relative flex h-full w-full flex-col overflow-hidden rounded-lg border border-hairline bg-surface text-ink">
			<div data-reel="toolbar">
				<Toolbar
					view={state.view}
					sortBy={state.sortBy}
					sortDir={state.sortDir}
					search={state.search}
					folderName={state.currentPath ? baseName(state.currentPath) : "Home"}
					selectionCount={state.selection.length}
					clipboardCount={state.clipboard.length}
					allowUpload
					allowDelete
					onViewChange={noop}
					onSort={noop}
					onSearch={noop}
					onAdd={noop}
					onNewFolder={noop}
					onDeleteSelected={noop}
					onClearSelection={noop}
					onPaste={noop}
				/>
			</div>

			<div className="flex items-center justify-between gap-3 border-b border-hairline px-3 py-1.5">
				<Breadcrumb path={state.currentPath} onNavigate={noop} />
				<span className="shrink-0 font-mono text-[11px] text-ink-mute">
					{itemCount} item{itemCount === 1 ? "" : "s"}
				</span>
			</div>

			<div className="min-h-0 flex-1">
				<Group orientation="horizontal" className="flex h-full">
					<Panel id="reel-rail" defaultSize="22%" minSize="14%" maxSize="34%">
						<AutoScroll
							data-reel="rail"
							className="h-full border-r border-hairline bg-panel/40 px-1"
						>
							<FolderTree
								store={store}
								revision={revision}
								currentPath={state.currentPath}
								density="comfortable"
								onNavigate={noop}
								onDropOnFolder={noop}
							/>
						</AutoScroll>
					</Panel>
					<Separator className="w-px shrink-0 bg-hairline data-disabled:pointer-events-none" />

					<Panel id="reel-content">
						<AutoScroll data-reel="content" className="h-full">
							{rows.length === 0 ? (
								// Nothing at all mid-listing: an "empty folder" card that
								// flashes for one frame on every navigate is worse than a
								// blank pane nobody can perceive.
								listPending ? null : (
									<EmptyState variant={state.search ? "no-results" : "empty"} />
								)
							) : state.view === "grid" ? (
								<FileGrid
									rows={rows}
									store={store}
									thumbnailSize={THUMBNAIL_SIZE}
									callbacks={ITEM_CALLBACKS}
								/>
							) : (
								<FileList
									rows={rows}
									store={store}
									density="comfortable"
									sortBy={state.sortBy}
									sortDir={state.sortDir}
									onSort={noop}
									callbacks={ITEM_CALLBACKS}
								/>
							)}
						</AutoScroll>
					</Panel>

					{detailNode ? (
						<>
							<Separator className="w-px shrink-0 bg-hairline data-disabled:pointer-events-none" />
							<Panel id="reel-detail" defaultSize="28%" minSize="20%" maxSize="46%">
								<div data-reel="detail" className="h-full">
									<DetailPanel
										node={detailNode}
										store={store}
										allowDelete
										onRename={noop}
										onSaveText={noop}
										onDownload={noop}
										onDelete={noop}
										onClose={noop}
									/>
								</div>
							</Panel>
						</>
					) : null}
				</Group>
			</div>

			{/* 1fr auto 1fr: equal side tracks are what actually centre the placard
			    against the frame, rather than against whatever space the meter
			    happens to leave. The trailing cell is empty on purpose. */}
			<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-hairline px-3 py-1.5">
				<div className="min-w-0 overflow-hidden">
					<StorageMeter estimate={estimate} backend={backend} />
				</div>
				<ReelPlacard
					index={beat?.placard ? String(beatNumber).padStart(2, "0") : null}
					label={beat?.placard ?? STILL_LABEL}
					progress={beat?.placard ? progress : null}
				/>
				<span aria-hidden />
			</div>

			<AnimatePresence>
				{pendingDelete ? (
					<UndoSnackbar
						label={pendingDelete.label}
						windowMs={REEL_UNDO_WINDOW_MS}
						onUndo={noop}
						reducedMotion={reducedMotion}
					/>
				) : null}
			</AnimatePresence>

			{dropOverlay ? (
				<div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-accent/10 backdrop-blur-[1px]">
					<div className="flex items-center gap-2 rounded-lg border border-accent bg-panel px-4 py-3 text-sm text-accent shadow-lg">
						<Upload className="h-4 w-4" />
						Drop files to upload
					</div>
				</div>
			) : null}
		</div>
	);
}
