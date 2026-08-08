"use client";

// The δ reel's projector. Owns every piece of reel state — the explorer reducer,
// the deferred-delete overlay, the drop wash, the synthetic cursor — so
// ReelShell can stay a pure renderer.
//
// State transitions are the product's own: explorerReducer, filterNodes and
// sortNodes are imported from the shipped component, and the store is the real
// OPFS → IndexedDB → memory ladder on its own namespace. The beats supply
// causes; nothing here reimplements an effect.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { RefObject } from "react";
import { animate, useMotionValue, type MotionValue } from "motion/react";
import type {
	FileNode,
	FileStore,
	FileStoreBackend,
	StorageEstimate,
} from "@/components/registry/file-explorer/store/types";
import { parentPath } from "@/components/registry/file-explorer/store/types";
import {
	explorerReducer,
	filterNodes,
	initExplorerState,
	sortNodes,
} from "@/components/registry/file-explorer/use-file-explorer";
import {
	useDirectory,
	useFileStore,
	useStorageEstimate,
} from "@/components/registry/file-explorer/use-file-store";
import type { ExplorerState, Row } from "@/components/registry/file-explorer/types";
import { BEATS, STILL, type Beat, type ReelApi, type Target, wipeAndSeed } from "./script";

/** Isolated from the workspace's `sg-file-explorer` — a visitor's own uploads are never touched. */
export const REEL_NAMESPACE = "sg-landing-reel";

/**
 * Short on purpose. The script clicks Undo ~1.4s in, and a 5s window would
 * leave the countdown bar barely moved — the urgency is the whole point of the
 * beat. No commit timer is armed: the reel always undoes, and the loop seam
 * reseeds regardless.
 */
export const REEL_UNDO_WINDOW_MS = 2600;

/** Running the reset beat first is what makes every (re)start identical. */
const RESET_INDEX = BEATS.length - 1;

const CURSOR_EASE = [0.33, 0, 0.15, 1] as const;

/** Unwinds a beat mid-await when its run is superseded. Never surfaces. */
const HALT = Symbol("reel-halt");

interface PendingDelete {
	paths: string[];
	label: string;
}

export interface ReelRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface ReelTimeline {
	ready: boolean;
	store: FileStore | null;
	backend: FileStoreBackend | null;
	estimate: StorageEstimate | null;
	revision: number;

	state: ExplorerState;
	rows: Row[];
	detailNode: FileNode | null;
	itemCount: number;

	pendingDelete: PendingDelete | null;
	dropOverlay: boolean;
	/** True while a directory listing is in flight or stale — suppresses the empty state. */
	listPending: boolean;

	/** Null under reduced motion — the still frame carries no placard beat. */
	beat: Beat | null;
	beatNumber: number;
	/** 0 → 1 across the current beat, for the placard's progress bar. */
	progress: MotionValue<number>;

	cursor: {
		x: MotionValue<number>;
		y: MotionValue<number>;
		visible: boolean;
		pressed: boolean;
		ghost: string | null;
		ring: ReelRect | null;
		pulseKey: number;
	};
}

