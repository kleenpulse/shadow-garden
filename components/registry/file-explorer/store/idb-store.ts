// IndexedDbFileStore — the universal fallback. Works in every modern browser
// and stores real Blobs (images, video, audio) via structured clone, which is
// exactly what localStorage cannot do.
//
// Two object stores:
//   nodes  (keyPath "path")  — the directory tree as a flat record set, indexed
//                              by parent for cheap listing.
//   blobs  (keyPath "id")    — file bytes, keyed by an opaque id.
//
// Blob identity is decoupled from path (a node points at a blob by `blobId`),
// so moving or renaming a file rewrites only its node record — the bytes never
// move. Directory moves rewrite every descendant node in a SINGLE readwrite
// transaction, which IndexedDB commits atomically (a mid-move failure rolls
// back cleanly). That atomicity is IDB's structural advantage over OPFS.
//
// Every mutation computes its change set in plain JS from a snapshot of the
// (small) node set, then applies it in one transaction with no awaits between
// requests — sidestepping IndexedDB's transaction-auto-close footgun entirely.

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

interface NodeRecord {
	path: string;
	name: string;
	parent: string;
	kind: "file" | "directory";
	size: number;
	mtime: number;
	mime?: string;
	blobId?: string;
}

interface ChangeSet {
	putNodes?: NodeRecord[];
	deleteNodePaths?: string[];
	putBlobs?: { id: string; blob: Blob }[];
	deleteBlobIds?: string[];
}

const NODES = "nodes";
const BLOBS = "blobs";

function uid(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function toNode(rec: NodeRecord): FileNode {
	return {
		name: rec.name,
		path: rec.path,
		kind: rec.kind,
		size: rec.size,
		mtime: rec.mtime,
		mime: rec.mime,
	};
}

function req<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function txDone(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error);
	});
}

export class IndexedDbFileStore implements FileStore {
	readonly backend: FileStoreBackend = "indexeddb";
	private db: IDBDatabase | null = null;
	private opening: Promise<void> | null = null;

	constructor(private readonly namespace: string) {}

	init(): Promise<void> {
		// Memoize the in-flight open so a StrictMode double-mount can't race.
		if (this.db) return Promise.resolve();
		if (this.opening) return this.opening;
		this.opening = new Promise<void>((resolve, reject) => {
			const open = indexedDB.open(this.namespace, 1);
			open.onupgradeneeded = () => {
				const db = open.result;
				if (!db.objectStoreNames.contains(NODES)) {
					const nodes = db.createObjectStore(NODES, { keyPath: "path" });
					nodes.createIndex("by_parent", "parent", { unique: false });
				}
				if (!db.objectStoreNames.contains(BLOBS)) {
					db.createObjectStore(BLOBS, { keyPath: "id" });
				}
			};
			open.onsuccess = () => {
				this.db = open.result;
				resolve();
			};
			open.onerror = () => reject(open.error);
		});
		return this.opening;
	}

	private get database(): IDBDatabase {
		if (!this.db) throw new Error("IndexedDbFileStore: init() not awaited");
		return this.db;
	}

	/** Snapshot every node record. The set is small (a file explorer, not a FS). */
	private async allNodes(): Promise<NodeRecord[]> {
		const tx = this.database.transaction(NODES, "readonly");
		return req<NodeRecord[]>(tx.objectStore(NODES).getAll());
	}

	/** Apply a change set in one atomic readwrite transaction. */
	private async apply(change: ChangeSet): Promise<void> {
		const tx = this.database.transaction([NODES, BLOBS], "readwrite");
		const nodes = tx.objectStore(NODES);
		const blobs = tx.objectStore(BLOBS);
		change.deleteBlobIds?.forEach((id) => blobs.delete(id));
		change.putBlobs?.forEach((b) => blobs.put(b));
		change.deleteNodePaths?.forEach((p) => nodes.delete(p));
		change.putNodes?.forEach((n) => nodes.put(n));
		await txDone(tx);
	}

	/** Dir records for every missing ancestor of `path` (and `path` if `includeSelf`). */
	private missingDirs(
		existing: Set<string>,
		path: StorePath,
		now: number,
		includeSelf: boolean,
	): NodeRecord[] {
		const segs = segments(path);
		const upto = includeSelf ? segs.length : segs.length - 1;
		const out: NodeRecord[] = [];
		let cursor = "";
		for (let i = 0; i < upto; i++) {
			cursor = joinPath(cursor, segs[i]);
			if (!existing.has(cursor)) {
				existing.add(cursor);
				out.push({
					path: cursor,
					name: segs[i],
					parent: parentPath(cursor),
					kind: "directory",
					size: 0,
					mtime: now,
				});
			}
		}
		return out;
	}

