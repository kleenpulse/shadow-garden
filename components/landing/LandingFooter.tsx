import Link from "next/link";
import { anchorFor, SECTION_IDS, type LandingData } from "@/components/landing/data";
import SmoothAnchor from "@/components/landing/SmoothAnchor";

// Quiet colophon — the last of the page's seven plates (η).
export default function LandingFooter({
	stats,
	exhibits,
}: {
	stats: LandingData["stats"];
	exhibits: LandingData["exhibits"];
}) {
	return (
		<footer id={SECTION_IDS.colophon} className="scroll-mt-10 border-t border-hairline">
			<div className="mx-auto grid w-full max-w-7xl gap-10 px-3 py-14 sm:px-6 sm:grid-cols-[1fr_auto]">
				<div>
					<p className="font-display text-sm uppercase tracking-[0.28em] text-ink">
						Shadow Garden
					</p>
					<p className="mt-3 max-w-sm font-sans text-xs leading-relaxed text-ink-mute">
						An instrument bench for React motion. Preview live, tune every
						parameter, take the source.
					</p>
				</div>
				<nav
					aria-label="Exhibits"
					className="flex flex-col gap-2 font-display text-[10px] uppercase tracking-[0.22em]"
				>
					{exhibits.map((exhibit) => (
						<SmoothAnchor
							key={exhibit.category}
							href={`#${anchorFor(exhibit.category)}`}
							className="text-ink-dim transition-colors hover:text-accent"
						>
							<span className="normal-case">{exhibit.greek}</span> ·{" "}
							{exhibit.category}
						</SmoothAnchor>
					))}
					<Link
						href="/components"
						className="mt-2 text-accent transition-colors hover:text-accent-hover"
					>
						Full catalog →
					</Link>
				</nav>
			</div>
			<div className="border-t border-hairline">
				<div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-3 py-3 font-display text-[10px] sm:px-6 uppercase tracking-[0.22em] text-ink-mute">
					<span>
						Plate <span className="normal-case">η</span>-07 · Colophon
					</span>
					<span>
						{stats.total} specimens · {exhibits.length} exhibits · 1 accent
					</span>
				</div>
			</div>
		</footer>
	);
}
