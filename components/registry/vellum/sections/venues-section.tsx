/* eslint-disable react/jsx-no-comment-textnodes */
"use client";

import { useRef } from "react";
import ScrollVelocity from "../sub-sections/scroll-velocity";
import { PARTNERS } from "../lib/constants";
import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import gsap from "gsap";

import SplitText from "../miscellaneous/split-text";
import { useDimensions } from "../hooks/use-dimensions";

export default function VenuesSection() {
	const sectionRef = useRef<HTMLElement>(null);
	const { width } = useDimensions();
	const isMobile = width < 768;

	const still = useStill();
	// Reduced motion: never run the reveal. Every tween here starts at opacity
	// 0.1, so a skipped animation leaves the copy readable and a frozen one
	// would not.
	useGSAP(
		() => {
			if (still) return;
			const cards = gsap.utils.toArray<HTMLElement>(".venue-card");
			const cardText = gsap.utils.toArray<HTMLElement>(".venue__text");
			cardText.forEach((card) => {
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
							start: isMobile ? "top 85%" : "top 75%", // Animation starts when card top hits % down the viewport
							end: isMobile ? "top 70%" : "top 40%", // Animation completes when card top reaches % down the viewport
							scrub: true,
						},
					},
				);
			});

			cards.forEach((card) => {
				const words = card.querySelectorAll(".word");

				gsap.fromTo(
					words,
					{ opacity: 0.1, y: 20 },
					{
						opacity: 1,
						y: 0,
						stagger: 0.04,
						ease: "none",
						scrollTrigger: {
							trigger: card,
							start: "top 90%",
							end: "bottom 75%",
							scrub: 1.2,
						},
					},
				);
			});
		},
		{ scope: sectionRef, dependencies: [still] },
	);

	return (
		<section ref={sectionRef} className="py-16 md:py-24 relative z-10 ">
			<div className=" px-2 md:px-6 ">
				{/* Section Header */}
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-4">
					<div>
						<h2
							className="text-5xl md:text-7xl lg:text-[127px] font-black leading-none tracking-tighter uppercase mb-4 venue-card"
							style={{
								color: "var(--foreground)",
								fontFamily: "var(--font-display)",
							}}
						>
							<SplitText>TRUSTED PARTNERS</SplitText>
						</h2>
						<p className="text-2xl md:text-3xl max-w-89.5 md:max-w-195.25 text-[var(--muted-foreground)] leading-[1.1] venue__text">
							<SplitText>
								Integrated across the exchanges, chains, and infrastructure that
								power crypto.
							</SplitText>
						</p>
					</div>
				</div>

				{/* Category tabs */}
				<div className="py-4 mb-0 flex items-center flex-wrap gap-x-6 md:gap-x-12 lg:gap-x-16">
					{["EXCHANGES", "CHAINS", "INFRASTRUCTURE"].map((tab, idx) => (
						<div
							key={tab}
							className="flex items-center gap-6 md:gap-12 lg:gap-16 venue__text md:text-[45px]"
						>
							<SplitText>{tab}</SplitText>

							{!(idx === 2) && (
								<span className="text-[var(--muted-foreground)]/50">
									<SplitText>//</SplitText>
								</span>
							)}
						</div>
					))}
				</div>

				<ScrollVelocity venues={PARTNERS} className="venue-card" />
			</div>
		</section>
	);
}
