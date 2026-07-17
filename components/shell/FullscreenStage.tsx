"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Minimize2 } from "lucide-react";
import type { ComponentEntry } from "@/lib/registry/types";
import { useTunedProps } from "@/lib/registry/useTunedProps";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { previews } from "@/components/registry/previews";
import PlaceholderPreview from "./PlaceholderPreview";

// Viewport-filling twin of the LiveWorkspace stage. Reads the same nuqs query
// params, so a tuning deep-links here byte-for-byte with no extra state.
export default function FullscreenStage({ entry }: { entry: ComponentEntry }) {
	const { values } = useTunedProps(entry.props);
	const reducedMotion = usePrefersReducedMotion();
	const router = useRouter();
	const searchParams = useSearchParams();
	const Preview = previews[entry.slug] ?? PlaceholderPreview;

	const qs = searchParams.toString();
	const backHref = qs ? `/components/${entry.slug}?${qs}` : `/components/${entry.slug}`;

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			// Previews that consume Escape (e.g. command palette) win via preventDefault.
			if (e.key === "Escape" && !e.defaultPrevented) router.push(backHref);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [router, backHref]);

	return (
		// grid, not block: previews size with `h-full`, which needs a definite
		// grid area to resolve against (same reason as the workspace stage).
		<div className="relative grid h-dvh overflow-hidden bg-surface">
			<Preview values={values} reducedMotion={reducedMotion} />
			<div className="absolute left-3 top-3 z-10 flex items-center gap-2">
				<Link
					href={backHref}
					aria-label={`Exit fullscreen, back to ${entry.name}`}
					className="grid h-8 w-8 place-items-center rounded-md border border-hairline bg-surface/80 text-ink-dim backdrop-blur transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none"
				>
					<Minimize2 className="h-4 w-4" aria-hidden />
				</Link>
				<span className="rounded-md border border-hairline bg-surface/80 px-2 py-1 font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute backdrop-blur">
					{entry.name}
				</span>
			</div>
		</div>
	);
}
