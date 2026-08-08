// Small self-contained utilities. Vendored here (not imported from the app's
// lib/utils) so the whole component folder stays portable — drop it into any
// project and it works with zero @/ imports.

import type { FileNode } from "./store/types";

/** clsx-lite: join truthy class fragments. */
export function cn(...parts: Array<string | false | null | undefined>): string {
	return parts.filter(Boolean).join(" ");
}

/** Human file size. `1536 -> "1.5 KB"`. */
export function formatBytes(bytes: number): string {
	if (!bytes) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const exp = Math.min(
		Math.floor(Math.log(bytes) / Math.log(1024)),
		units.length - 1,
	);
	const value = bytes / 1024 ** exp;
	return `${value >= 100 || exp === 0 ? Math.round(value) : value.toFixed(1)} ${units[exp]}`;
}

/** Relative time from an epoch-ms timestamp. `"just now"`, `"3h ago"`, a date. */
export function formatRelativeTime(mtime: number, now = Date.now()): string {
	if (!mtime) return "—";
	const secs = Math.round((now - mtime) / 1000);
	if (secs < 45) return "just now";
	const mins = Math.round(secs / 60);
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.round(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.round(hrs / 24);
	if (days < 7) return `${days}d ago`;
	return new Date(mtime).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

/** Lowercased extension without the dot, or `""`. */
export function fileExtension(name: string): string {
	const dot = name.lastIndexOf(".");
	return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export type FileKind =
	| "directory"
	| "image"
	| "video"
	| "audio"
	| "pdf"
	| "text"
	| "code"
	| "archive"
	| "file";

/** Classify a node for icon selection and preview routing. */
export function kindForNode(node: FileNode): FileKind {
	if (node.kind === "directory") return "directory";
	const mime = node.mime ?? "";
	if (mime.startsWith("image/")) return "image";
	if (mime.startsWith("video/")) return "video";
	if (mime.startsWith("audio/")) return "audio";
	if (mime === "application/pdf") return "pdf";
	const ext = fileExtension(node.name);
	if (["zip", "tar", "gz", "rar", "7z"].includes(ext)) return "archive";
	if (
		["js", "ts", "tsx", "jsx", "json", "css", "html", "py", "rs", "go", "sh"].includes(
			ext,
		)
	) {
		return "code";
	}
	if (mime.startsWith("text/") || ["txt", "md", "csv", "log"].includes(ext)) {
		return "text";
	}
	return "file";
}

/** True for kinds we can render an inline preview for. */
export function isPreviewable(kind: FileKind): boolean {
	return (
		kind === "image" ||
		kind === "video" ||
		kind === "audio" ||
		kind === "text" ||
		kind === "code"
	);
}

/** Resolve a non-colliding name in a directory given the existing names. */
export function uniqueName(base: string, taken: Set<string>): string {
	if (!taken.has(base)) return base;
	const dot = base.lastIndexOf(".");
	const stem = dot > 0 ? base.slice(0, dot) : base;
	const ext = dot > 0 ? base.slice(dot) : "";
	let i = 2;
	let candidate = `${stem} (${i})${ext}`;
	while (taken.has(candidate)) {
		i += 1;
		candidate = `${stem} (${i})${ext}`;
	}
	return candidate;
}
