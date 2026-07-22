// OpfsFileStore — the primary backend. The Origin Private File System
// (`navigator.storage.getDirectory()`) is a real, persistent, sandboxed file
// system with genuine nested directories, so the explorer's tree maps onto it
// 1:1 with no bookkeeping. It holds large blobs (video, images) via streaming
// writes, needs no permission prompts, and is available in Chrome 102+,
// Firefox 111+, and Safari 15.2+.
//
// Everything is namespaced under a single subdirectory so the store never
// collides with a host app's own OPFS usage.
//
// The one rough edge is `move`: OPFS has no portable atomic move. We use the
// native `handle.move()` when present (Chromium), and otherwise fall back to a
// recursive copy-then-delete that only removes the source AFTER the copy fully
// succeeds — non-atomic, but it can never lose data (worst case leaves a
// complete copy plus an intact source).

import {
	baseName,
	guessMime,
	parentPath,
	segments,
	type FileNode,
	type FileStore,
	type FileStoreBackend,
	type StorageEstimate,
	type StorePath,
} from "./types";

// Minimal structural types so this compiles regardless of how complete the
// ambient lib.dom OPFS definitions are in the host's TypeScript version.
type DirHandle = FileSystemDirectoryHandle & {
	entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};
type MovableHandle = FileSystemHandle & {
	move?: (
		dest?: FileSystemDirectoryHandle | string,
		name?: string,
	) => Promise<void>;
};

function supportsNativeMove(handle: FileSystemHandle): handle is MovableHandle {
	return typeof (handle as MovableHandle).move === "function";
}

export class OpfsFileStore implements FileStore {
	readonly backend: FileStoreBackend = "opfs";
	private root: FileSystemDirectoryHandle | null = null;
	private opening: Promise<void> | null = null;

	constructor(private readonly namespace: string) {}

	init(): Promise<void> {
		if (this.root) return Promise.resolve();
		// Memoize the in-flight open so a StrictMode double-mount can't race two
		// getDirectoryHandle({create:true}) calls into a conflict.
		if (this.opening) return this.opening;
		this.opening = (async () => {
			const base = await navigator.storage.getDirectory();
			this.root = await base.getDirectoryHandle(this.namespace, {
				create: true,
			});
		})();
		return this.opening;
	}

	private get base(): FileSystemDirectoryHandle {
		if (!this.root) throw new Error("OpfsFileStore: init() not awaited");
		return this.root;
	}

	/** Walk to the directory handle at `path`, optionally creating segments. */
	private async dirAt(
		path: StorePath,
		create: boolean,
	): Promise<FileSystemDirectoryHandle> {
		let handle = this.base;
		for (const seg of segments(path)) {
			handle = await handle.getDirectoryHandle(seg, { create });
		}
		return handle;
	}

	/** Resolve a path to its handle, or null if it doesn't exist. */
	private async handleAt(
		path: StorePath,
	): Promise<{ kind: "file" | "directory"; handle: FileSystemHandle } | null> {
		if (path === "") return { kind: "directory", handle: this.base };
		let parent: FileSystemDirectoryHandle;
		try {
			parent = await this.dirAt(parentPath(path), false);
		} catch {
			return null;
		}
		const name = baseName(path);
		try {
			const file = await parent.getFileHandle(name);
			return { kind: "file", handle: file };
		} catch {
			/* not a file — try directory */
		}
		try {
			const dir = await parent.getDirectoryHandle(name);
			return { kind: "directory", handle: dir };
		} catch {
			return null;
		}
	}

	private async fileNode(
		handle: FileSystemFileHandle,
		path: StorePath,
	): Promise<FileNode> {
		const file = await handle.getFile();
		return {
			name: baseName(path),
			path,
			kind: "file",
			size: file.size,
			mtime: file.lastModified,
			mime: file.type || guessMime(baseName(path)),
		};
	}

