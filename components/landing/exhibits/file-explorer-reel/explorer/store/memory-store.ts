// MemoryFileStore — a non-persistent, in-memory FileStore. It's the last-ditch
// backend when neither OPFS nor IndexedDB is available (very old browsers,
// certain private modes, SSR/test environments). Data lives only for the tab's
// lifetime. Same flat-record tree model as the IDB adapter, minus the database.

import {
	baseName,
	guessMime,
	joinPath,
	parentPath,
	segments,
	type FileNode,
	type FileStore,
	type FileStoreBackend,
	type StorageEstimate,
	type StorePath,
} from "./types";

interface Rec {
	path: string;
	name: string;
	parent: string;
	kind: "file" | "directory";
	size: number;
	mtime: number;
	mime?: string;
	blob?: Blob;
}

function toNode(r: Rec): FileNode {
	return {
		name: r.name,
		path: r.path,
		kind: r.kind,
		size: r.size,
		mtime: r.mtime,
		mime: r.mime,
	};
}

export class MemoryFileStore implements FileStore {
	readonly backend: FileStoreBackend = "memory";
	private nodes = new Map<string, Rec>();

	init(): Promise<void> {
		return Promise.resolve();
	}

	private ensureDirs(path: StorePath, now: number, includeSelf: boolean): void {
		const segs = segments(path);
		const upto = includeSelf ? segs.length : segs.length - 1;
		let cursor = "";
		for (let i = 0; i < upto; i++) {
			cursor = joinPath(cursor, segs[i]);
			if (!this.nodes.has(cursor)) {
				this.nodes.set(cursor, {
					path: cursor,
					name: segs[i],
					parent: parentPath(cursor),
					kind: "directory",
					size: 0,
					mtime: now,
				});
			}
		}
	}

	list(dir: StorePath = ""): Promise<FileNode[]> {
		const out: FileNode[] = [];
		for (const rec of this.nodes.values()) {
			if (rec.parent === dir) out.push(toNode(rec));
		}
		return Promise.resolve(out);
	}

	stat(path: StorePath): Promise<FileNode | null> {
		if (path === "") {
			return Promise.resolve({
				name: "",
				path: "",
				kind: "directory",
				size: 0,
				mtime: 0,
			});
		}
		const rec = this.nodes.get(path);
		return Promise.resolve(rec ? toNode(rec) : null);
	}

	read(path: StorePath): Promise<Blob> {
		const rec = this.nodes.get(path);
		if (!rec || rec.kind !== "file" || !rec.blob) {
			return Promise.reject(new Error(`Not a readable file: ${path}`));
		}
		return Promise.resolve(rec.blob);
	}

	write(path: StorePath, data: Blob, mime?: string): Promise<FileNode> {
		const now = Date.now();
		this.ensureDirs(path, now, false);
		const rec: Rec = {
			path,
			name: baseName(path),
			parent: parentPath(path),
			kind: "file",
			size: data.size,
			mtime: now,
			mime: mime || data.type || guessMime(baseName(path)),
			blob: data,
		};
		this.nodes.set(path, rec);
		return Promise.resolve(toNode(rec));
	}

	mkdir(path: StorePath): Promise<FileNode> {
		const now = Date.now();
		this.ensureDirs(path, now, true);
		return Promise.resolve(
			toNode(
				this.nodes.get(path) ?? {
					path,
					name: baseName(path),
					parent: parentPath(path),
					kind: "directory",
					size: 0,
					mtime: now,
				},
			),
		);
	}

	remove(path: StorePath): Promise<void> {
		if (path === "") return Promise.resolve();
		const prefix = `${path}/`;
		for (const key of [...this.nodes.keys()]) {
			if (key === path || key.startsWith(prefix)) this.nodes.delete(key);
		}
		return Promise.resolve();
	}

	move(from: StorePath, to: StorePath): Promise<FileNode> {
		if (from === "" || from === to) return Promise.reject(new Error("Invalid move"));
		if (this.nodes.has(to)) return Promise.reject(new Error(`Destination exists: ${to}`));
		const src = this.nodes.get(from);
		if (!src) return Promise.reject(new Error(`Not found: ${from}`));
		const now = Date.now();
		this.ensureDirs(to, now, false);
		const prefix = `${from}/`;
		const affected = [...this.nodes.values()].filter(
			(n) => n.path === from || n.path.startsWith(prefix),
		);
		for (const n of affected) this.nodes.delete(n.path);
		let moved: Rec | null = null;
		for (const n of affected) {
			const nextPath = to + n.path.slice(from.length);
			const rec: Rec = {
				...n,
				path: nextPath,
				name: baseName(nextPath),
				parent: parentPath(nextPath),
				mtime: n.path === from ? now : n.mtime,
			};
			this.nodes.set(nextPath, rec);
			if (n.path === from) moved = rec;
		}
		return Promise.resolve(toNode(moved!));
	}

	rename(path: StorePath, nextName: string): Promise<FileNode> {
		return this.move(path, joinPath(parentPath(path), nextName));
	}

	estimate(): Promise<StorageEstimate> {
		let usage = 0;
		for (const rec of this.nodes.values()) usage += rec.size;
		return Promise.resolve({ usage, quota: 0 });
	}
}
