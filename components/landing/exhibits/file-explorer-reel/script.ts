"use client";

// The δ reel's screenplay: seed content, the nine beats, and the capability
// surface a beat may call. Data and choreography only — no React, no DOM. The
// driver (./useReelTimeline.ts) implements ReelApi and supplies every verb.
//
// Beats dispatch the *real* ExplorerAction types against the *real*
// explorerReducer, and mutate the *real* FileStore. Nothing here fakes a state
// transition; the cursor only supplies a plausible cause for one.

import type { Dispatch } from "react";
import type { ExplorerAction, SeedEntry } from "./explorer/types";
import type { FileStore } from "./explorer/store/types";

// --- Seed ------------------------------------------------------------------

/**
 * A real SVG image, generated rather than shipped. `weight` inflates the byte
 * count with decorative circles so the Size sort in beat 04 visibly reshuffles
 * — files cut from one template all weigh the same, and a sort that changes
 * nothing reads as a broken sort.
 */
function svgImage(hue: number, label: string, weight: number): Blob {
	const decor = Array.from({ length: weight }, (_, i) => {
		const r = 30 + ((i * 37) % 110);
		const cx = 24 + ((i * 91) % 430);
		const cy = 32 + ((i * 57) % 410);
		const alpha = (0.05 + (i % 5) * 0.035).toFixed(3);
		return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(255,255,255,${alpha})"/>`;
	}).join("");

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hue} 68% 60%)"/>
    <stop offset="1" stop-color="hsl(${(hue + 48) % 360} 66% 42%)"/>
  </linearGradient></defs>
  <rect width="480" height="480" fill="url(#g)"/>${decor}
  <circle cx="360" cy="130" r="72" fill="rgba(255,255,255,0.28)"/>
  <text x="28" y="452" font-family="monospace" font-size="30" fill="rgba(255,255,255,0.9)">${label}</text>
