// Public entry point for the persistence layer.
//
// `createFileStore` picks the strongest backend the current browser offers:
//   OPFS (real file system) → IndexedDB (universal) → memory (last resort).
// A consumer who wants a different backend (S3, a REST API, a mock) implements
// the `FileStore` interface from ./types and passes it to <FileExplorer store>
// directly — they never need this selector.

import { IndexedDbFileStore } from "./idb-store";
import { MemoryFileStore } from "./memory-store";
import { OpfsFileStore } from "./opfs-store";
import type { FileStore } from "./types";

export * from "./types";
export { OpfsFileStore } from "./opfs-store";
export { IndexedDbFileStore } from "./idb-store";
export { MemoryFileStore } from "./memory-store";

/**
 * Create and initialize the best available FileStore for this environment.
 *
 * @param namespace Isolates this explorer's data — the OPFS root directory name
 *   and the IndexedDB database name. Give separate explorers separate
 *   namespaces to keep their trees apart.
 */
export async function createFileStore(namespace: string): Promise<FileStore> {
	if (
		typeof navigator !== "undefined" &&
		navigator.storage &&
		typeof navigator.storage.getDirectory === "function"
	) {
		try {
			const store = new OpfsFileStore(namespace);
			await store.init();
			return store;
		} catch {
			// OPFS present but blocked (e.g. Safari private mode) — fall through.
		}
	}

	if (typeof indexedDB !== "undefined") {
		try {
			const store = new IndexedDbFileStore(namespace);
			await store.init();
			return store;
		} catch {
			// IndexedDB blocked — fall through to memory.
		}
	}

	const store = new MemoryFileStore();
	await store.init();
	return store;
}