export function useReelTimeline({
	rootRef,
	playing,
	reducedMotion,
}: {
	rootRef: RefObject<HTMLDivElement | null>;
	/** In view, motion allowed, not hovered, not taken over. */
	playing: boolean;
	reducedMotion: boolean;
}): ReelTimeline {
	const { store, ready, backend, revision, reload } = useFileStore(
		undefined,
		REEL_NAMESPACE,
	);
	const [state, dispatch] = useReducer(
		explorerReducer,
		{ defaultView: "grid" as const },
		initExplorerState,
	);
	const { entries, loading } = useDirectory(store, state.currentPath, revision);
	const estimate = useStorageEstimate(store, revision);

	const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
	const [dropOverlay, setDropOverlay] = useState(false);
	const [beatIndex, setBeatIndex] = useState(RESET_INDEX);
	// Gates the shell's skeleton. Latched once: later loop seams reseed behind an
	// already-painted frame, so only the very first paint needs holding.
	const [seeded, setSeeded] = useState(false);

	const [visible, setVisible] = useState(false);
	const [pressed, setPressed] = useState(false);
	const [ghost, setGhost] = useState<string | null>(null);
	const [ring, setRing] = useState<ReelRect | null>(null);
	const [pulseKey, setPulseKey] = useState(0);

	const cx = useMotionValue(0);
	const cy = useMotionValue(0);
	const progress = useMotionValue(0);

	// --- Derived view (mirrors FileExplorer's own memos) --------------------
	const displayed = useMemo(() => {
		// useDirectory holds the PREVIOUS directory's entries while it refetches,
		// so for one frame after a navigate the breadcrumb reads Home while the
		// grid still shows the folder just left (measured at the loop seam: crumb
		// at root, 12 Images/ tiles under it). Dropping anything whose parent is
		// not the current path makes that frame empty instead of wrong.
		let list = entries.filter((n) => parentPath(n.path) === state.currentPath);
		if (pendingDelete) {
			const hidden = new Set(pendingDelete.paths);
			list = list.filter((n) => !hidden.has(n.path));
		}
		return sortNodes(filterNodes(list, state.search, false), state.sortBy, state.sortDir);
	}, [entries, pendingDelete, state.currentPath, state.search, state.sortBy, state.sortDir]);

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

	// useDirectory only raises `loading` inside an effect, so the very first
	// render after a navigate still reports loading=false while holding the old
	// directory's entries — long enough to flash "This folder is empty" once the
	// parent filter above drops them. Detecting the stale set directly closes
	// that frame.
	const listPending = useMemo(
		() =>
			loading ||
			(entries.length > 0 &&
				entries.every((n) => parentPath(n.path) !== state.currentPath)),
		[loading, entries, state.currentPath],
	);

	const detailNode: FileNode | null = useMemo(() => {
		if (!state.detailPath) return null;
		const found = displayed.find((n) => n.path === state.detailPath);
		return found && found.kind === "file" ? found : null;
	}, [state.detailPath, displayed]);

	// Beats resolve targets against the live listing, which changes every render
	// — a ref keeps the api's identity stable without stale reads.
	const rowsRef = useRef(rows);
	rowsRef.current = rows;

	// --- Target resolution --------------------------------------------------
	const resolveRect = useCallback(
		(target: Target): ReelRect | null => {
			const root = rootRef.current;
			if (!root) return null;
			const rb = root.getBoundingClientRect();

			if ("fx" in target) {
				return { x: rb.width * target.fx, y: rb.height * target.fy, w: 0, h: 0 };
			}

			let el: Element | null = null;
			if ("sel" in target) {
				el = root.querySelectorAll(target.sel)[target.nth ?? 0] ?? null;
			} else if ("node" in target) {
				// Index into the live row order rather than guessing a collation —
				// a search or a sort flip reshuffles the DOM under us.
				const idx = rowsRef.current.findIndex((r) => r.node.path === target.node);
				if (idx < 0) return null;
				el = root.querySelectorAll('[data-reel="content"] [role="option"]')[idx] ?? null;
			} else {
				// The rail's chevron carries an aria-label; the navigate button doesn't.
				const buttons = root.querySelectorAll('[data-reel="rail"] button:not([aria-label])');
				el =
					Array.from(buttons).find((b) => b.textContent?.trim() === target.railName) ??
					null;
			}
			if (!el) return null;

			const b = el.getBoundingClientRect();
			return { x: b.left - rb.left, y: b.top - rb.top, w: b.width, h: b.height };
		},
		[rootRef],
	);

	// --- The projector ------------------------------------------------------
	const runIdRef = useRef(0);

	useEffect(() => {
		if (!ready || !store || reducedMotion || !playing) return;

		const token = ++runIdRef.current;
		const halted = () => runIdRef.current !== token;

		const timers = new Set<ReturnType<typeof setTimeout>>();
		const running = new Set<{ stop: () => void }>();

		// Cooperative cancellation: every sleep RESOLVES, and the halt check is an
		// explicit throw afterwards. A rejecting timer would land as an unhandled
		// rejection the moment a beat unwound ahead of it.
		const sleep = (ms: number) =>
			new Promise<void>((resolve) => {
				const id = setTimeout(() => {
					timers.delete(id);
					resolve();
				}, ms);
				timers.add(id);
			});

		const step = async (ms: number) => {
			await sleep(ms);
			if (halted()) throw HALT;
		};

		const centerOf = (r: ReelRect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

		const travel = async (to: { x: number; y: number }, ms: number) => {
			const opts = { duration: ms / 1000, ease: CURSOR_EASE };
			const ax = animate(cx, to.x, opts);
			const ay = animate(cy, to.y, opts);
			running.add(ax);
			running.add(ay);
			await Promise.all([ax.finished, ay.finished]).catch(() => {});
			running.delete(ax);
			running.delete(ay);
			if (halted()) throw HALT;
		};

		const doClick = async () => {
			setPulseKey((k) => k + 1);
			setPressed(true);
			await step(90);
			setPressed(false);
			await step(130);
		};

		const api: ReelApi = {
			dispatch,
			store,
			reload,

			showCursor: () => setVisible(true),
			hideCursor: () => setVisible(false),

			async moveTo(target, ms = 600) {
				const rect = resolveRect(target);
				// A target that no longer exists is skipped, never stalled on — a
				// dropped beat is survivable, a wedged loop is not.
				if (!rect) return;
				await travel(centerOf(rect), ms);
			},

			click: doClick,

			async doubleClick() {
				await doClick();
				await step(60);
				await doClick();
			},

			async dragTo(target, { ghost: label, ms = 900 }) {
				const rect = resolveRect(target);
				if (!rect) return;
				setPressed(true);
				setGhost(label);
				await step(140);
				if (rect.w > 0) setRing(rect);
				await travel(centerOf(rect), ms);
				await step(200);
				setPressed(false);
				setGhost(null);
				setRing(null);
			},

			async typeSearch(text, msPerChar = 150) {
				for (let i = 1; i <= text.length; i += 1) {
					dispatch({ type: "SET_SEARCH", search: text.slice(0, i) });
					await step(msPerChar);
				}
			},

			markSeeded: () => setSeeded(true),
			setDropOverlay,
			requestDelete: (paths, label) => {
				dispatch({ type: "CLEAR_SELECTION" });
				setPendingDelete({ paths, label });
			},
			undoDelete: () => setPendingDelete(null),

			wait: step,
		};

		void (async () => {
			try {
				setPendingDelete(null);
				setDropOverlay(false);
				setGhost(null);
				setRing(null);

				// Start on the reset beat so every entry — first mount, scroll back
				// in, pointer-leave after a hover — begins from the identical frame.
				let i = RESET_INDEX;
				for (;;) {
					if (halted()) return;
					const beat = BEATS[i];
					setBeatIndex(i);
					progress.set(0);
					const bar = animate(progress, 1, {
						duration: beat.ms / 1000,
						ease: "linear",
					});
					running.add(bar);

					// Sequential, not Promise.all: a rejected run arm would leave the
					// duration arm pending and rejecting into nobody's hands.
					const startedAt = performance.now();
					await beat.run(api);
					const remaining = beat.ms - (performance.now() - startedAt);
					if (remaining > 0) await step(remaining);

					bar.stop();
					running.delete(bar);
					i = (i + 1) % BEATS.length;
				}
			} catch (err) {
				if (err !== HALT) throw err;
			}
		})();

		return () => {
			runIdRef.current += 1;
			for (const id of timers) clearTimeout(id);
			timers.clear();
			for (const anim of running) anim.stop();
			running.clear();
		};
	}, [ready, store, playing, reducedMotion, reload, resolveRect, cx, cy, progress]);

	// --- Reduced motion: one composed still, no timers, no cursor -----------
	useEffect(() => {
		if (!ready || !store || !reducedMotion) return;
		let cancelled = false;
		void (async () => {
			await wipeAndSeed(store);
			if (cancelled) return;
			setSeeded(true);
			reload();
			dispatch({ type: "NAVIGATE", path: STILL.currentPath });
			dispatch({ type: "SET_SELECTION", paths: [...STILL.selection] });
			dispatch({ type: "OPEN_DETAIL", path: STILL.detailPath });
			setVisible(false);
		})();
		return () => {
			cancelled = true;
		};
	}, [ready, store, reducedMotion, reload]);

	return {
		ready: ready && seeded,
		store,
		backend,
		estimate,
		revision,
		state,
		rows,
		detailNode,
		itemCount: displayed.length,
		pendingDelete,
		dropOverlay,
		listPending,
		beat: reducedMotion ? null : (BEATS[beatIndex] ?? null),
		beatNumber: beatIndex + 1,
		progress,
		cursor: { x: cx, y: cy, visible, pressed, ghost, ring, pulseKey },
	};
}
