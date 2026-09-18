"use client";

import { useRef } from "react";
import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { StyledCard } from "../ui/styled-card";
import SplitText from "../model/split-text";

gsap.registerPlugin(ScrollTrigger);

export default function AboutSection() {
	const sectionRef = useRef<HTMLElement>(null);

	const still = useStill();
	// Reduced motion skips the reveal outright rather than running it at zero
	// duration: these tweens start from a hidden state, so a frozen timeline would
	// leave the section permanently blank.
	useGSAP(
		() => {
			if (still) return;
			const cards = gsap.utils.toArray<HTMLElement>(".about-card");

			cards.forEach((card) => {
				const words = card.querySelectorAll(".word");

				gsap.fromTo(
					words,
					{ opacity: 0.1 },
					{
						opacity: 1,
						stagger: 0.04,
						ease: "none",
						scrollTrigger: {
							trigger: card,
							start: "top 80%", // Animation starts when card top hits % down the viewport
							end: "top 40%", // Animation completes when card top reaches % down the viewport
							scrub: true,
						},
					},
				);
			});
		},
		{ scope: sectionRef, dependencies: [still] },
	);

	return (
		<section
			id="about"
			className="relative py-24 px-4 md:px-8"
			ref={sectionRef}
		>
			<div className="flex items-baseline gap-4 mb-24">
				<span className="text-[var(--muted)] font-medium text-sm">SEC-01</span>
				<div className="flex-1 h-px bg-[var(--muted)]/80" />
				<h2 className="section-title text-2xl md:text-3xl text-center">
					ABOUT
				</h2>
				<div className="flex-1 h-px bg-[var(--muted)]/80" />
			</div>

			<div className="w-full mx-auto">
				<div className="grid md:grid-cols-2 gap-12 md:gap-24">
					<StyledCard className="about-card">
						<span className="section-marker font-medium md:text-xl mb-4 block uppercase">
							<SplitText>Commitment</SplitText>
						</span>
						<p className="text-lg md:text-xl text-[var(--muted-foreground)] leading-relaxed">
							<SplitText>
								Committed like the imago that braves every season, we stay
								adaptive and focused. Our promise is to carry ideas on fragile
								wings, navigating change with grace and resilience to help
								projects find new growth and transformation.
							</SplitText>
						</p>
					</StyledCard>

					<StyledCard className="about-card">
						<span className="section-marker font-medium md:text-xl mb-4 block">
							<SplitText>ETHOS</SplitText>
						</span>
						<p className="text-base md:text-lg text-[var(--muted-foreground)] leading-relaxed">
							<SplitText>
								The imago has evolved to endure every season. Each of its
								four wings moves independently, giving it extraordinary agility.
								Selectively aggressive, the imago uses 360-degree vision to
								spot movement and intercept prey mid-air. It may be small and
								unassuming, but it is not to be underestimated. Few hunters in
								the animal kingdom match its success rate.
							</SplitText>
						</p>
					</StyledCard>
				</div>
			</div>
		</section>
	);
}
