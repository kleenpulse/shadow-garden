import { MENU_ITEMS } from "../lib/constants";
import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import gsap from "gsap";
import { useRef } from "react";
import SplitText from "../model/split-text";
import { useLenis } from "lenis/react";

export default function Footer() {
	const sectionRef = useRef<HTMLElement>(null);
	const lenis = useLenis();

	const handleClick = (link: string) => {
		if (!lenis) return;

		lenis.scrollTo(link, {
			duration: 2,
			easing: (t) => 1 - Math.pow(1 - t, 3), // easeOutCubic
			offset: -100,
		});
	};

	const still = useStill();
	// Reduced motion skips the reveal outright rather than running it at zero
	// duration: these tweens start from a hidden state, so a frozen timeline would
	// leave the section permanently blank.
	useGSAP(
		() => {
			if (still) return;
			const cards = gsap.utils.toArray<HTMLElement>(".footer__info");

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
							start: "top bottom", // Animation starts when card top hits % down the viewport
							end: "bottom 95%", // Animation completes when card top reaches % down the viewport
							scrub: 1,
						},
					},
				);
			});
		},
		{ scope: sectionRef, dependencies: [still] },
	);

	return (
		<footer
			ref={sectionRef}
			className="relative py-24  md:mb-20 px-4 md:px-8 border-t border-muted-dark"
		>
			<div className="w-full mx-auto">
				{/* Footer Navigation */}
				<div className="grid grid-cols-2 md:grid-cols-3 gap-8 mb-24">
					{/* Sections */}
					<div>
						<h4 className="section-title font-medium text-sm mb-6 ">
							SECTIONS
						</h4>
						<nav className="flex flex-col gap-3">
							{MENU_ITEMS.map((menu) => (
								<button
									key={menu.label}
									onClick={() => handleClick(menu.href)}
									className="text-sm hover:text-[var(--accent)] transition-colors link-underline relative w-fit"
								>
									{menu.label}
								</button>
							))}
						</nav>
					</div>

					{/* Connect */}
					<div>
						<h4 className="section-title font-medium text-sm mb-6">CONNECT</h4>
						<nav className="flex flex-col gap-3">
							<a
								href="https://x.com/butterfly_xyz"
								target="_blank"
								rel="noopener noreferrer"
								className="text-sm hover:text-[var(--accent)] transition-colors"
							>
								X
							</a>
							<a
								href="https://www.linkedin.com/company/imago-capital-partners/"
								target="_blank"
								rel="noopener noreferrer"
								className="text-sm hover:text-[var(--accent)] transition-colors"
							>
								LINKEDIN
							</a>
							<a
								href="https://writing.imago.xyz/"
								target="_blank"
								rel="noopener noreferrer"
								className="text-sm hover:text-[var(--accent)] transition-colors"
							>
								WRITING
							</a>
						</nav>
					</div>

					{/* Legal */}
					<div>
						<h4 className="section-title font-medium text-sm mb-6">LEGAL</h4>
						<nav className="flex flex-col gap-3">
							<a
								href="/legal/terms"
								className="text-sm hover:text-[var(--accent)] transition-colors"
							>
								TERMS
							</a>
							<a
								href="/legal/disclosures"
								className="text-sm hover:text-[var(--accent)] transition-colors"
							>
								DISCLOSURES
							</a>
						</nav>
					</div>
				</div>

				{/* Info Section */}
				<div className="border-t border-muted-dark pt-12 footer__info">
					<SplitText>INFO</SplitText>
					<p className="font-serif text-xl md:text-2xl text-[var(--muted-foreground)]/80 leading-relaxed font-light max-w-3xl italic">
						<SplitText>
							imago is a metamorphic design practice. We back the best
							researchers and builders who will push the entire crypto ecosystem
							forward.
						</SplitText>
					</p>
				</div>

				{/* Copyright */}
				<div className="absolute right-3 bottom-50 flex justify-end">
					<span className="  text-xs text-[var(--muted-foreground)] uppercase font-medium transform -rotate-90 origin-right">
						<SplitText>imago CAPITAL 2026</SplitText>
					</span>
				</div>
			</div>
		</footer>
	);
}
