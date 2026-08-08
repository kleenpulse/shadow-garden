"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLenis } from "lenis/react";
import PreviewBoundary from "@/components/shell/PreviewBoundary";
import CookBookIcon from "@/components/icons/cook-book";
import type { LandingData } from "@/components/landing/data";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

if (typeof window !== "undefined") {
	gsap.registerPlugin(ScrollTrigger);
}

const RubiksCube = dynamic(
	() => import("@/components/registry/rubiks-cube/rubiks-cube"),
	{ ssr: false },
);
const Waves = dynamic(() => import("@/components/registry/waves/waves"), {
	ssr: false,
});
const SideRays = dynamic(
	() => import("@/components/registry/side-rays/side-rays"),
	{ ssr: false },
);

interface LandingHeroProps {
	stats: { total: number; free: number; pro: number };
	hero: LandingData["hero"];
}

// The hidden state is identical either way — SSR can't know the motion
// preference, so the initial markup must not branch on it. Reduced motion
// lands the same reveal instantly instead.
// Size the cube has retreated to by the time the hero's bottom edge reaches
// mid-viewport. The cube pulls back, not the camera — cameraDistance stays at
// its tuned 7.6 throughout, since lowering that would move the camera *closer*
// and grow the cube, which is the opposite of a recede.
const CUBE_FAR_SCALE = 0.7;

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

