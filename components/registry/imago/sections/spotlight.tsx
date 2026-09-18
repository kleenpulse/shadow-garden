import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import gsap from "gsap";
import { useRef, useState } from "react";
import { motion as m } from "motion/react";
import CrossHair from "../icons/cross-hair";

interface PortfolioItem {
	name: string;
	category: string;
}

const portfolioItems: PortfolioItem[] = [
	{ name: "AGORA", category: "CEFI" },
	{ name: "RAIN", category: "STABLECOINS" },
	{ name: "MONAD", category: "L1/L2S" },
	{ name: "ETHENA", category: "DEFI" },
	{ name: "MEGAETH", category: "L1/L2S" },
	{ name: "POLYMARKET", category: "INFRASTRUCTURE" },
];
export default function Spotlight() {
	const [hoveredText, setHoveredText] = useState("");
	const sectionRef = useRef<HTMLElement>(null);
	const still = useStill();
	// Reduced motion skips the reveal outright rather than running it at zero
	// duration: these tweens start from a hidden state, so a frozen timeline would
	// leave the section permanently blank.
	useGSAP(
		() => {
			if (still) return;
			const cards = gsap.utils.toArray<HTMLElement>(".portfolio-item");

			if (cards.length === 0) return;

			const tl = gsap.timeline({
				scrollTrigger: {
					trigger: sectionRef.current,
					start: "top bottom",
					end: "bottom 90%",
					scrub: 1,
				},
			});

			cards.forEach((card, i) => {
				tl.fromTo(
					card,
					{ opacity: 0, y: 100 },
					{ opacity: 1, y: 0, ease: "power2.out", duration: 0.7 },
					i * 0.1,
				);
			});
		},
		{ scope: sectionRef, dependencies: [still] },
	);
	return (
		<section
			ref={sectionRef}
			id="spotlight"
			className="relative pb-24 px-4 md:px-8"
		>
			{/* Spotlight Header */}

			<div className="flex items-baseline gap-4 mb-12">
				<span className="text-[var(--muted)] text-sm font-medium">SEC-04</span>
				<div className="flex-1 h-px bg-[var(--muted)]/80" />
				<h2 className="section-title text-2xl md:text-3xl text-center">
					SPOTLIGHT
				</h2>
				<div className="flex-1 h-px bg-[var(--muted)]/80" />
			</div>

			{/* Portfolio Items */}
			<div className="">
				{portfolioItems.map((item) => {
					const isActive = hoveredText === item.name;
					return (
						<div
							key={item.name}
							onMouseEnter={() => setHoveredText(item.name)}
							onMouseLeave={() => setHoveredText("")}
							className="portfolio-item relative group  gap-4  py-2x flex justify-between items-center md:pr-10 "
						>
							{hoveredText === item.name && (
								<m.div
									layoutId="spotlight-item"
									transition={{
										type: "spring",
										stiffness: 300,
										damping: 30,
									}}
									className="absolute size-full bg-[var(--accent)] z-0"
								/>
							)}
							<div className=" relative translate-x-0 group-hover:translate-x-8 flex  items-baseline gap-2  py-2 overflow-y-clip duration-500">
								<span className="font-[family-name:var(--font-display)]  text-4xl md:text-8xl tracking-tight  group-hover:text-black group-hover:transition-colors transition-transform  group-hover:duration-300">
									{item.name}
								</span>
								<span className="  text-xs group-hover:transition-colors  group-hover:duration-300 text-[var(--muted-foreground)] uppercase tracking-widest group-hover:text-black font-medium">
									{item.category}
								</span>
							</div>
							<span className="rotate-45 opacity-0 transition-all group-hover:opacity-100 group-hover:rotate-0 relative group-hover:duration-500 group-hover:delay-100">
								<CrossHair className="text-black size-8" />
							</span>
						</div>
					);
				})}
			</div>
		</section>
	);
}
