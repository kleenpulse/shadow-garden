"use client";
/* eslint-disable react-hooks/set-state-in-effect --
   These hooks fetch from the async FileStore and reflect loading/results in
   state — legitimate effect-driven synchronization with an external system. */

// Binds the async FileStore to React. Three hooks:
//   useFileStore       — resolve + init the backend once (the ready-gate).
//   useDirectory       — live listing of one directory, re-fetched on `revision`.
//   useStorageEstimate — quota/usage for the storage meter.
//
// Mutations don't live here — the component calls store methods directly and
// then bumps `revision` via reload() to re-read. That keeps this hook a thin,
// predictable data layer.

import { useCallback, useEffect, useRef, useState } from "react";
import { createFileStore } from "./store";
import type {
	FileNode,
	FileStore,
	FileStoreBackend,
	StorageEstimate,
	StorePath,
} from "./store/types";

/** A ready-made FileStore, or a factory that produces one. */
export type StoreSource = FileStore | (() => Promise<FileStore>);

export interface UseFileStoreResult {
	store: FileStore | null;
	/** False until the backend has opened (or failed) — drives the skeleton. */
	ready: boolean;
	backend: FileStoreBackend | null;
	error: Error | null;
	/** Monotonic counter; bump via reload() to force re-reads after a mutation. */
	revision: number;
	reload: () => void;
}

/**
 * Resolve and initialize the FileStore exactly once for this mount.
 *
 * `source` may be a concrete FileStore, a factory, or undefined (→ auto-select
 * via createFileStore(namespace)). It's captured on mount; swapping it live is
 * intentionally a non-goal for the showcase, which keeps the ready-gate simple.
 */
export function useFileStore(
	source: StoreSource | undefined,
	namespace: string,
): UseFileStoreResult {
	const [store, setStore] = useState<FileStore | null>(null);
	const [ready, setReady] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [revision, setRevision] = useState(0);

	// Capture inputs so the boot effect can run once without re-firing on every
	// parent render (a Preview passing an inline factory changes identity often).
	const sourceRef = useRef(source);
	const namespaceRef = useRef(namespace);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const src = sourceRef.current;
				const resolved =
					typeof src === "function"
						? await src()
						: (src ?? (await createFileStore(namespaceRef.current)));
				await resolved.init();
				if (cancelled) return;
				setStore(resolved);
				setReady(true);
			} catch (e) {
				if (cancelled) return;
				// Surface the failure and lift the gate so the UI shows an error
				// state rather than an endless skeleton.
				setError(e instanceof Error ? e : new Error(String(e)));
				setReady(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	// Stable so downstream mutation callbacks don't churn identity every render.
	const reload = useCallback(() => setRevision((r) => r + 1), []);

	return {
		store,
		ready,
		backend: store?.backend ?? null,
		error,
		revision,
		reload,
	};
}

/** Live listing of one directory. Re-fetches whenever `dir` or `revision` change. */
export function useDirectory(
	store: FileStore | null,
	dir: StorePath,
	revision: number,
): { entries: FileNode[]; loading: boolean } {
	const [entries, setEntries] = useState<FileNode[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		if (!store) {
			setEntries([]);
			setLoading(true);
			return;
		}
		setLoading(true);
		store
			.list(dir)
			.then((list) => {
				if (cancelled) return;
				setEntries(list);
				setLoading(false);
			})
			.catch(() => {
				if (cancelled) return;
				setEntries([]);
				setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [store, dir, revision]);

	return { entries, loading };
}

/** Quota/usage snapshot for the storage meter. Re-reads on `revision`. */
export function useStorageEstimate(
	store: FileStore | null,
	revision: number,
): StorageEstimate | null {
	const [estimate, setEstimate] = useState<StorageEstimate | null>(null);

	useEffect(() => {
		let cancelled = false;
		if (!store) {
			setEstimate(null);
			return;
		}
		store
			.estimate()
			.then((e) => {
				if (!cancelled) setEstimate(e);
			})
			.catch(() => {
				/* estimate is best-effort */
			});
		return () => {
			cancelled = true;
		};
	}, [store, revision]);

	return estimate;
}
