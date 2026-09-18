"use client";

import { MODELS } from "../lib/constants";
import SplitText from "../miscellaneous/split-text";
import { useRef } from "react";
import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import gsap from "gsap";
import PlusGridCanvas from "../sub-sections/plus-grid-canvas";
import { useDimensions } from "../hooks/use-dimensions";
import { useIsDark } from "../hooks/use-is-dark";

export default function ModelsSection() {
	const sectionRef = useRef<HTMLElement>(null);
	const { width } = useDimensions();
	const isMobile = width < 768;
	const [isDark] = useIsDark();

	const still = useStill();
	// Reduced motion: never run the reveal. Every tween here starts at opacity
	// 0.1, so a skipped animation leaves the copy readable and a frozen one
	// would not.
	useGSAP(
		() => {
			if (still) return;
			const title = gsap.utils.toArray<HTMLElement>(".model__title");
			const cards = gsap.utils.toArray<HTMLElement>(".model__card");
			const cardText = gsap.utils.toArray<HTMLElement>(".model__text");
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
							start: "top 85%", // Animation starts when card top hits % down the viewport
							end: isMobile ? "top 70%" : "top 40%", // Animation completes when card top reaches % down the viewport
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
					end: "bottom 90%",
					scrub: 1.5,
				},
			});

			cards.forEach((card, i) => {
				// Card image reveal — staggered by position in the timeline
				tl.fromTo(
					card,
					{ opacity: 0, y: 180 },
					{ opacity: 1, y: 0, ease: "power2.out", duration: 1 },
					i * 0.4, // ← each card starts 0.4 "units" after the previous
				);
			});
		},
		{ scope: sectionRef, dependencies: [still] },
	);

	return (
		<section
			ref={sectionRef}
			id="models"
			className="py-16 md:py-24 relative z-10 bg-[var(--card)]"
		>
			<div className="px-4 md:px-6">
				{/* Heading */}
				<h2
					className="text-5xl md:text-7xl lg:text-[127px] font-black leading-none tracking-tighter uppercase mb-4  model__title"
					style={{
						color: "var(--foreground)",
						fontFamily: "var(--font-display)",
					}}
				>
					<SplitText>COMMERCIAL MODELS</SplitText>
				</h2>

				{/* Model rows */}
				<div className="flex flex-col divide-y divide-[var(--border)]">
					{MODELS.map((model) => (
						<div
							key={model.id}
							className="md:grid flex flex-col md:grid-cols-2 gap-8 md:gap-16 text-[var(--foreground)] py-12 model__card"
						>
							{/* Left: text */}
							<div className="flex flex-col gap-3 md:gap-4 text-[var(--foreground)]">
								<h3
									className="text-3xl md:text-5xl font-bold  uppercase tracking-tight model__text"
									style={{
										fontFamily: "var(--font-display)",
									}}
								>
									<SplitText>{model.name}</SplitText>
								</h3>
								<p className="text-lg md:text-2xl font-medium model__text">
									<SplitText>{model.subtitle}</SplitText>
								</p>
								<p className="text-lg md:text-2xl  model__text">
									<SplitText>{model.description}</SplitText>
								</p>
							</div>

							<PlusGridCanvas
								config={{
									fontSize: 50,
									color: isDark ? "#ffffff" : "#242424",
								}}
								className="w-full h-67.5 md:h-full "
							/>

							<div className="flex w-full justify-end col-span-2">
								<div className="flex flex-col items-end text-right">
									<span className="text-2xl font-[family-name:var(--font-display)] font-bold tracking-widest uppercase mb-2 model__text">
										<SplitText>IDEAL FOR:</SplitText>
									</span>
									<p className="text-lg md:text-2xl  max-w-xs model__text">
										<SplitText>{model.idealFor}</SplitText>
									</p>
								</div>
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
