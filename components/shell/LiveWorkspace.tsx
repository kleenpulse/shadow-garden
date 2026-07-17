"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Maximize2 } from "lucide-react";
import type { ComponentEntry } from "@/lib/registry/types";
import { useTunedProps } from "@/lib/registry/useTunedProps";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { previews } from "@/components/registry/previews";
import PlaceholderPreview from "./PlaceholderPreview";
import ControlsPanel from "./ControlsPanel";
import WorkspaceTabs from "./WorkspaceTabs";

// Owns the tuned-state source (the URL, via nuqs) shared by the preview stage and
// the controls. The Preview/Code tabs sit on top; the controls run full-width
// underneath so dragging a control updates the preview directly above it.
// `code` is a server-rendered node (the gated source panel) passed straight
// through to the Code tab.
export default function LiveWorkspace({
	entry,
	code,
}: {
	entry: ComponentEntry;
	code: ReactNode;
}) {
	const { values, setValue, reset } = useTunedProps(entry.props);
	const reducedMotion = usePrefersReducedMotion();
	const searchParams = useSearchParams();
	const Preview = previews[entry.slug] ?? PlaceholderPreview;

	const qs = searchParams.toString();
	const fullHref = qs
		? `/components/${entry.slug}/full?${qs}`
		: `/components/${entry.slug}/full`;

	return (
		<div className="space-y-4">
			<WorkspaceTabs
				slug={entry.slug}
				preview={
					// grid, not block: previews size with `h-full`, which resolves to auto
					// against a min-height-only block parent. A stretched grid area is
					// definite, so `h-full` gets the real stage height.
					<div className="group relative grid min-h-90 md:min-h-120 overflow-hidden rounded-lg border border-hairline bg-panel">
						<Preview values={values} reducedMotion={reducedMotion} />
						{/* Hidden until stage hover on hover-capable devices; always visible on
						    touch, and revealed by keyboard focus either way. */}
						<Link
							href={fullHref}
							aria-label="Open preview fullscreen"
							className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-md border border-hairline bg-surface/80 text-ink-dim backdrop-blur transition-[color,opacity] hover:text-accent focus-visible:text-accent focus-visible:outline-none [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
						>
							<Maximize2 className="h-4 w-4" aria-hidden />
						</Link>
					</div>
				}
				code={code}
			/>
			<ControlsPanel
				props={entry.props}
				values={values}
				onChange={setValue}
				onReset={reset}
			/>
		</div>
	);
}
