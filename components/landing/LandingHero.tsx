"use client";

import { useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, useInView, useReducedMotion } from "motion/react";
import PreviewBoundary from "@/components/shell/PreviewBoundary";
import CookBookIcon from "@/components/icons/cook-book";

const Threads = dynamic(() => import("@/components/registry/threads/Threads"), {
	ssr: false,
});

interface LandingHeroProps {
	stats: { total: number; free: number; pro: number };
	hero: { amplitude: number; distance: number; color: string; opacity: number };
}

// The hidden state is identical either way — SSR can't know the motion
// preference, so the initial markup must not branch on it. Reduced motion
// lands the same reveal instantly instead.
const makeVariants = (reduce: boolean) => ({
	container: {
		hidden: {},
		show: {
			transition: reduce
				? { duration: 0 }
				: { staggerChildren: 0.09, delayChildren: 0.15 },
		},
	},
	rise: {
		hidden: { opacity: 0, y: 22 },
		show: {
			opacity: 1,
			y: 0,
			transition: reduce
				? { duration: 0 }
				: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
		},
	},
});

// Full-viewport hero. The Threads field is the living backdrop — rendered with
// the same values the readout strip reports, and paused once scrolled past.
export default function LandingHero({ stats, hero }: LandingHeroProps) {
	const ref = useRef<HTMLElement>(null);
	const inView = useInView(ref);
	const reduce = useReducedMotion() ?? false;
	const { container, rise } = makeVariants(reduce);

	return (
		<section
			ref={ref}
			className="relative flex min-h-svh flex-col overflow-hidden"
		>
			{/* The field bends toward the cursor over open hero space; content above it
          keeps its own pointer events. */}
			<div className="absolute inset-0 opacity-70">
				<PreviewBoundary slug="threads" label="Threads" variant="silent">
					<Threads
						color={hero.color}
						amplitude={hero.amplitude}
						distance={hero.distance}
						opacity={hero.opacity}
						saturation={1}
						maxDpr={1.5}
						enableMouseInteraction={!reduce}
						paused={reduce || !inView}
					/>
				</PreviewBoundary>
			</div>

			<motion.div
				variants={container}
				initial="hidden"
				animate="show"
				className="pointer-events-none relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col justify-end px-3 pb-16 pt-24 sm:px-6 sm:pb-32"
			>
				<motion.p
					variants={rise}
					className="font-display text-[11px] uppercase tracking-[0.34em] text-accent"
				>
					Shadow Garden · Component Registry
				</motion.p>

				<motion.h1
					variants={rise}
					className="mt-6 font-display text-hero uppercase leading-[0.95] tracking-[0.02em] text-ink"
				>
					{stats.total} instruments.
					<br />
					One bench.
				</motion.h1>

				<motion.p
					variants={rise}
					className="mt-7 max-w-xl font-sans text-sm text-ink-dim sm:text-base"
				>
					Motion-forward React components, exhibited live on the page they
					power. Every parameter is a dial. Every specimen is catalogued.
				</motion.p>

				<motion.div
					variants={rise}
					className="pointer-events-auto mt-10 flex flex-wrap items-center gap-3 font-display text-[11px] uppercase tracking-[0.15em]"
				>
					<Link
						href="/components"
						prefetch
						className="rounded-md bg-accent px-5 flex items-center h-8 text-on-accent transition-colors hover:bg-accent-hover"
					>
						Enter the catalog
					</Link>
					<Link
						href="/cookbook"
						prefetch
						className="rounded-md border border-hairline px-5  h-8 text-ink-dim transition-colors hover:border-accent-muted hover:text-ink inline-flex items-center gap-1.5"
					>
						the Cook Book
						<CookBookIcon className="size-5.5" aria-hidden />
					</Link>
				</motion.div>
			</motion.div>

			{/* Instrument readout — the actual prop values driving the field above. */}
			<div className="relative z-10 border-t border-hairline bg-surface/60 backdrop-blur-sm">
				<div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-3 py-3 font-display text-[10px] sm:px-6 uppercase tracking-[0.22em] text-ink-mute">
					<span className="hidden sm:inline">
						Field: Threads · Amp {hero.amplitude.toFixed(2)} · Dist{" "}
						{hero.distance.toFixed(2)}
					</span>
					<span className="w-full sm:w-auto">
						Registry {stats.total} units [{stats.free} free / {stats.pro} pro]
					</span>
				</div>
			</div>
		</section>
	);
}