</svg>`;
	return new Blob([svg], { type: "image/svg+xml" });
}

function textFile(body: string, mime = "text/plain"): Blob {
	return new Blob([body], { type: mime });
}

/** The file dropped in during beat 08. Built on demand — it must not exist at seed. */
export function captureBlob(): Blob {
	return svgImage(150, "capture", 22);
}

/**
 * 14 root entries, three of them folders — enough to fill roughly two grid rows
 * at the desktop frame width so the content pane never reads as half-empty.
 *
 * Built at module scope: this module is only ever reached through a
 * `dynamic(..., { ssr: false })` import, so Blob is available and the reference
 * stays stable across renders.
 */
export const SEED: SeedEntry[] = [
	// Folders (seeded with contents so navigating into one isn't a lonely room).
	{ path: "Documents/readme.md", blob: textFile("# Documents\n\nEverything here lives on your device.\n", "text/markdown") },
	{ path: "Documents/spec.md", blob: textFile("# Spec\n\n- store is pluggable\n- OPFS first, IndexedDB second\n", "text/markdown") },
	{ path: "Documents/notes/todo.txt", blob: textFile("- rename me (F2)\n- delete me, then undo\n") },
	// Images/ is where beats 06-09 play out — roughly 40% of the loop — so it
	// carries enough to fill two grid rows once ocean.svg lands in it. Three
	// files here left the pane visibly empty for a third of every cycle.
	{ path: "Images/aurora.svg", blob: svgImage(268, "aurora", 14) },
	{ path: "Images/basalt.svg", blob: svgImage(210, "basalt", 6) },
	{ path: "Images/cobalt.svg", blob: svgImage(224, "cobalt", 30) },
	{ path: "Images/drift.svg", blob: svgImage(186, "drift", 21) },
	{ path: "Images/ember.svg", blob: svgImage(14, "ember", 8) },
	{ path: "Images/fjord.svg", blob: svgImage(196, "fjord", 37) },
	{ path: "Images/glacier.svg", blob: svgImage(178, "glacier", 12) },
	{ path: "Images/harbor.svg", blob: svgImage(232, "harbor", 26) },
	{ path: "Images/indigo.svg", blob: svgImage(252, "indigo", 5) },
	{ path: "Images/kelp.svg", blob: svgImage(150, "kelp", 17) },
	{ path: "Images/lumen.svg", blob: svgImage(48, "lumen", 11) },
	{ path: "Images/marsh.svg", blob: svgImage(104, "marsh", 33) },
	{ path: "Images/nimbus.svg", blob: svgImage(206, "nimbus", 7) },
	{ path: "Images/onyx.svg", blob: svgImage(280, "onyx", 24) },
	{ path: "Images/quarry.svg", blob: svgImage(36, "quarry", 15) },
	{ path: "Images/slate.svg", blob: svgImage(214, "slate", 29) },
	{ path: "Renders/frame-a.svg", blob: svgImage(18, "frame-a", 9) },
	{ path: "Renders/frame-b.svg", blob: svgImage(42, "frame-b", 25) },

	// Root files. Weights are deliberately scattered so Size sorts visibly.
	//
	// Count matters: the desktop pane fits three rows of eight, and a root that
	// only fills two leaves the frame visibly hollow. No name here may contain
	// "render" — beat 03 types exactly that and the filter down to three hits is
	// the whole point of the beat.
	{ path: "ocean.svg", blob: svgImage(200, "ocean", 11) },
	{ path: "atlas.svg", blob: svgImage(160, "atlas", 23) },
	{ path: "cinder.svg", blob: svgImage(8, "cinder", 6) },
	{ path: "dune.svg", blob: svgImage(44, "dune", 31) },
	{ path: "flint.svg", blob: svgImage(220, "flint", 13) },
	{ path: "gulf.svg", blob: svgImage(192, "gulf", 39) },
	{ path: "halo.svg", blob: svgImage(300, "halo", 9) },
	{ path: "jetty.svg", blob: svgImage(172, "jetty", 20) },
	{ path: "lagoon.svg", blob: svgImage(168, "lagoon", 28) },
	{ path: "styles.css", blob: textFile("main { color: #a855f7; }\n", "text/css") },
	{ path: "tokens.json", blob: textFile('{\n  "accent": "#a855f7"\n}\n', "application/json") },
	{ path: "sunrise.svg", blob: svgImage(28, "sunrise", 34) },
	{ path: "orchid.svg", blob: svgImage(288, "orchid", 4) },
	{ path: "dusk.svg", blob: svgImage(322, "dusk", 19) },
	{ path: "palette.svg", blob: svgImage(96, "palette", 42) },
	{ path: "render-01.svg", blob: svgImage(340, "render-01", 2) },
	{ path: "render-02.svg", blob: svgImage(356, "render-02", 27) },
	{ path: "brief.md", blob: textFile("# Brief\n\nThree panes. Real bytes. No server.\n", "text/markdown") },
	{ path: "notes.txt", blob: textFile("Drop an image anywhere to upload it.\nIt survives a reload.\n") },
	{ path: "changelog.md", blob: textFile("## 1.2.0\n- resizable panes\n- undo window\n\n## 1.1.0\n- folder rail\n", "text/markdown") },
	{ path: "config.json", blob: textFile('{\n  "view": "grid",\n  "sort": "name",\n  "undoWindowMs": 5000\n}\n', "application/json") },
];

// --- Capability surface ----------------------------------------------------

/**
 * Where the synthetic cursor should travel. Resolved against the live DOM by
 * the driver, so a beat never hardcodes a pixel.
 *
 * `node` and `railName` exist because index-into-a-NodeList is brittle: the
 * content pane's order comes from sortNodes/filterNodes and shifts under a
 * search or a sort flip, and the folder rail's order comes from whatever the
 * store adapter returns.
 */
export type Target =
	/** nth match of a CSS selector inside the reel root (default: first). */
	| { sel: string; nth?: number }
	/** A store path — resolved to its tile or row via the driver's own row order. */
	| { node: string }
	/** A folder-rail row, matched on its visible label. */
	| { railName: string }
	/** A fraction of the reel root's box — for gestures with no element to aim at. */
	| { fx: number; fy: number };

export interface ReelApi {
	dispatch: Dispatch<ExplorerAction>;
	store: FileStore;
	/** Re-read the current directory after a store mutation. */
	reload: () => void;

	showCursor: () => void;
	hideCursor: () => void;
	moveTo: (target: Target, ms?: number) => Promise<void>;
	click: () => Promise<void>;
	doubleClick: () => Promise<void>;
	/** Press, travel with a labelled ghost in tow, release. Rings the drop target. */
	dragTo: (target: Target, opts: { ghost: string; ms?: number }) => Promise<void>;
	/** Types into the real, controlled search input by dispatching SET_SEARCH per char. */
	typeSearch: (text: string, msPerChar?: number) => Promise<void>;

	/**
	 * Declare the store fully seeded. Until this fires the shell renders its
	 * skeleton, because useDirectory's first listing otherwise races the seed
	 * writes and paints a partial root.
	 */
	markSeeded: () => void;

	/** The full-surface "Drop files to upload" wash. */
	setDropOverlay: (on: boolean) => void;
	/** Optimistic delete + UndoSnackbar, mirroring FileExplorer's deferred delete. */
	requestDelete: (paths: string[], label: string) => void;
	undoDelete: () => void;

	wait: (ms: number) => Promise<void>;
}

export interface Beat {
	id: string;
	/** Placard copy. Empty string hides the placard (used for the loop seam). */
	placard: string;
	/** Nominal duration. The driver holds the beat for at least this long. */
	ms: number;
	run: (api: ReelApi) => Promise<void>;
}

// --- Selectors -------------------------------------------------------------
// Only `data-reel="…"` hooks belong to the reel's own shell markup. Everything
// else is a semantic attribute the product already ships (aria-label, role) —
// no registry file was edited to make this work.

const SEARCH_INPUT = '[data-reel="toolbar"] input';
const GRID_BUTTON = 'button[aria-label="Grid view"]';
const LIST_BUTTON = 'button[aria-label="List view"]';
/** FileList renders exactly three buttons — the Name / Size / Modified headers. */
const SIZE_HEADER = { sel: '[data-reel="content"] button', nth: 1 } as const;
const UNDO_BUTTON = '[role="status"] button';

// --- The nine beats --------------------------------------------------------

export const BEATS: Beat[] = [
	{
		id: "select",
		placard: "Click to select",
		ms: 1800,
		async run(api) {
			api.showCursor();
			await api.moveTo({ node: "ocean.svg" }, 750);
			await api.click();
			api.dispatch({ type: "SELECT", path: "ocean.svg", mode: "single", ordered: [] });
			await api.wait(400);
		},
	},
	{
		id: "detail",
		placard: "Double-click · live preview panel",
		ms: 3200,
		async run(api) {
			await api.wait(220);
			await api.doubleClick();
			api.dispatch({ type: "OPEN_DETAIL", path: "ocean.svg" });
			// The panel opening narrows the content pane, so every tile shifts.
			// Drifting the cursor onto the panel both hides that and leads the eye.
			await api.wait(650);
			await api.moveTo({ sel: '[data-reel="detail"]' }, 900);
			await api.wait(500);
		},
	},
	{
		id: "search",
		placard: "Search filters as you type",
		ms: 3000,
		async run(api) {
			// Toolbar swaps to the bulk-action bar whenever anything is selected —
			// the search field literally does not exist until the selection clears.
			api.dispatch({ type: "CLOSE_DETAIL" });
			api.dispatch({ type: "CLEAR_SELECTION" });
			await api.wait(280);
			await api.moveTo({ sel: SEARCH_INPUT }, 620);
			await api.click();
			await api.typeSearch("render", 150);
			await api.wait(900);
		},
	},
	{
		id: "view-sort",
		placard: "Grid ⇄ list · click a column to sort",
		ms: 3900,
		async run(api) {
			api.dispatch({ type: "SET_SEARCH", search: "" });
			await api.wait(260);
			await api.moveTo({ sel: LIST_BUTTON }, 560);
			await api.click();
			api.dispatch({ type: "SET_VIEW", view: "list" });
			await api.wait(520);
			// Toolbar's SortMenu keeps its open state private, so the sort is driven
			// from FileList's column headers — whose onSort the reel does own.
			await api.moveTo(SIZE_HEADER, 620);
			await api.click();
			api.dispatch({ type: "TOGGLE_SORT", sortBy: "size" });
			await api.wait(700);
			await api.click();
			api.dispatch({ type: "TOGGLE_SORT", sortBy: "size" });
			await api.wait(480);
		},
	},
	{
		id: "drag-move",
		placard: "Drag onto a folder → move",
		ms: 3800,
		async run(api) {
			await api.moveTo({ sel: GRID_BUTTON }, 520);
			await api.click();
			api.dispatch({ type: "SET_VIEW", view: "grid" });
			api.dispatch({ type: "SET_SORT", sortBy: "name", sortDir: "asc" });
			await api.wait(460);
			await api.moveTo({ node: "ocean.svg" }, 620);
			await api.dragTo({ node: "Images" }, { ghost: "ocean.svg", ms: 950 });
			await api.store.move("ocean.svg", "Images/ocean.svg");
			api.reload();
			await api.wait(600);
		},
	},
	{
		id: "rail",
		placard: "Folder rail · breadcrumb",
		ms: 2200,
		async run(api) {
			await api.moveTo({ railName: "Images" }, 720);
			await api.click();
			api.dispatch({ type: "NAVIGATE", path: "Images" });
			await api.wait(950);
		},
	},
	{
		id: "rename",
		placard: "F2 · inline rename",
		ms: 3200,
		async run(api) {
			await api.moveTo({ node: "Images/ocean.svg" }, 700);
			await api.click();
			api.dispatch({ type: "SELECT", path: "Images/ocean.svg", mode: "single", ordered: [] });
			await api.wait(430);
			// InlineRename is a controlled input owning its own draft state — it
			// can't be typed into by dispatch, and driving it through the DOM would
			// mean synthetic events. So the reel shows the real rename affordance,
			// then commits through the store the way a keystroke would have.
			api.dispatch({ type: "BEGIN_RENAME", path: "Images/ocean.svg" });
			await api.wait(1150);
			const moved = await api.store.rename("Images/ocean.svg", "reef.svg");
			api.dispatch({ type: "END_RENAME" });
			api.dispatch({ type: "SET_SELECTION", paths: [moved.path] });
			api.reload();
			await api.wait(480);
		},
	},
	{
		id: "upload",
		placard: "Drop files to upload",
		ms: 3000,
		async run(api) {
			api.dispatch({ type: "CLEAR_SELECTION" });
			await api.moveTo({ fx: 0.78, fy: 0.16 }, 480);
			api.setDropOverlay(true);
			await api.dragTo({ fx: 0.5, fy: 0.55 }, { ghost: "capture.svg", ms: 900 });
			api.setDropOverlay(false);
			await api.store.write("Images/capture.svg", captureBlob(), "image/svg+xml");
			api.reload();
			await api.wait(700);
		},
	},
	{
		id: "delete-undo",
		placard: "Delete → undo",
		ms: 4400,
		async run(api) {
			await api.moveTo({ node: "Images/capture.svg" }, 680);
			await api.click();
			api.dispatch({ type: "SELECT", path: "Images/capture.svg", mode: "single", ordered: [] });
			await api.wait(420);
			api.requestDelete(["Images/capture.svg"], "Deleted capture.svg");
			await api.wait(1400);
			await api.moveTo({ sel: UNDO_BUTTON }, 620);
			await api.click();
			api.undoDelete();
			await api.wait(700);
		},
	},
	{
		id: "reset",
		placard: "",
		ms: 1200,
		async run(api) {
			api.hideCursor();
			// The seam, and the ordering here is the whole trick.
			//
			// Restore FIRST, while the view is still pointed at Images/. Nothing
			// re-reads during it — no dir change, no revision bump — so the last
			// frame stays painted over a store being rewritten underneath it.
			// Only then navigate: useDirectory re-lists on the dir change, and the
			// first listing it can possibly get is the finished one.
			//
			// Navigating first instead races the writes and paints a partial root
			// (measured: 5 of 14 tiles), which is exactly the discontinuity the
			// seam exists to hide.
			await restoreSeed(api.store);
			api.markSeeded();
			api.dispatch({ type: "NAVIGATE", path: "" });
			api.reload();
			await api.wait(250);
		},
	},
];

/** Distinct top-level entries SEED produces — the shape a restored root must have. */
const ROOT_COUNT = new Set(SEED.map((entry) => entry.path.split("/")[0])).size;

/** Restore the store to exactly SEED. The on-mount build, and the fallback. */
export async function wipeAndSeed(store: FileStore): Promise<void> {
	for (const node of await store.list("")) await store.remove(node.path);
	for (const entry of SEED) {
		if (entry.blob) await store.write(entry.path, entry.blob, entry.blob.type);
		else await store.mkdir(entry.path);
	}
}

/**
 * Undo exactly what one pass of the loop mutates: the move (05), the rename
 * (07) and the upload (08). Beat 09 always undoes its own delete.
 *
 * Two store operations instead of rewriting all ~45 files. That matters because
 * the seam is a beat the viewer sits through — a full wipe-and-rewrite grew to
 * roughly three seconds of held frame, which reads as the reel having died.
 *
 * Any deviation from the expected shape — a beat that skipped because its
 * target had gone, a half-applied pass — falls back to the full reseed rather
 * than trying to reason about it.
 */
export async function restoreSeed(store: FileStore): Promise<void> {
	try {
		const images = new Set((await store.list("Images")).map((n) => n.name));
		if (images.has("capture.svg")) await store.remove("Images/capture.svg");
		if (images.has("reef.svg")) await store.move("Images/reef.svg", "ocean.svg");
		else if (images.has("ocean.svg")) await store.move("Images/ocean.svg", "ocean.svg");

		const root = await store.list("");
		if (root.length !== ROOT_COUNT) await wipeAndSeed(store);
	} catch {
		await wipeAndSeed(store);
	}
}

/**
 * The frame shown to anyone who asked for reduced motion: no timers, no cursor,
 * no travel — one composed still that still carries thumbnails, a selection, an
 * open preview panel, an expanded rail and a populated meter.
 */
export const STILL = {
	currentPath: "Images",
	selection: ["Images/aurora.svg"],
	detailPath: "Images/aurora.svg",
} as const;
