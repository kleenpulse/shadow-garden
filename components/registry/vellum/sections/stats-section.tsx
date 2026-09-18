"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import StatCard from "../cards/stat-card";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cn } from "@/lib/utils";

gsap.registerPlugin(ScrollTrigger);
export default function StatsSection({ className }: { className?: string }) {
	const sectionRef = useRef<HTMLElement>(null);

	const still = useStill();
	// Reduced motion: never run the reveal. Every tween here starts at opacity
	// 0.1, so a skipped animation leaves the copy readable and a frozen one
	// would not.
	useGSAP(
		() => {
			if (still) return;
			const cards = gsap.utils.toArray<HTMLElement>(".stat__card");
			const texts = gsap.utils.toArray<HTMLElement>(".stat__text");
			if (cards.length === 0) return;

			const tl = gsap.timeline({
				scrollTrigger: {
					trigger: sectionRef.current,
					start: "top 90%",
					end: "bottom 70%",
					scrub: 1.2,
				},
			});

			cards.forEach((card, i) => {
				tl.fromTo(
					card,
					{ opacity: 0, y: 50 },
					{ opacity: 1, y: 0, ease: "power2.out", duration: 1 },
					i * 0.3,
				);

				// Text (name + role) trails its card slightly
				if (texts[i]) {
					tl.fromTo(
						texts[i],
						{ opacity: 0, y: 20 },
						{ opacity: 1, y: 0, ease: "power2.out", duration: 0.6 },
						i * 0.2 + 0.5, // ← starts a bit after the card begins
					);
				}
			});
		},
		{ scope: sectionRef, dependencies: [still] },
	);

	return (
		<section
			ref={sectionRef}
			className={cn("relative z-10 px-2 md:px-6  pt-5 md:pt-28", className)}
		>
			<div className="flex flex-col md:flex-row gap-3 md:gap-2 justify-center items-center">
				<StatCard value="$10B+" label="Value Created" delay={0} />
				<StatCard value="$100B+" label="Volume Generated" delay={0.1} />
				<StatCard value="1M+" label="Followers Acquired" delay={0.2} />
			</div>
		</section>
	);
}
