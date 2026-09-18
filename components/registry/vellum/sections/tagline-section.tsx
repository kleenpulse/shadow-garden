"use client";

import { useSectionViewState } from "../lib/stores/use-section-view";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import SplitText from "../miscellaneous/split-text";

gsap.registerPlugin(ScrollTrigger);

export default function TaglineSection() {
	const taglineRef = useRef<HTMLDivElement>(null);
	const setIsHeroInView = useSectionViewState((state) => state.setIsHeroInView);
	const SITE_MASK_HEIGHT = 100;

	const handleScroll = () => {
		if (!taglineRef.current) return;

		const rect = taglineRef.current.getBoundingClientRect();
		const viewportHeight = window.innerHeight;
		const distanceFromBottom = viewportHeight - rect.bottom;

		const shouldHideMask =
			rect.top < viewportHeight && distanceFromBottom < SITE_MASK_HEIGHT;
		setIsHeroInView(shouldHideMask);
	};

	useEffect(() => {
		handleScroll();
		window.addEventListener("scroll", handleScroll);
		window.addEventListener("resize", handleScroll);
		return () => {
			window.removeEventListener("scroll", handleScroll);
			window.removeEventListener("resize", handleScroll);
		};
	}, []);

	const still = useStill();
	// Reduced motion: never run the reveal. Every tween here starts at opacity
	// 0.1, so a skipped animation leaves the copy readable and a frozen one
	// would not.
	useGSAP(
		() => {
			if (still) return;
			if (!taglineRef.current) return;
			const words = taglineRef.current.querySelectorAll(".word");

			gsap.fromTo(
				words,
				{ opacity: 0.1, y: 30 },
				{
					opacity: 1,
					y: 0,
					stagger: 0.05,
					ease: "power2.out",
					scrollTrigger: {
						trigger: taglineRef.current,
						start: "top 85%",
						end: "center center",
						scrub: 1,
					},
				},
			);
		},
		{ scope: taglineRef, dependencies: [still] },
	);

	return (
		<section
			ref={taglineRef}
			id="about"
			className="px-4 md:px-12 w-full mt-64 md:mt-80 relative z-10  text-left"
		>
			<div className="w-full">
				<p className="text-4xl md:text-[6vw] lg:text-[7vw] 2xl:text-[108px] font-light leading-tight tracking-tight text-[var(--foreground)]">
					<SplitText>
						We are a specialist Incubation and Advisory Firm.
					</SplitText>
				</p>
			</div>
		</section>
	);
}
