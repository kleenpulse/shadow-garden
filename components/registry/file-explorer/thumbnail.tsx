"use client";

// Renders a node's visual: a real image preview for image files (via a
// revocable object URL), or a kind-appropriate icon for everything else.
// Folders take the accent tint; files stay chromatically quiet.

import {
	Code,
	File as FileIcon,
	FileArchive,
	FileText,
	Film,
	Folder,
	Image as ImageIcon,
	Music,
} from "lucide-react";
import type { FileNode, FileStore } from "./store/types";
import { useStoredObjectUrl } from "./use-object-url";
import { cn, kindForNode, type FileKind } from "./util";

const ICON: Record<FileKind, typeof FileIcon> = {
	directory: Folder,
	image: ImageIcon,
	video: Film,
	audio: Music,
	pdf: FileText,
	text: FileText,
	code: Code,
	archive: FileArchive,
	file: FileIcon,
};

export function Thumbnail({
	node,
	store,
	enabled = true,
	iconClassName,
	className,
}: {
	node: FileNode;
	store: FileStore | null;
	/** Gate the byte read (off-screen tiles can skip faulting in their blob). */
	enabled?: boolean;
	iconClassName?: string;
	className?: string;
}) {
	const kind = kindForNode(node);
	const wantsImage = enabled && kind === "image";
	const url = useStoredObjectUrl(store, wantsImage ? node : null, wantsImage);

	if (url && kind === "image") {
		return (
			// eslint-disable-next-line @next/next/no-img-element -- object URL, not a remote asset
			<img
				src={url}
				alt={node.name}
				loading="lazy"
				className={cn("h-full w-full object-cover", className)}
			/>
		);
	}

	const Icon = ICON[kind];
	return (
		<div
			className={cn(
				"flex h-full w-full items-center justify-center",
				className,
			)}
		>
			<Icon
				className={cn(
					"h-1/2 w-1/2",
					kind === "directory" ? "text-accent" : "text-ink-mute",
					iconClassName,
				)}
				strokeWidth={kind === "directory" ? 1.5 : 1.75}
			/>
		</div>
	);
}
