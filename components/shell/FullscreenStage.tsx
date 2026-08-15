"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
// Patched router: imperative navigations drive the route progress bar too.
import { useRouter } from "@bprogress/next/app";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { Minimize2, SlidersHorizontal } from "lucide-react";
import type { ComponentEntry } from "@/lib/registry/types";
import { displayName } from "@/lib/display-name";
import { useTunedProps } from "@/lib/registry/useTunedProps";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { usePauseState } from "@/hooks/use-pause-state";
import { previews } from "@/components/registry/previews";
import PlaceholderPreview from "./PlaceholderPreview";
import PreviewBoundary from "./PreviewBoundary";
import ControlsPanel from "./ControlsPanel";

// Viewport-filling twin of the LiveWorkspace stage. Reads the same nuqs query
// params, so a tuning deep-links here byte-for-byte with no extra state.
export default function FullscreenStage({
	entry,
}: {
	entry: ComponentEntry;
}) {
	const { values, setValue, reset } = useTunedProps(entry.props);
	const reducedMotion = usePrefersReducedMotion();
	const paused = usePauseState(entry.slug);
	const t = useTranslations("chrome.fullscreenStage");
	const router = useRouter();
	const searchParams = useSearchParams();
	const [controlsOpen, setControlsOpen] = useState(false);
	const Preview = previews[entry.slug] ?? PlaceholderPreview;
	const valuesKey = useMemo(() => JSON.stringify(values), [values]);

	const qs = searchParams.toString();
	const backHref = qs ? `/components/${entry.slug}?${qs}` : `/components/${entry.slug}`;

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			// Previews that consume Escape (e.g. command palette) win via preventDefault.
			if (e.key !== "Escape" || e.defaultPrevented) return;
			// Escape peels one layer at a time: docked controls first, then fullscreen.
			if (controlsOpen) setControlsOpen(false);
			else router.push(backHref);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [router, backHref, controlsOpen]);

	return (
		// grid, not block: previews size with `h-full`, which needs a definite
		// grid area to resolve against (same reason as the workspace stage).
		<div className="relative grid h-dvh overflow-hidden bg-surface">
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
			<div className="absolute left-3 top-3 z-10 flex items-center gap-2">
				<Link
					href={backHref}
					aria-label={t("exitAria", { name: entry.name })}
					className="grid h-8 w-8 place-items-center rounded-md border border-hairline bg-surface/80 text-ink-dim backdrop-blur transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none"
				>
					<Minimize2 className="h-4 w-4" aria-hidden />
				</Link>
				<span className="rounded-md border border-hairline bg-surface/80 px-2 py-1 font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute backdrop-blur">
					{displayName(entry.name)}
				</span>
			</div>
			{entry.props.length > 0 && (
				<>
					{controlsOpen && (
						<motion.div
							id="sg-fullscreen-controls"
							initial={reducedMotion ? false : { opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.2, ease: "easeOut" }}
							className="absolute bottom-14 right-3 z-10 max-h-[70dvh] w-[min(380px,calc(100vw-1.5rem))] overflow-y-auto"
						>
							<ControlsPanel
								dense
								props={entry.props}
								values={values}
								onChange={setValue}
								onReset={reset}
								pausable={entry.pausable}
							/>
						</motion.div>
					)}
					<button
						type="button"
						onClick={() => setControlsOpen((open) => !open)}
						aria-expanded={controlsOpen}
						aria-controls="sg-fullscreen-controls"
						aria-label={controlsOpen ? t("hideControls") : t("showControls")}
						className="absolute bottom-3 right-3 z-10 grid h-8 w-8 place-items-center rounded-md border border-hairline bg-surface/80 text-ink-dim backdrop-blur transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none"
					>
						<SlidersHorizontal className="h-4 w-4" aria-hidden />
					</button>
				</>
			)}
		</div>
	);
}
