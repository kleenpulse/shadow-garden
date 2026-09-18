"use client";

import { BrandMark } from "../miscellaneous/brand-mark";
import StatsSection from "../sections/stats-section";
import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { useSectionViewState } from "../lib/stores/use-section-view";
import { projects } from "../lib/constants";
import { ProjectCardBack } from "../cards/project-card-back";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import ProjectSectionHeader from "../sub-sections/project-section-header";
import { useDimensions } from "../hooks/use-dimensions";
import { useFlipCardStore } from "../lib/stores/use-flip-card";

export type Project = {
	id: string;
	name: string;
	bg: string;
	link: string;
	description: string;
	category: string;
};

const TABS = [
	{ key: "platform", label: "PLATFORM" },
	{ key: "consumer", label: "CONSUMER" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

gsap.registerPlugin(ScrollTrigger);

function FlipCard({
	project,
	isMobile,
}: {
	project: Project;
	isMobile: boolean;
}) {
	const innerRef = useRef<HTMLDivElement>(null);
	const flippedId = useFlipCardStore((s) => s.flippedId);
	const setFlippedId = useFlipCardStore((s) => s.setFlippedId);
	const isFlipped = flippedId === project.id;

	useEffect(() => {
		if (!innerRef.current) return;
		gsap.to(innerRef.current, {
			rotateY: isFlipped ? 180 : 0,
			duration: 0.55,
			ease: "power3.inOut",
		});
	}, [isFlipped]);

	const open = useCallback(
		() => setFlippedId(project.id),
		[project.id, setFlippedId],
	);
	const close = useCallback(() => setFlippedId(null), [setFlippedId]);

	useEffect(() => {
		if (!isFlipped) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") close();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [isFlipped, close]);

	return (
		<div
			className="project-card w-full h-full "
			style={{ perspective: "1200px" }}
			// Desktop — flip on hover
			onMouseEnter={!isMobile ? open : undefined}
			onMouseLeave={!isMobile ? close : undefined}
			// Mobile — flip on tap
			onClick={isMobile ? (isFlipped ? close : open) : undefined}
		>
			<div
				ref={innerRef}
				className="w-full h-full relative"
				style={{ transformStyle: "preserve-3d" }}
			>
				{/* FRONT */}
				<div
					className="front-face absolute inset-0 w-full h-full group overflow-hidden"
					style={{ backfaceVisibility: "hidden" }}
				>
					<div className="w-full h-full relative transition-transform duration-500 ease-out group-hover:scale-98">
						<div
							className="absolute inset-0 grid place-items-center"
							style={{ backgroundColor: project.bg }}
						>
							<BrandMark
								name={project.name}
								color="var(--accent)"
								className="block w-2/5 [&>svg]:size-full"
							/>
						</div>
					</div>
				</div>

				{/* BACK */}
				<div
					className="back-face absolute inset-0 w-full h-full overflow-hidden"
					style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
				>
					<div className="w-full h-full" onClick={(e) => e.stopPropagation()}>
						<ProjectCardBack project={project} onClose={close} />
					</div>
				</div>
			</div>
		</div>
	);
}

export default function ProjectsSection() {
	const projectGridRef = useRef<HTMLDivElement>(null);
	const sectionRef = useRef<HTMLElement>(null);

	const setIsProjectGridInView = useSectionViewState(
		(s) => s.setIsProjectGridInView,
	);
	const setFlippedId = useFlipCardStore((s) => s.setFlippedId);

	const { width } = useDimensions();
	const isMobile = width < 768;
	const [activeTab, setActiveTab] = useState<TabKey>("platform");

	const filteredProjects = useMemo(
		() => projects.filter((p) => p.category === activeTab),
		[activeTab],
	);
	const SITE_MASK_HEIGHT = 40;

	const handleScroll = useCallback(() => {
		if (!projectGridRef.current) return;
		const rect = projectGridRef.current.getBoundingClientRect();
		const distanceFromBottom = window.innerHeight - rect.bottom;
		const inView =
			rect.top < window.innerHeight && distanceFromBottom < SITE_MASK_HEIGHT;

		setIsProjectGridInView(inView);

		// Collapse any open card when the section scrolls out of view
		if (!inView) setFlippedId(null);
	}, [setIsProjectGridInView, setFlippedId]);

	useEffect(() => {
		handleScroll();
		window.addEventListener("scroll", handleScroll, { passive: true });
		window.addEventListener("resize", handleScroll, { passive: true });
		return () => {
			window.removeEventListener("scroll", handleScroll);
			window.removeEventListener("resize", handleScroll);
		};
	}, [handleScroll]);

	const still = useStill();
	// Reduced motion: never run the reveal. Every tween here starts at opacity
	// 0.1, so a skipped animation leaves the copy readable and a frozen one
	// would not.
	useGSAP(
		() => {
			if (still) return;
			const cards = gsap.utils.toArray<HTMLElement>(".project-card");
			const texts = gsap.utils.toArray<HTMLElement>(".project-label");
			const projectText = gsap.utils.toArray<HTMLElement>(".project__text");

			projectText.forEach((card) => {
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
							start: isMobile ? "top 85%" : "top 75%",
							end: isMobile ? "top 70%" : "top 40%",
							scrub: true,
						},
					},
				);
			});

			const tl = gsap.timeline({
				scrollTrigger: {
					trigger: sectionRef.current,
					start: "top 90%",
					end: isMobile ? "bottom 90%" : "bottom bottom",
					scrub: 1.5,
				},
			});

			cards.forEach((card, i) => {
				tl.fromTo(
					card,
					{ opacity: 0, y: 40 },
					{ opacity: 1, y: 0, ease: "power2.out", duration: 1 },
					isMobile ? i * 0.1 : i * 0.2,
				);
				if (texts[i])
					tl.fromTo(
						texts[i],
						{ opacity: 0, y: 10 },
						{ opacity: 1, y: 0, ease: "power2.out", duration: 0.6 },
						i * 0.2 + 0.3,
					);
			});
		},
		{ scope: sectionRef, dependencies: [still] },
	);

	return (
		<section
			ref={sectionRef}
			id="projects"
			className="pb-4 md:pb-16 relative z-10"
		>
			<ProjectSectionHeader />

			<div className="flex flex-col gap-y-4">
				<StatsSection className="pt-4 md:pt-0" />

				<div ref={projectGridRef} className="px-2 md:px-6 relative z-999">
					{/* Category Tabs */}
					<div className="flex items-center mb-0 md:px-4">
						{TABS.map((tab) => (
							<button
								key={tab.key}
								onClick={() => {
									setActiveTab(tab.key);
									setFlippedId(null);
								}}
								className={`px-6 md:px-10 py-3 md:py-4 text-sm md:text-2xl font-bold font-[family-name:var(--font-display)] tracking-wider uppercase transition-all duration-300 cursor-pointer ${
									activeTab === tab.key
										? "bg-neutral-100 dark:bg-[#0a1628] text-[var(--foreground)]"
										: "bg-neutral-200/60 dark:bg-[#060e1c] text-[var(--muted-foreground)]/40 hover:text-[var(--muted-foreground)]/70"
								}`}
							>
								{tab.label}
							</button>
						))}
					</div>

					<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-1 md:gap-x-3 gap-y-2 md:gap-y-8 md:py-6 md:px-4 md:bg-neutral-50 md:dark:bg-[var(--background)] md:border border-neutral-100 md:dark:border-none">
						{filteredProjects.map((project) => (
							<div key={project.id} className="flex flex-col gap-y-3">
								<div className="relative" style={{ aspectRatio: "1 / 1" }}>
									<FlipCard project={project as Project} isMobile={isMobile} />
								</div>
								<div className="project-label text-xs sm:text-sm md:text-2xl lg:text-[28px] font-medium tracking-tighter md:tracking-tight text-[var(--muted-foreground)] cursor-default transition-opacity duration-300 dark:opacity-80">
									{project.name}
								</div>
							</div>
						))}

						{/* +++ AND MORE */}
						<div className="flex flex-col gap-y-3">
							<div
								className="project-card flex flex-col items-center justify-center cursor-default"
								style={{
									background: "#000A1D",
									aspectRatio: "1 / 1",
									width: "100%",
								}}
							>
								<div className="flex flex-col items-center text-white md:text-4xl">
									<span className="mb-1">+++</span>
									<span className="tracking-widest">AND MORE</span>
								</div>
							</div>
							<div className="h-5" />
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
