"use client";

// A tiny controlled input for inline rename, shared by tiles, rows, the folder
// rail, and the detail panel. Commits on Enter or blur, cancels on Escape, and
// stops click/dblclick from bubbling to selection/open handlers underneath.

import { useEffect, useRef, useState } from "react";
import { cn } from "./util";

export function InlineRename({
	initial,
	onCommit,
	onCancel,
	className,
}: {
	initial: string;
	onCommit: (nextName: string) => void;
	onCancel: () => void;
	className?: string;
}) {
	const [value, setValue] = useState(initial);
	const ref = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const input = ref.current;
		if (!input) return;
		input.focus();
		// Select the stem, not the extension — matches OS rename behavior.
		const dot = initial.lastIndexOf(".");
		input.setSelectionRange(0, dot > 0 ? dot : initial.length);
	}, [initial]);

	function commit() {
		const next = value.trim();
		if (next && next !== initial) onCommit(next);
		else onCancel();
	}

	return (
		<input
			ref={ref}
			value={value}
			spellCheck={false}
			onChange={(e) => setValue(e.target.value)}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					commit();
				} else if (e.key === "Escape") {
					e.preventDefault();
					onCancel();
				}
				e.stopPropagation();
			}}
			onBlur={commit}
			onClick={(e) => e.stopPropagation()}
			onDoubleClick={(e) => e.stopPropagation()}
			className={cn(
				"w-full rounded-sm border border-accent bg-surface px-1 py-0.5 text-ink outline-none",
				className,
			)}
		/>
	);
}
