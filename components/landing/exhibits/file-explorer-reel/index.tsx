"use client";

// γ — Power-User Systems, desktop. A self-playing reel of the File Explorer
// that hands the wheel over on click.
//
// The reel is a film: an inert render of the product's own leaves driven by a
// scripted timeline. Clicking swaps it for the genuine <FileExplorer> on the
// same, already-seeded namespace — so the thing a visitor takes over IS the
// thing being sold. Scrolling the exhibit away hands it back to the reel, which
// reseeds on its next pass; resuming the script into a store the visitor had
// since renamed or emptied is what that avoids.
//
// The takeover is also the WCAG 2.2.2 pause mechanism for auto-updating
// content, and the route to the full component for anyone on reduced motion.

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import ExhibitFrame from "@/components/landing/ExhibitFrame";
import PreviewBoundary from "@/components/shell/PreviewBoundary";
import FileExplorer from "@/components/registry/file-explorer/file-explorer";
import ReelCursor from "./ReelCursor";
import ReelShell from "./ReelShell";
import { SEED } from "./script";
import { REEL_NAMESPACE, useReelTimeline } from "./useReelTimeline";

// FileExplorer's own default accent is the dark-theme amethyst, which washes
// out on a light panel. Mirrors AlphaExhibit's theme-aware palette.
const ACCENT = { dark: "#a855f7", light: "#7e22ce" } as const;

const THUMBNAIL_SIZE = 104;

export default function FileExplorerReelSection({
	frameClassName,
}: {
	/** Owned by DeltaExhibit so both breakpoint branches share one frame chrome. */
	frameClassName: string;
}) {
	return (
		<ExhibitFrame className={frameClassName}>
			{({ active, inView, reducedMotion }) => (
				<PreviewBoundary
					slug="file-explorer"
					label="FileExplorer"
					variant="stage"
					showRetry={false}
				>
					<ReelStage active={active} inView={inView} reducedMotion={reducedMotion} />
				</PreviewBoundary>
			)}
		</ExhibitFrame>
	);
}

function ReelStage({
	active,
	inView,
	reducedMotion,
}: {
	active: boolean;
	inView: boolean;
	reducedMotion: boolean;
}) {
	const [takenOver, setTakenOver] = useState(false);
	const { resolvedTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	// eslint-disable-next-line react-hooks/set-state-in-effect -- theme hydration gate
	useEffect(() => setMounted(true), []);

	// Scrolled away while driving it → give the exhibit back to the reel. Gated
	// on inView rather than active so this still works under reduced motion,
	// where active is false for the entire session.
	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect -- syncing to viewport visibility
		if (takenOver && !inView) setTakenOver(false);
	}, [takenOver, inView]);

	// Until mounted, resolvedTheme is unknown on both passes — pin to dark so
	// hydration matches, then swap if the visitor is on light.
	const accent = !mounted || resolvedTheme !== "light" ? ACCENT.dark : ACCENT.light;

	// Swapping components (rather than branching inside one) is deliberate: it
	// unmounts useReelTimeline, so the reel's store handle is released before
	// FileExplorer opens its own on the same namespace — and released again on
	// the way back.
	if (takenOver) {
		return (
			<div className="absolute inset-0">
				<FileExplorer
					namespace={REEL_NAMESPACE}
					// Already seeded by the reel; this only matters if a visitor
					// clicks through before the first seed lands.
					seed={SEED}
					accent={accent}
					reducedMotion={reducedMotion}
					thumbnailSize={THUMBNAIL_SIZE}
					className="h-full"
				/>
			</div>
		);
	}

	return (
		<Reel
			active={active}
			reducedMotion={reducedMotion}
			onTakeOver={() => setTakenOver(true)}
		/>
	);
}

function Reel({
	active,
	reducedMotion,
	onTakeOver,
}: {
	active: boolean;
	reducedMotion: boolean;
	onTakeOver: () => void;
}) {
	const rootRef = useRef<HTMLDivElement>(null);
	const [hovering, setHovering] = useState(false);

	const timeline = useReelTimeline({
		rootRef,
		playing: active && !hovering,
		reducedMotion,
	});

	return (
		<div ref={rootRef} className="absolute inset-0">
			{/* inert, not just pointer-events-none: InlineRename calls focus(), and
			    a focus inside a panel this far down the page would scroll the
			    viewport to it mid-beat. On an inert subtree, focus() is a no-op. */}
			<div inert className="absolute inset-0 select-none">
				<ReelShell timeline={timeline} reducedMotion={reducedMotion} />
			</div>

			{!reducedMotion ? <ReelCursor cursor={timeline.cursor} /> : null}

			<button
				type="button"
				onPointerEnter={() => setHovering(true)}
				onPointerLeave={() => setHovering(false)}
				onFocus={() => setHovering(true)}
				onBlur={() => setHovering(false)}
				onClick={onTakeOver}
				aria-label="Take over the File Explorer demo and use it for real"
				className="group absolute inset-0 z-50 flex cursor-pointer items-center justify-center focus-visible:outline-none"
			>
				<span className="pointer-events-none rounded-md border border-accent/60 bg-panel/90 px-3 py-2 font-display text-[10px] uppercase tracking-[0.22em] text-accent opacity-0 shadow-lg backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
					Click to take over
				</span>
			</button>
		</div>
	);
}
