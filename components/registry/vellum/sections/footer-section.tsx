"use client";

import { useRef, useEffect } from "react";
import { useSectionViewState } from "../lib/stores/use-section-view";
import SplitText from "../miscellaneous/split-text";
import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import gsap from "gsap";
import EmailIcon from "../icons/email-icon";
import XIcon from "../icons/x-icon";
import AngleArrow from "../icons/angle-arrow";
import { useLenis } from "lenis/react";

export default function FooterSection() {
	const footerRef = useRef<HTMLDivElement>(null);
	const sectionRef = useRef<HTMLElement>(null);
	const setIsFooterInView = useSectionViewState(
		(state) => state.setIsFooterInView,
	);
	const lenis = useLenis();
	const handleClick = (link: string) => {
		if (!lenis) return;
		lenis.start();
		lenis.scrollTo(link, {
			duration: 2,
			easing: (t) => 1 - Math.pow(1 - t, 3),
			offset: -100,
		});
	};

	useEffect(() => {
		const handleScroll = () => {
			if (!footerRef.current) return;

			const rect = footerRef.current.getBoundingClientRect();
			const viewportHeight = window.innerHeight;

			// If footer is within viewport, consider it in view
			const isInView = rect.top < viewportHeight && rect.bottom > 0;
			setIsFooterInView(isInView);
		};

		window.addEventListener("scroll", handleScroll);
		window.addEventListener("resize", handleScroll);
		handleScroll(); // Call on mount

		return () => {
			window.removeEventListener("scroll", handleScroll);
			window.removeEventListener("resize", handleScroll);
		};
	}, [setIsFooterInView]);

	const still = useStill();
	// Reduced motion: never run the reveal. Every tween here starts at opacity
	// 0.1, so a skipped animation leaves the copy readable and a frozen one
	// would not.
	useGSAP(
		() => {
			if (still) return;
			const title = gsap.utils.toArray<HTMLElement>(".footer__title");
			const texts = gsap.utils.toArray<HTMLElement>(".footer__text");
			const cards = gsap.utils.toArray<HTMLElement>(".footer__card");

			texts.forEach((text) => {
				const words = text.querySelectorAll(".word");
				gsap.fromTo(
					words,
					{ opacity: 0.1 },
					{
						opacity: 1,
						stagger: 0.04,
						ease: "none",
						scrollTrigger: {
							trigger: text,
							start: "top 85%",
							end: "top 70%",
							scrub: true,
						},
					},
				);
			});

			title.forEach((el) => {
				const words = el.querySelectorAll(".word");
				gsap.fromTo(
					words,
					{ opacity: 0.1, y: 20 },
					{
						opacity: 1,
						y: 0,
						stagger: 0.04,
						ease: "none",
						scrollTrigger: {
							trigger: el,
							start: "top 90%",
							end: "bottom 75%",
							scrub: 1.2,
						},
					},
				);
			});

			cards.forEach((card) => {
				gsap.fromTo(
					card,
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
		<>
			<section ref={sectionRef} id="contact" className="relative py-24  z-10">
				<div className="relative z-10 max-w-4xl mx-auto px-6 text-center flex flex-col items-center">
					<h2
						className="text-5xl md:text-7xl  font-black uppercase tracking-tighter mb-4 footer__title"
						style={{
							color: "var(--foreground)",
							fontFamily: "var(--font-display)",
						}}
					>
						<SplitText>GET IN TOUCH</SplitText>
					</h2>

					<div
						className="flex items-center gap-6 sm:gap-10 text-sm font-medium"
						style={{ color: "var(--foreground)" }}
					>
						<a
							href="mailto:info@vellum.xyz"
							className="flex items-center gap-2 hover:opacity-70 md:text-xl footer__card"
						>
							<EmailIcon className="size-5" />
							Email: info@vellum.xyz
						</a>
						<a
							href="https://twitter.com/aventinelabs"
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-2 hover:opacity-70 md:text-xl footer__card"
						>
							<XIcon className="size-5" />
							@aventinelabs
						</a>
					</div>
				</div>
			</section>

			{/* Footer Nav & Copyright - Always dark matching reference */}
			<footer
				ref={footerRef}
				className="md:pt-16 pt-8 pb-8 relative z-10 "
				style={{ background: "#000000", color: "#FFFFFF" }}
			>
				<div className="px-4 md:px-12 flex flex-col-reverse md:flex-col items-center gap-y-8 md:gap-y-0">
					{/* Nav Links */}
					<div className="hidden md:flex  justify-center gap-x-4 md:gap-x-16 gap-y-4 mb-16">
						{["ABOUT", "PROJECTS", "PROCESS", "MODELS"].map((link) => (
							<button
								key={link}
								onClick={() => handleClick(`#${link.toLowerCase()}`)}
								className="group flex items-baseline gap-1.5 md:gap-4 text-xs sm:text-lg md:text-4xl font-bold uppercase transition-opacity hover:opacity-70 group"
								style={{ fontFamily: "var(--font-display)" }}
							>
								{link}
								<AngleArrow className="size-3 md:size-7 opacity-80 group-hover:translate-x-2 group-hover:-translate-y-2 transition-transform duration-500 group-hover:duration-100" />
							</button>
						))}
					</div>

					{/* Wordmark logo */}
					<span
						className="text-2xl md:text-4xl text-neutral-200  tracking-[0.4em] uppercase md:mb-8"
						style={{ fontFamily: "var(--font-display)" }}
					>
						VELLUM
					</span>

					{/* Copyright */}
					<p className="text-[8px] md:text-sm md:tracking-wider opacity-40 text-center">
						Copyright © 2026 Vellum Labs. All rights reserved.
						&quot;Vellum&quot; is a trademark of Vellum Labs.
					</p>
				</div>
			</footer>
		</>
	);
}
