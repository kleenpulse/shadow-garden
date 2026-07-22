"use client";

// Registry preview adapter. Maps the tuned control `values` onto FileExplorer's
// real props, and hands it a demo seed — written once, only when the store is
// empty, so a visitor's own uploads persist untouched across reloads.
//
// Unlike the canvas previews, this passes NO color palette: FileExplorer styles
// itself with semantic tokens that theme automatically, so there's no light/dark
// JS branch here — only the `accent` control flows through.

import { useEffect, useState } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import FileExplorer from "./FileExplorer";
import type { Density, SeedEntry, SortDir, SortKey, ViewMode } from "./types";

// The showcase's OPFS directory / IndexedDB database name.
const NAMESPACE = "sg-file-explorer";

/** A colorful SVG "image" — a real image file, generated with zero bytes shipped. */
function svgImage(hue: number, label: string): Blob {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hue} 68% 60%)"/>
    <stop offset="1" stop-color="hsl(${(hue + 48) % 360} 66% 42%)"/>
  </linearGradient></defs>
  <rect width="480" height="480" fill="url(#g)"/>
  <circle cx="360" cy="130" r="72" fill="rgba(255,255,255,0.28)"/>
  <circle cx="120" cy="360" r="120" fill="rgba(0,0,0,0.10)"/>
  <text x="28" y="452" font-family="monospace" font-size="30" fill="rgba(255,255,255,0.9)">${label}</text>
</svg>`;
	return new Blob([svg], { type: "image/svg+xml" });
}

function textFile(body: string, mime = "text/plain"): Blob {
	return new Blob([body], { type: mime });
}

// Built at module scope — this module is client-only (ssr:false), so Blob is
// available, and a stable reference means FileExplorer seeds exactly once.
const SEED: SeedEntry[] = [
	{ path: "Images/sunrise.svg", blob: svgImage(28, "sunrise") },
	{ path: "Images/ocean.svg", blob: svgImage(200, "ocean") },
	{ path: "Images/orchid.svg", blob: svgImage(288, "orchid") },
	{ path: "Documents/notes/todo.txt", blob: textFile("- Drag a real photo or video in\n- Rename me (F2 or double-click)\n- Delete me, then hit Undo\n") },
	{
		path: "Documents/readme.md",
		blob: textFile(
			"# Documents\n\nEverything here is stored on your device via OPFS or IndexedDB.\nReload the page — it all survives.\n",
			"text/markdown",
		),
	},
	{
		path: "welcome.md",
		blob: textFile(
			"# Shadow Garden — File Explorer\n\nDrop images or videos anywhere to upload.\nThey persist across reloads. Try the grid/list toggle, sort, search,\nnew folder, drag-onto-folder, cut/paste, and the detail preview.\n",
			"text/markdown",
		),
	},
];

export default function FileExplorerPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	const [mounted, setMounted] = useState(false);
	// One-shot mount gate to keep client-only storage off any hydration pass.
	// eslint-disable-next-line react-hooks/set-state-in-effect -- hydration gate
	useEffect(() => setMounted(true), []);

	// Gate on mount to keep client-only storage APIs off any hydration pass.
	if (!mounted) {
		return <div className="h-full min-h-95 w-full" aria-hidden />;
	}

	return (
		<div className="relative flex h-full min-h-95 w-full">
			<FileExplorer
				className="flex-1"
				namespace={NAMESPACE}
				seed={SEED}
				defaultView={values.defaultView as ViewMode}
				thumbnailSize={values.thumbnailSize as number}
				density={values.density as Density}
				sortBy={values.sortBy as SortKey}
				sortDir={values.sortDir as SortDir}
				showFolderRail={values.showFolderRail as boolean}
				showDetails={values.showDetails as boolean}
				showHidden={values.showHidden as boolean}
				allowUpload={values.allowUpload as boolean}
				allowDelete={values.allowDelete as boolean}
				undoWindowMs={values.undoWindowMs as number}
				accent={values.accent as string}
				reducedMotion={paused || reducedMotion}
			/>
		</div>
	);
}
