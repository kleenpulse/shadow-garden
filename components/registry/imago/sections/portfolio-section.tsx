"use client";

import { Fragment, useRef } from "react";
import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { StyledCard } from "../ui/styled-card";

gsap.registerPlugin(ScrollTrigger);

type SplitTextProps = {
	children: string;
};

function SplitText({ children }: SplitTextProps) {
	const words = children.split(" ").filter(Boolean);

	return (
		<>
			{words.map((word, index) => (
				<Fragment key={`${word}-${index}`}>
					<span key={`${word}-${index}`} className="word">
						{word}
					</span>
					{index < words.length - 1 && " "}
				</Fragment>
			))}
		</>
	);
}

export default function Portfolio() {
	const portfolioRef = useRef<HTMLElement>(null);

	const still = useStill();
	// Reduced motion skips the reveal outright rather than running it at zero
	// duration: these tweens start from a hidden state, so a frozen timeline would
	// leave the section permanently blank.
	useGSAP(
		() => {
			if (still) return;
			const cards = gsap.utils.toArray<HTMLElement>(".portfolio-card");

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
							start: "top 90%", // Animation starts when card top hits % down the viewport
							end: "top 50%", // Animation completes when card top reaches % down the viewport
							scrub: true,
						},
					},
				);
			});
		},
		{ scope: portfolioRef, dependencies: [still] },
	);

	return (
		<section
			id="portfolio"
			className="relative py-24 px-4 md:px-8"
			ref={portfolioRef}
		>
			<div className="flex items-baseline gap-4 mb-24">
				<span className="text-[var(--muted)] text-sm font-medium">SEC-03</span>
				<div className="flex-1 h-px bg-[var(--muted)]/80" />
				<h2 className="section-title text-2xl md:text-3xl text-center uppercase">
					Portfolio
				</h2>
				<div className="flex-1 h-px bg-[var(--muted)]/80" />
			</div>

			<div className="w-full mx-auto">
				<div className="grid md:grid-cols-2 gap-12 md:gap-24">
					<StyledCard className="portfolio-card">
						<span className="section-marker font-medium md:text-xl mb-4 block uppercase">
							<SplitText>Design & Development</SplitText>
						</span>
						<p className="text-lg md:text-xl text-[var(--muted-foreground)] leading-relaxed">
							<SplitText>
								We craft digital experiences that transform ideas into reality.
								From stunning visual designs to robust, scalable applications,
								we blend creativity with technical excellence. Every project we
								undertake is built with precision and purpose, creating digital
								products that captivate and convert.
							</SplitText>
						</p>
					</StyledCard>

					<StyledCard className="portfolio-card">
						<span className="section-marker font-medium md:text-xl mb-4 block">
							<SplitText>Our Approach</SplitText>
						</span>
						<p className="text-base md:text-lg text-[var(--muted-foreground)] leading-relaxed">
							<SplitText>
								We take a strategic, collaborative approach to every engagement.
								Understanding your vision and goals, we design solutions that
								are not only beautiful but also performant and user-centric. Our
								work spans web design, interactive experiences, brand identity,
								and full-stack development—all guided by innovation and
								attention to detail.
							</SplitText>
						</p>
					</StyledCard>
				</div>
			</div>
		</section>
	);
}
