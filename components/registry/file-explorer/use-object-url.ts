"use client";
/* eslint-disable react-hooks/set-state-in-effect --
   These effects synchronize an external resource (object URLs / fetched blobs)
   into React state — the canonical, React-docs-blessed use of setState inside
   an effect. The set-state-in-effect heuristic over-flags it here. */

// Blob-URL lifecycle, centralized. Every `URL.createObjectURL` must be paired
// with a `revokeObjectURL` or the page leaks memory for the tab's lifetime —
// with images and video in play, that adds up fast. Keeping the create/revoke
// in one hook is the whole defense: one URL per node per consumer, revoked on
// unmount or when the underlying blob changes.

import { useEffect, useState } from "react";
import type { FileNode, FileStore } from "./store/types";

/** Object URL for a blob, revoked automatically on change/unmount. */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
	const [url, setUrl] = useState<string | null>(null);
	useEffect(() => {
		if (!blob) {
			setUrl(null);
			return;
		}
		const next = URL.createObjectURL(blob);
		setUrl(next);
		return () => URL.revokeObjectURL(next);
	}, [blob]);
	return url;
}

/**
 * Read a file node from the store and expose a revocable object URL for it.
 * Reads only when `enabled` (so off-screen tiles don't fault their bytes in).
 * Re-reads when the node's path or mtime changes.
 */
export function useStoredObjectUrl(
	store: FileStore | null,
	node: FileNode | null | undefined,
	enabled = true,
): string | null {
	const [blob, setBlob] = useState<Blob | null>(null);
	const path = node?.path;
	const mtime = node?.mtime;
	const isFile = node?.kind === "file";

	useEffect(() => {
		let cancelled = false;
		if (!store || !enabled || !isFile || path == null) {
			setBlob(null);
			return;
		}
		store
			.read(path)
			.then((b) => {
				if (!cancelled) setBlob(b);
			})
			.catch(() => {
				if (!cancelled) setBlob(null);
			});
		return () => {
			cancelled = true;
		};
		// mtime participates so a re-written file refreshes its preview.
	}, [store, path, mtime, isFile, enabled]);

	return useObjectUrl(blob);
}
