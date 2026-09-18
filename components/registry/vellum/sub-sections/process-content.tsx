import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import gsap from "gsap";
import SplitText from "../miscellaneous/split-text";
import { useRef } from "react";
import ProcessContentCards from "./process-content-cards";
import { useDimensions } from "../hooks/use-dimensions";

export default function ProcessContent() {
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
			const title = gsap.utils.toArray<HTMLElement>(".process__title");
			const cards = gsap.utils.toArray<HTMLElement>(".process__card");
			const cardText = gsap.utils.toArray<HTMLElement>(".process__text");
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
							start: "top 80%", // Animation starts when card top hits % down the viewport
							end: isMobile ? "top 70%" : "top 60%", // Animation completes when card top reaches % down the viewport
							scrub: true,
						},
					},
				);
			});

			title.forEach((card) => {
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
			if (cards.length === 0) return;
			const tl = gsap.timeline({
				scrollTrigger: {
					trigger: sectionRef.current,
					start: "top 90%",
					end: "bottom 95%",
				},
			});

			cards.forEach((card) => {
				tl.fromTo(
					card,
					{ opacity: 0, y: 180 },
					{ opacity: 1, y: 0, ease: "power2.out", duration: 1 },
				);
			});
		},
		{ scope: sectionRef, dependencies: [still] },
	);
	return (
		<section ref={sectionRef} className="pt-14">
			{/* Heading */}
			<h2
				className="text-5xl md:text-7xl lg:text-[127px] font-black leading-none tracking-tighter uppercase mb-4  process__title"
				style={{
					color: "var(--foreground)",
					fontFamily: "var(--font-display)",
				}}
			>
				<SplitText>OUR PROCESS</SplitText>
			</h2>

			{/* 2×2 Grid */}
			<ProcessContentCards />
		</section>
	);
}