	async list(dir: StorePath = ""): Promise<FileNode[]> {
		const handle = (await this.dirAt(dir, false)) as DirHandle;
		const out: FileNode[] = [];
		for await (const [name, child] of handle.entries()) {
			const path = dir ? `${dir}/${name}` : name;
			if (child.kind === "file") {
				out.push(await this.fileNode(child as FileSystemFileHandle, path));
			} else {
				out.push({ name, path, kind: "directory", size: 0, mtime: 0 });
			}
		}
		return out;
	}

	async stat(path: StorePath): Promise<FileNode | null> {
		const found = await this.handleAt(path);
		if (!found) return null;
		if (found.kind === "file") {
			return this.fileNode(found.handle as FileSystemFileHandle, path);
		}
		return { name: baseName(path), path, kind: "directory", size: 0, mtime: 0 };
	}

	async read(path: StorePath): Promise<Blob> {
		const parent = await this.dirAt(parentPath(path), false);
		const handle = await parent.getFileHandle(baseName(path));
		return handle.getFile();
	}

	async write(path: StorePath, data: Blob, mime?: string): Promise<FileNode> {
		const parent = await this.dirAt(parentPath(path), true);
		const handle = await parent.getFileHandle(baseName(path), { create: true });
		// createWritable streams to disk without buffering the whole blob in
		// memory — safe for large videos. Never createSyncAccessHandle here
		// (Worker-only, exclusive-lock).
		const writable = await handle.createWritable();
		await writable.write(data);
		await writable.close();
		return {
			name: baseName(path),
			path,
			kind: "file",
			size: data.size,
			mtime: Date.now(),
			mime: mime || data.type || guessMime(baseName(path)),
		};
	}

	async mkdir(path: StorePath): Promise<FileNode> {
		await this.dirAt(path, true);
		return { name: baseName(path), path, kind: "directory", size: 0, mtime: 0 };
	}

	async remove(path: StorePath): Promise<void> {
		if (path === "") return;
		const parent = await this.dirAt(parentPath(path), false);
		try {
			await parent.removeEntry(baseName(path), { recursive: true });
		} catch {
			/* already gone — no-op */
		}
	}

	async move(from: StorePath, to: StorePath): Promise<FileNode> {
		if (from === "" || from === to) throw new Error("Invalid move");
		if (await this.stat(to)) throw new Error(`Destination exists: ${to}`);
		const found = await this.handleAt(from);
		if (!found) throw new Error(`Not found: ${from}`);

		const destParent = await this.dirAt(parentPath(to), true);
		const destName = baseName(to);

		if (supportsNativeMove(found.handle)) {
			// Chromium fast path — atomic rename/move.
			await found.handle.move!(destParent, destName);
		} else {
			await this.copyInto(found, destParent, destName);
			await this.remove(from);
		}
		const node = await this.stat(to);
		if (!node) throw new Error(`Move failed: ${to}`);
		return node;
	}

	/** Recursive copy fallback for browsers without native handle.move(). */
	private async copyInto(
		src: { kind: "file" | "directory"; handle: FileSystemHandle },
		destParent: FileSystemDirectoryHandle,
		destName: string,
	): Promise<void> {
		if (src.kind === "file") {
			const file = await (src.handle as FileSystemFileHandle).getFile();
			const target = await destParent.getFileHandle(destName, { create: true });
			const writable = await target.createWritable();
			await writable.write(file);
			await writable.close();
			return;
		}
		const targetDir = await destParent.getDirectoryHandle(destName, {
			create: true,
		});
		for await (const [name, child] of (src.handle as DirHandle).entries()) {
			await this.copyInto(
				{ kind: child.kind as "file" | "directory", handle: child },
				targetDir,
				name,
			);
		}
	}

	rename(path: StorePath, nextName: string): Promise<FileNode> {
		const parent = parentPath(path);
		return this.move(path, parent ? `${parent}/${nextName}` : nextName);
	}

	async estimate(): Promise<StorageEstimate> {
		if (navigator.storage?.estimate) {
			const e = await navigator.storage.estimate();
			return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
		}
		return { usage: 0, quota: 0 };
	}
}
