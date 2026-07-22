"use client";

// Path breadcrumb. Root shows a Home icon; each segment is a clickable crumb
// that navigates to that ancestor directory.

import { Fragment } from "react";
import { ChevronRight, House } from "lucide-react";
import { segments, type StorePath } from "./store/types";
import { cn } from "./util";

export function Breadcrumb({
	path,
	onNavigate,
	className,
}: {
	path: StorePath;
	onNavigate: (path: StorePath) => void;
	className?: string;
}) {
	const segs = segments(path);
	const crumbs = segs.map((name, i) => ({
		name,
		path: segs.slice(0, i + 1).join("/"),
	}));

	return (
		<nav
			aria-label="Breadcrumb"
			className={cn(
				"flex min-w-0 items-center gap-0.5 overflow-x-auto text-xs scrollbar-none",
				className,
			)}
		>
			<button
				type="button"
				onClick={() => onNavigate("")}
				aria-label="Home"
				className={cn(
					"flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-1 text-ink-dim transition-colors hover:text-accent",
					path === "" && "text-ink",
				)}
			>
				<House className="h-3.5 w-3.5" />
			</button>
			{crumbs.map((crumb, i) => (
				<Fragment key={crumb.path}>
					<ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-mute" />
					<button
						type="button"
						onClick={() => onNavigate(crumb.path)}
						className={cn(
							"max-w-[12ch] shrink-0 truncate rounded-sm px-1.5 py-1 font-mono transition-colors hover:text-accent",
							i === crumbs.length - 1 ? "text-ink" : "text-ink-dim",
						)}
						aria-current={i === crumbs.length - 1 ? "page" : undefined}
					>
						{crumb.name}
					</button>
				</Fragment>
			))}
		</nav>
	);
}
