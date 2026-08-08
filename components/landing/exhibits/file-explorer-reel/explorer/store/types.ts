// The persistence contract for FileExplorer. Everything the UI touches goes
// through this interface — the component never speaks OPFS or IndexedDB
// directly. Swap the backend (S3, a REST API, a mock) by implementing this
// and passing it as the `store` prop. See ./index.ts for the built-in adapters
// and the runtime selector.

/**
 * A POSIX-ish path measured from the store root.
 *
 * - Root is the empty string `""` (never `"/"`).
 * - No leading slash. Segments are joined by `"/"`.
 * - Example: `"photos/2024/beach.jpg"`.
 */
export type StorePath = string;

export type NodeKind = "file" | "directory";

/**
 * One entry returned by {@link FileStore.list} or {@link FileStore.stat}.
 * The presentational layer only ever sees this — never a raw handle or DB key.
 */
export interface FileNode {
	/** Base name with no path segments, e.g. `"beach.jpg"` or `"photos"`. */
	name: string;
	/** Full path from the store root. */
	path: StorePath;
	kind: NodeKind;
	/** Size in bytes. Always `0` for directories. */
	size: number;
	/** Last-modified time, epoch milliseconds. */
	mtime: number;
	/** Best-effort MIME type for files (may be empty for unknown types). */
	mime?: string;
}

/** Best-effort quota/usage numbers from {@link FileStore.estimate}. */
export interface StorageEstimate {
	/** Bytes currently in use (0 when the platform can't report it). */
	usage: number;
	/** Bytes granted to the origin (0 when unknown). */
	quota: number;
}

/**
 * Identifier for the active backend, surfaced in the storage readout.
 * The `(string & {})` arm keeps the union open for custom adapters while
 * preserving autocompletion for the built-ins.
 */
export type FileStoreBackend = "opfs" | "indexeddb" | "memory" | (string & {});

/**
 * A persistent, hierarchical blob store. Every method is async and path-based.
 *
 * Built-in adapters: `OpfsFileStore` (primary), `IndexedDbFileStore` (universal
 * fallback), `MemoryFileStore` (SSR/test safety net). Runtime picks the best
 * available via {@link createFileStore}.
 *
 * Blob URLs are intentionally NOT part of this contract — they're a view
 * concern. Callers wrap {@link FileStore.read} in `URL.createObjectURL` and are
 * responsible for revoking. See the `useObjectUrl` hook.
 */
export interface FileStore {
	/** Backend id for diagnostics and the storage readout. */
	readonly backend: FileStoreBackend;

	/**
	 * Open the underlying store. Idempotent and safe to call repeatedly —
	 * implementations memoize the in-flight promise so a React StrictMode
	 * double-mount can't race two opens.
	 */
	init(): Promise<void>;

	/** Immediate children of a directory (default: root `""`). Not recursive. */
	list(dir?: StorePath): Promise<FileNode[]>;

	/** Metadata for a single node, or `null` if it doesn't exist. */
	stat(path: StorePath): Promise<FileNode | null>;

	/**
	 * File bytes as a `Blob` (a `File` is a `Blob`). Rejects for a directory or
	 * a missing path. Wrap the result in `URL.createObjectURL` for preview and
	 * revoke it when done.
	 */
	read(path: StorePath): Promise<Blob>;

	/** Create or overwrite a file. Missing parent directories are created. */
	write(path: StorePath, data: Blob, mime?: string): Promise<FileNode>;

	/** Create a directory and any missing parents. No-op if it already exists. */
	mkdir(path: StorePath): Promise<FileNode>;

	/** Delete a file, or a directory and all its contents. No-op if absent. */
	remove(path: StorePath): Promise<void>;

	/**
	 * Move (or rename across directories) to a new full path. Destination
	 * parents are created. Rejects if `to` already exists — the caller resolves
	 * collisions (e.g. by appending " copy").
	 */
	move(from: StorePath, to: StorePath): Promise<FileNode>;

	/** Rename within the same parent. Sugar over {@link FileStore.move}. */
	rename(path: StorePath, nextName: string): Promise<FileNode>;

	/** Best-effort quota/usage (`navigator.storage.estimate`). */
	estimate(): Promise<StorageEstimate>;
}

// ---------------------------------------------------------------------------
// Path helpers — shared by every adapter. Kept here so the contract and its
// path arithmetic live together.
// ---------------------------------------------------------------------------

/** Split a path into non-empty segments. Root (`""`) yields `[]`. */
export function segments(path: StorePath): string[] {
	return path.split("/").filter(Boolean);
}

/** Join a parent directory and a child name into a path. */
export function joinPath(dir: StorePath, name: string): StorePath {
	return dir ? `${dir}/${name}` : name;
}

/** Parent directory of a path. `"a/b/c" -> "a/b"`, `"a" -> ""`, `"" -> ""`. */
export function parentPath(path: StorePath): StorePath {
	const segs = segments(path);
	segs.pop();
	return segs.join("/");
}

/** Final segment of a path. `"a/b/c" -> "c"`, `"" -> ""`. */
export function baseName(path: StorePath): string {
	const segs = segments(path);
	return segs.length ? segs[segs.length - 1] : "";
}

/** Best-effort MIME from a file name extension. Empty string when unknown. */
export function guessMime(name: string): string {
	const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
	return MIME_BY_EXT[ext] ?? "";
}

const MIME_BY_EXT: Record<string, string> = {
	// images
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	avif: "image/avif",
	svg: "image/svg+xml",
	bmp: "image/bmp",
	ico: "image/x-icon",
	// video
	mp4: "video/mp4",
	webm: "video/webm",
	mov: "video/quicktime",
	mkv: "video/x-matroska",
	// audio
	mp3: "audio/mpeg",
	wav: "audio/wav",
	ogg: "audio/ogg",
	flac: "audio/flac",
	m4a: "audio/mp4",
	// text / docs
	txt: "text/plain",
	md: "text/markdown",
	json: "application/json",
	csv: "text/csv",
	html: "text/html",
	css: "text/css",
	js: "text/javascript",
	ts: "text/typescript",
	pdf: "application/pdf",
	zip: "application/zip",
};
