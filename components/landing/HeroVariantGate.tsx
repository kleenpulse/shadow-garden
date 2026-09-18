"use client";

import { useRef } from "react";
import { useReducedMotion } from "motion/react";
import { useLenis } from "lenis/react";
import CubeTraveler from "@/components/landing/CubeTraveler";
import type { LandingData } from "@/components/landing/data";
import LandingHero from "@/components/landing/LandingHero";
import type { RubiksCubeHandle } from "@/components/landing/rubiks-cube";
import { useHeroVariant } from "@/hooks/use-hero-variant";
import { useMediaQuery } from "@/hooks/use-media-query";

interface HeroVariantGateProps {
	stats: { total: number };
	hero: LandingData["hero"];
}

// Decides which hero runs, on the client, from the URL store — never from
// searchParams, so `/` stays a static page. Reduced motion collapses every
// variant to classic: a cube that rides the scroll is exactly the motion that
// preference asks not to have. Below md the traveler never mounts (the cube is
// not part of the mobile hero at all), so the toggle is hidden there too.
export default function HeroVariantGate({ stats, hero }: HeroVariantGateProps) {
	const [urlVariant, setVariant] = useHeroVariant();
	const reduce = useReducedMotion() ?? false;
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const variant = reduce ? "classic" : urlVariant;
	const cubeRef = useRef<RubiksCubeHandle>(null);
	// Resolved here, where the subscription is made in the first commit, and
	// handed down — the traveler mounts too late to resolve it itself (see the
	// note on its `lenis` prop).
	const lenis = useLenis();

	return (
		<>
			{variant !== "classic" && isDesktop ? (
				<CubeTraveler hero={hero} cubeRef={cubeRef} lenis={lenis} />
			) : null}
			<LandingHero
				stats={stats}
				hero={hero}
				variant={variant}
				travelerRef={cubeRef}
				onVariantChange={setVariant}
				canToggle={!reduce}
			/>
		</>
	);
}
