"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Maximize2 } from "lucide-react";
import type { ComponentEntry } from "@/lib/registry/types";
import { trackEvent } from "@/lib/stats/track";
import { useTunedProps } from "@/lib/registry/useTunedProps";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { usePauseState } from "@/hooks/use-pause-state";
import { previews } from "@/components/registry/previews";
import PlaceholderPreview from "./PlaceholderPreview";
import PreviewBoundary from "./PreviewBoundary";
import ControlsPanel from "./ControlsPanel";
import WorkspaceTabs from "./WorkspaceTabs";

// Owns the tuned-state source (the URL, via nuqs) shared by the preview stage and
// the controls. The Preview/Code tabs sit on top; the controls run full-width
// underneath so dragging a control updates the preview directly above it.
// `code` and `promptSlot` are server-rendered nodes (the source panel and the
// Copy Prompt control) passed straight through.
export default function LiveWorkspace({
	entry,
	code,
	promptSlot,
}: {
	entry: ComponentEntry;
	code: ReactNode;
	promptSlot?: ReactNode;
}) {
	const { values, setValue, reset } = useTunedProps(entry.props);
	const reducedMotion = usePrefersReducedMotion();
	const paused = usePauseState(entry.slug);
	const t = useTranslations("chrome.liveWorkspace");

	// One view ping per component the user opens (fires once per slug, incl. on
	// client-side nav between components). Fire-and-forget, anonymous.
	useEffect(() => {
		trackEvent(entry.slug, "view");
	}, [entry.slug]);
	const searchParams = useSearchParams();
	const Preview = previews[entry.slug] ?? PlaceholderPreview;
	// Stable key for resetKeys: re-running the boundary when the tuned values
	// change lets a crash caused by a bad control value auto-recover on the next tweak.
	const valuesKey = useMemo(() => JSON.stringify(values), [values]);

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
					// `data-preview-stage` is the handle scripts/verify-loop.mjs uses to
					// scope its DOM-liveness observer to the entry under test. An attribute,
					// not a class match: a harness keyed off a Tailwind string breaks
					// silently the day these breakpoints change, and a silent harness is
					// worse than none.
					<div
						data-preview-stage
						className="group relative grid min-h-90 md:min-h-120 xl:min-h-150 overflow-hidden rounded-lg border border-hairline bg-panel"
					>
						<PreviewBoundary
							slug={entry.slug}
							variant="stage"
							resetKeys={[entry.slug, valuesKey]}
						>
							<Preview
								values={values}
								reducedMotion={reducedMotion}
								paused={paused}
							/>
						</PreviewBoundary>
						{/* Hidden until stage hover on hover-capable devices; always visible on
						    touch, and revealed by keyboard focus either way. */}
						<Link
							href={fullHref}
							aria-label={t("fullscreenAria")}
							className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-md border border-hairline bg-surface/80 text-ink-dim backdrop-blur transition-[color,opacity] hover:text-accent focus-visible:text-accent focus-visible:outline-none [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
						>
							<Maximize2 className="h-4 w-4" aria-hidden />
						</Link>
					</div>
				}
				code={code}
				promptSlot={promptSlot}
			/>
			<ControlsPanel
				props={entry.props}
				values={values}
				onChange={setValue}
				onReset={reset}
				pausable={entry.pausable}
			/>
		</div>
	);
}
