"use client";

import { useRef } from "react";
import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import CrossHair from "../icons/cross-hair";

gsap.registerPlugin(ScrollTrigger);

interface TeamMember {
	name: string;
	role: string;
	link: string;
	initials: string;
}

const teamMembers: TeamMember[] = [
	{
		name: "Haseeb Qureshi",
		role: "Managing Partner",
		link: "https://twitter.com/hosseeb",
		initials: "HQ",
	},
	{
		name: "Bo Feng",
		role: "Managing Partner",
		link: "https://www.linkedin.com/in/bo-feng-b8011490/",
		initials: "BF",
	},
	{
		name: "Tom Schmidt",
		role: "General Partner",
		link: "https://twitter.com/tomhschmidt",
		initials: "TS",
	},
	{
		name: "Rob Hadick",
		role: "General Partner",
		link: "https://twitter.com/HadickM",
		initials: "RH",
	},
	{
		name: "Gengmo Qi",
		role: "Partner",
		link: "https://twitter.com/0xsudogm",
		initials: "GQ",
	},
	{
		name: "Sanat Kapur",
		role: "Partner",
		link: "https://twitter.com/kapursanat",
		initials: "SK",
	},
	{
		name: "Omar Kanji",
		role: "Partner",
		link: "https://twitter.com/TheOneandOmsy",
		initials: "OK",
	},
	{
		name: "Lindsay Lin",
		role: "COO",
		link: "https://twitter.com/LindsayxLin",
		initials: "LL",
	},
	{
		name: "Casey Taylor",
		role: "Head of Portfolio Support",
		link: "https://twitter.com/casatay",
		initials: "CT",
	},
	{
		name: "Hildebert Mouli",
		role: "Head of Data Science",
		link: "https://twitter.com/hildobby",
		initials: "HM",
	},
];

export default function TeamSection() {
	const sectionRef = useRef<HTMLElement>(null);

	const still = useStill();
	// Reduced motion skips the reveal outright rather than running it at zero
	// duration: these tweens start from a hidden state, so a frozen timeline would
	// leave the section permanently blank.
	useGSAP(
		() => {
			if (still) return;
			const cards = gsap.utils.toArray<HTMLElement>(".team-card");
			const texts = gsap.utils.toArray<HTMLElement>(".team-text");
			if (cards.length === 0) return;

			// Title — reveals first as the section enters the viewport
			const title = sectionRef.current?.querySelector(".team-title");
			if (title) {
				gsap.fromTo(
					title,
					{ opacity: 0, y: -20 },
					{
						opacity: 1,
						y: 0,
						ease: "power2.out",
						scrollTrigger: {
							trigger: sectionRef.current,
							start: "top 85%",
							end: "top 65%",
							scrub: 1.5,
						},
					},
				);
			}

			const tl = gsap.timeline({
				scrollTrigger: {
					trigger: sectionRef.current,
					start: "top 90%",
					end: "bottom bottom",
					scrub: 1.5,
				},
			});

			cards.forEach((card, i) => {
				// Card image reveal — staggered by position in the timeline
				tl.fromTo(
					card,
					{ opacity: 0, y: 80 },
					{ opacity: 1, y: 0, ease: "power2.out", duration: 1 },
					i * 0.4, // ← each card starts 0.4 "units" after the previous
				);

				// Text (name + role) trails its card slightly
				if (texts[i]) {
					tl.fromTo(
						texts[i],
						{ opacity: 0, y: 20 },
						{ opacity: 1, y: 0, ease: "power2.out", duration: 0.6 },
						i * 0.4 + 0.5, // ← starts a bit after the card begins
					);
				}
			});
		},
		{ scope: sectionRef, dependencies: [still] },
	);

	return (
		<section
			ref={sectionRef}
			id="team"
			className="relative py-24x px-4 md:px-8"
		>
			{/* Section Header */}
			<div className="flex items-baseline gap-4 mb-12">
				<span className="text-[var(--muted)] font-medium text-sm">SEC-02</span>
				<div className="flex-1 h-px bg-[var(--muted)]/80" />
				<h2 className="section-title text-2xl md:text-3xl text-center">
					TEAMS
				</h2>
				<div className="flex-1 h-px bg-[var(--muted)]/80" />
			</div>

			{/* Horizontal Scroll Team */}
			<div className="team-scroll flex gap-6 lg:grid lg:grid-cols-3 xl:grid-cols-4 flex-wrap px-4 md:px-8 pb-8">
				{teamMembers.map((member) => (
					<a
						key={member.name}
						href={member.link}
						target="_blank"
						rel="noopener noreferrer"
						className="team-card group shrink-0 w-full max-w-[320px] md:max-w-100 bg-[var(--background)] p-2 relative group"
					>
						<div className="absolute top-0 w-full left-0 h-px bg-linear-to-r from-transparent via-[var(--accent)] to-transparent" />
						{/* Card image area — initials as the visual */}
						<div className="relative overflow-hidden bg-linear-to-br from-neutral-900 to-neutral-950  aspect-3/4 mb-4">
							{/* Centered initials */}
							<div className="absolute inset-0 flex items-center justify-center">
								<span className="text-7xl md:text-8xl font-serif font-light text-white/10 select-none tracking-widest group-hover:text-white/20 transition-colors duration-500">
									{member.initials}
								</span>
							</div>

							{/* Subtle radial glow behind initials on hover */}
							<div className="absolute inset-0 bg-radial-[ellipse_at_center] from-white/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

							{/* Crosshair icon — top right */}
							<div className="absolute top-4 right-4 flex items-center gap-2">
								<span className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 transition-opacity duration-300 absolute whitespace-nowrap -rotate-90 top-14 -right-9 font-[family-name:var(--font-body)]">
									Social Link
								</span>
								<CrossHair className="text-[var(--accent)] group-hover:rotate-45 transition-transform duration-300" />
							</div>
						</div>

						{/* Name + Role */}
						<div className="team-text">
							<h3 className=" text-sm md:text-base uppercase tracking-[0.15em] text-white group-hover:text-[var(--accent)] transition-colors duration-300 font-medium">
								{member.name}
							</h3>
							<p className="text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]/80 mt-0.5">
								{member.role}
							</p>
						</div>
					</a>
				))}
			</div>
		</section>
	);
}