// Full-viewport hero. The backdrop is the living instrument — the cube from md
// up, Waves below it — running the same values the readout strip reports, and
// paused once scrolled past.
export default function LandingHero({ stats, hero }: LandingHeroProps) {
	const ref = useRef<HTMLElement>(null);
	const inView = useInView(ref);
	const reduce = useReducedMotion() ?? false;
	const { container, rise } = makeVariants(reduce);
	// Two complementary queries, not one boolean. useMediaQuery starts false on
	// the server and on the first client render, so a single query cannot tell
	// "narrow" from "not measured yet" — and anything gating on a separate
	// mounted flag races it: the flag can land first, and that render reads as
	// mobile and mounts Waves on a desktop before the cube replaces it. Both
	// false means unmeasured and nothing renders; exactly one is true once the
	// viewport is actually known, so the wrong backdrop can never mount.
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const isMobile = useMediaQuery("(max-width: 767.98px)");
	const decided = isDesktop || isMobile;
	const { resolvedTheme } = useTheme();

	// Lenis and GSAP each drive their own rAF, so a scrubbed trigger under an
	// unwired Lenis reads a scroll position one frame stale — on a scrubbed
	// canvas that is visible stutter. useLenis resolves through a module-level
	// store rather than context, which is why it works here even though
	// SmoothScroll is a sibling of this component rather than an ancestor.
	// Returns undefined under reduced motion (SmoothScroll renders null); the
	// trigger isn't created in that case either, so there is nothing to sync.
	useLenis(ScrollTrigger.update);

	// The cube recedes as the hero leaves. Scale on the wrapper, not the camera:
	// the canvas never re-renders, so this costs a GPU composite and no React
	// work at all.
	const cubeRef = useRef<HTMLDivElement>(null);

	// The visible end state is owned here rather than by a CSS animation (SPEC
	// §V34) — the globals.css reduced-motion backstop only crushes the
	// transition's duration, so someone who asked for no motion still lands on a
	// lit backdrop instead of one stranded at opacity 0.
	//
	// The cube decides its own moment via onReady. Its canvas element is in the
	// DOM long before it draws anything — WebGL init plus a PMREM environment
	// bake — so fading on mount spends the whole transition on a blank canvas and
	// the cube arrives fully opaque, which reads as a snap rather than a fade.
	// Waves needs no such signal: one fullscreen shader, no bake.
	const [lit, setLit] = useState(false);
	const light = useCallback(() => setLit(true), []);
	useEffect(() => {
		if (!decided) return;
		const frame = isMobile ? requestAnimationFrame(light) : 0;
		// Backstop: if the backdrop never signals — chunk failed to load, WebGL
		// refused, PreviewBoundary caught and rendered null — light anyway rather
		// than leave the hero stranded at opacity 0.
		const timer = setTimeout(light, 2500);
		return () => {
			cancelAnimationFrame(frame);
			clearTimeout(timer);
		};
	}, [decided, isMobile, light]);

	// A function, not a constant: tailwind-merge treats every `opacity-*` as the
	// same class group, so folding a steady-state `opacity-70` and the fade's
	// `opacity-100` into one `cn` call silently drops the former and Waves
	// renders at full strength. One opacity per element, chosen here.
	const fade = (target: string) =>
		cn("transition-opacity duration-1000 ease-out", lit ? target : "opacity-0");

	// isDesktop is load-bearing in the deps, not incidental: the wrapper does not
	// exist until the viewport query resolves, so the first run bails on a null
	// ref and this has to re-run once the cube actually mounts. ctx.revert()
	// strips the inline transform on teardown, so crossing the breakpoint can't
	// strand the cube mid-scale (SPEC §V34) — GSAP owns the end state either way.
	useEffect(() => {
		const el = cubeRef.current;
		const section = ref.current;
		if (!el || !section || reduce) return;
		const ctx = gsap.context(() => {
			gsap.to(el, {
				scale: CUBE_FAR_SCALE,
				// Linear along the scrub. GSAP defaults to power1.out, which would
				// bunch the whole recede into the first third of an already short
				// ramp — the trigger spans about half a viewport.
				ease: "none",
				scrollTrigger: {
					trigger: section,
					start: "top top",
					end: "bottom center",
					scrub: true,
				},
			});
		}, section);
		return () => ctx.revert();
	}, [isDesktop, reduce]);

	return (
		<section
			ref={ref}
			className="relative flex min-h-svh flex-col overflow-hidden"
		>
			{/* Exactly one backdrop is ever mounted. A `hidden md:block` swap would
          allocate both WebGL contexts and only hide one — the same reasoning
          SectionRail uses to gate on the query rather than on CSS. */}
			{isDesktop ? (
				/* The cube is a bounded drag surface, not a full-bleed one: it sits
           clear of the copy and the CTA row below, so grabbing it never
           competes with them. `touch-pan-y` is re-declared over the
           component's own `touch-none` — correct on its component page, where
           the drag IS the interaction, but a scroll trap on a hero. Here a
           horizontal drag orbits and a vertical drag still scrolls the page. */
				<div
					ref={cubeRef}
					className={cn(
						"absolute left-1/2 top-10 -translate-x-1/2 sm:left-[69%]",
						"h-[min(92svh,108vw)] w-[min(92svh,108vw)]",
						"[&_canvas]:touch-pan-y! cursor-default!",
						fade("opacity-100"),
					)}
				>
					<PreviewBoundary
						slug="rubiks-cube"
						label="RubiksCube"
						variant="silent"
					>
						<RubiksCube
							palette={hero.cube.palette}
							glossy
							transparent
							moveDuration={hero.cube.moveDuration}
							scrambleMoveCount={hero.cube.scrambleMoveCount}
							pauseBetweenCycles={hero.cube.pauseBetweenCycles}
							rotationSpeed={hero.cube.rotationSpeed}
							cameraDistance={hero.cube.cameraDistance}
							paused={!inView}
							reducedMotion={reduce}
							onReady={light}
							className="cursor-default!"
						/>
					</PreviewBoundary>
				</div>
			) : null}

			{/* Phones and small tablets get the field instead — the cube is 81 meshes
          plus an environment bake, and it swallows a narrow viewport. Waves
          bakes `[&_canvas]:touch-none` in ahead of its own className, so the
          same `touch-pan-y` override is required here; full-bleed, it would
          otherwise stop a finger drag from scrolling anywhere in the hero.
          Waves has no `reducedMotion` prop — it folds into `paused`. */}
			{isMobile ? (
				<div
					className={cn(
						"absolute inset-0",
						"[&_canvas]:touch-pan-y!",
						fade("opacity-70"),
					)}
				>
					<PreviewBoundary slug="waves" label="Waves" variant="silent">
						<Waves
							color={hero.waves.color}
							amplitude={hero.waves.amplitude}
							distance={hero.waves.distance}
							opacity={hero.waves.opacity}
							saturation={1}
							maxDpr={1.5}
							enableMouseInteraction={!reduce}
							paused={reduce || !inView}
						/>
					</PreviewBoundary>
				</div>
			) : null}

			{/* Corner light, desktop dark only — light theme never allocates the
          context at all. `z-0` is load-bearing: SideRays bakes `relative z-[3]`
          into its own root, which would otherwise resolve against the section
          and paint the rays over the headline. The z-index traps it.
          `pointer-events-none` belongs on this wrapper and not only on SideRays
          (which sets it on its own root): a transparent full-bleed div is still
          a hit target, so without it this layer swallows every drag meant for
          the cube underneath. */}
			{isDesktop && resolvedTheme !== "light" ? (
				<div
					className={cn(
						"pointer-events-none absolute inset-0 z-0",
						fade("opacity-100"),
					)}
					aria-hidden
				>
					<PreviewBoundary slug="side-rays" label="SideRays" variant="silent">
						<SideRays
							origin="top-right"
							speed={0.35}
							opacity={0.5}
							rayColor1={hero.rays.color1}
							rayColor2={hero.rays.color2}
							paused={!inView || reduce}
						/>
					</PreviewBoundary>
				</div>
			) : null}

			{/* Ground for the copy, and the headline's other half. difference maps a
          mid-luminance backdrop back to mid-luminance text, so a half-lit cube
          face is the one thing the blend cannot rescue on its own — the wash
          pulls that band toward the surface colour and hands it a decision it
          can make. Reaches the headline while leaving the cube's top third, the
          part worth looking at, untouched.
          Two traps, both of which fail silently:
          - `svh`, never `h-[80%]`. A percentage height on an absolutely
            positioned child resolves against the containing block, and this
            section's height comes from `min-h-svh` plus flex content —
            indefinite, so the percentage collapses to 0 and nothing paints.
          - Default stop positions. `via-40%` alongside `via-surface/85` drops
            the via *colour*, degrading the gradient to a bare two-stop fade.
          The alpha lives in the gradient stops rather than an element opacity,
          so this never becomes a stacking context and never traps the blend. */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-x-0 bottom-0 h-[80svh] bg-linear-to-t from-surface via-surface/85 to-transparent"
			/>

			{/* No z-index here on purpose. `relative z-10` would create a stacking
          context and the headline's mix-blend-difference would resolve against
          this column's own transparent backdrop instead of the backdrop behind
          it — the blend would silently do nothing. Left at z-auto, the column
          still paints above the backdrop by DOM order. */}
			<motion.div
				variants={container}
				initial="hidden"
				animate="show"
				className="pointer-events-none relative mx-auto flex w-full max-w-7xl flex-1 flex-col justify-end px-3 pb-16 pt-24 sm:px-6 sm:pb-32"
			>
				<motion.p
					variants={rise}
					className="font-display text-[11px] uppercase tracking-[0.34em] text-accent"
				>
					Shadow Garden · Component Registry
				</motion.p>

				{/* Self-inverting headline. `color: white` under difference resolves to
            near-black over the light surface and over the cube's white sticker
            faces, and to near-white over graphite — one declaration that reads
            correctly on every backdrop this hero can show, and shifts live as
            the cube turns. `text-ink` would invert backwards in light theme. */}
				<motion.h1
					variants={rise}
					className="mt-6 font-display text-hero uppercase leading-[0.95] tracking-[0.02em] text-white mix-blend-difference"
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
					className="pointer-events-auto mt-10 flex  items-center gap-3 font-display text-[10px] md:text-[11px] uppercase tracking-[0.15em]"
				>
					<Link
						href="/components"
						prefetch
						className="rounded-md bg-accent px-3 w-full sm:w-auto sm:px-5 flex items-center h-8 text-on-accent transition-colors hover:bg-accent-hover"
					>
						Enter the catalog
					</Link>
					<Link
						href="/cookbook"
						prefetch
						className="rounded-md border border-hairline w-full sm:w-auto px-3 sm:px-5  h-8 text-ink-dim transition-colors hover:border-accent-muted hover:text-ink inline-flex items-center gap-1.5"
					>
						the Cook Book
						<CookBookIcon className="size-5.5" aria-hidden />
					</Link>
				</motion.div>
			</motion.div>

			{/* Instrument readout — the actual prop values driving the field above. */}
			<div className="relative z-10 border-t border-hairline bg-surface/60 backdrop-blur-sm">
				<div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-3 py-3 font-display text-[10px] sm:px-6 uppercase tracking-[0.22em] text-ink-mute">
					{/* Names whichever field is actually mounted, and stays blank until
              one is — naming a field before the viewport is known would print
              the same wrong answer the backdrop itself used to render. The span
              appears from 640px while the swap is at 768px, so 640–768
              correctly reports Waves. */}
					<span className="hidden sm:inline">
						{isDesktop
							? `Field: RubiksCube · Turn ${hero.cube.moveDuration}ms · Scramble ${hero.cube.scrambleMoveCount}`
							: isMobile
								? `Field: Waves · Amp ${hero.waves.amplitude.toFixed(2)} · Dist ${hero.waves.distance.toFixed(2)}`
								: null}
					</span>
					<span className="w-full sm:w-auto">
						Registry {stats.total} units [{stats.free} free / {stats.pro} pro]
					</span>
				</div>
			</div>
		</section>
	);
}