	async list(dir: StorePath = ""): Promise<FileNode[]> {
		const tx = this.database.transaction(NODES, "readonly");
		const index = tx.objectStore(NODES).index("by_parent");
		const rows = await req<NodeRecord[]>(index.getAll(IDBKeyRange.only(dir)));
		return rows.map(toNode);
	}

	async stat(path: StorePath): Promise<FileNode | null> {
		if (path === "") {
			return { name: "", path: "", kind: "directory", size: 0, mtime: 0 };
		}
		const tx = this.database.transaction(NODES, "readonly");
		const rec = await req<NodeRecord | undefined>(
			tx.objectStore(NODES).get(path),
		);
		return rec ? toNode(rec) : null;
	}

	async read(path: StorePath): Promise<Blob> {
		const tx = this.database.transaction([NODES, BLOBS], "readonly");
		const rec = await req<NodeRecord | undefined>(
			tx.objectStore(NODES).get(path),
		);
		if (!rec || rec.kind !== "file" || !rec.blobId) {
			throw new Error(`Not a readable file: ${path}`);
		}
		const row = await req<{ id: string; blob: Blob } | undefined>(
			tx.objectStore(BLOBS).get(rec.blobId),
		);
		if (!row) throw new Error(`Missing blob for: ${path}`);
		return row.blob;
	}

	async write(path: StorePath, data: Blob, mime?: string): Promise<FileNode> {
		const now = Date.now();
		const all = await this.allNodes();
		const existing = new Set(all.map((n) => n.path));
		const prior = all.find((n) => n.path === path);
		const blobId = uid();
		const record: NodeRecord = {
			path,
			name: baseName(path),
			parent: parentPath(path),
			kind: "file",
			size: data.size,
			mtime: now,
			mime: mime || data.type || guessMime(baseName(path)),
			blobId,
		};
		await this.apply({
			putBlobs: [{ id: blobId, blob: data }],
			deleteBlobIds: prior?.blobId ? [prior.blobId] : undefined,
			putNodes: [...this.missingDirs(existing, path, now, false), record],
		});
		return toNode(record);
	}

	async mkdir(path: StorePath): Promise<FileNode> {
		const now = Date.now();
		const all = await this.allNodes();
		const existing = new Set(all.map((n) => n.path));
		const dirs = this.missingDirs(existing, path, now, true);
		if (dirs.length) await this.apply({ putNodes: dirs });
		const self =
			all.find((n) => n.path === path) ??
			dirs.find((n) => n.path === path);
		return self
			? toNode(self)
			: { name: baseName(path), path, kind: "directory", size: 0, mtime: now };
	}

	async remove(path: StorePath): Promise<void> {
		if (path === "") return;
		const all = await this.allNodes();
		const prefix = `${path}/`;
		const victims = all.filter(
			(n) => n.path === path || n.path.startsWith(prefix),
		);
		if (!victims.length) return;
		await this.apply({
			deleteNodePaths: victims.map((n) => n.path),
			deleteBlobIds: victims
				.map((n) => n.blobId)
				.filter((id): id is string => Boolean(id)),
		});
	}

	async move(from: StorePath, to: StorePath): Promise<FileNode> {
		if (from === "" || from === to) throw new Error("Invalid move");
		const all = await this.allNodes();
		if (all.some((n) => n.path === to)) {
			throw new Error(`Destination exists: ${to}`);
		}
		const src = all.find((n) => n.path === from);
		if (!src) throw new Error(`Not found: ${from}`);
		const now = Date.now();
		const existing = new Set(all.map((n) => n.path));
		const prefix = `${from}/`;
		const affected = all.filter(
			(n) => n.path === from || n.path.startsWith(prefix),
		);
		const rewritten: NodeRecord[] = affected.map((n) => {
			const nextPath = to + n.path.slice(from.length);
			return {
				...n,
				path: nextPath,
				name: baseName(nextPath),
				parent: parentPath(nextPath),
				mtime: n.path === from ? now : n.mtime,
			};
		});
		await this.apply({
			deleteNodePaths: affected.map((n) => n.path),
			putNodes: [...this.missingDirs(existing, to, now, false), ...rewritten],
		});
		return toNode(rewritten[0]);
	}

	rename(path: StorePath, nextName: string): Promise<FileNode> {
		return this.move(path, joinPath(parentPath(path), nextName));
	}

	async estimate(): Promise<StorageEstimate> {
		if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
			const e = await navigator.storage.estimate();
			return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
		}
		return { usage: 0, quota: 0 };
	}
}
