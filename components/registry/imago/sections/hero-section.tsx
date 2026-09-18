"use client";

import { useMenuStore } from "../lib/store";
import useWindowHeight from "../hooks/use-window-height";
import { LettersPull } from "../miscellaneous/letter-pull";
import { StyledCard } from "../ui/styled-card";

export default function HeroSection() {
	const isMenuOpen = useMenuStore((state) => state.isOpen);

	const { scrollY } = useWindowHeight();

	return (
		<section
			id="hero"
			className="relative min-h-screen flex flex-col items-center justify-center overflow-hiddenx px-4"
		>
			{/* Sun/Light Ray Effect */}
			<div className="pointer-events-none absolute inset-0 z-0 hidden md:flex justify-center">
				<div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-[var(--accent)]/15 blur-[120px] rounded-full mix-blend-screen animate-fade-in" />

				<div
					className="absolute top-[-10%] left-[-10%] w-[120%] h-[150%] origin-top-left -rotate-15 bg-linear-to-br from-[var(--accent)]/15 via-[var(--accent)]/5 to-transparent blur-3xl mix-blend-screen animate-fade-in opacity-0"
					style={{ animationDelay: "500ms", animationFillMode: "forwards" }}
				/>

				<div
					className="absolute top-[-20%] left-[-10%] w-[60%] h-[150%] origin-top-left -rotate-25 bg-linear-to-br from-white/10 via-white/5 to-transparent blur-2xl mix-blend-overlay animate-fade-in opacity-0"
					style={{ animationDelay: "700ms", animationFillMode: "forwards" }}
				/>
			</div>

			<LettersPull
				text={
					!isMenuOpen && scrollY > 10
						? "FLY"
						: isMenuOpen
							? "••••••••"
							: "IMAGO"
				}
				duration={1}
				delay={0.1}
				yValue={40}
				className="relative z-10 text-[var(--accent)] font-[family-name:var(--font-display)]  text-[16vw] md:text-[10vw] lg:text-[17vw] 2xl:text-[13vw] leading-none tracking-tight select-none glow-accent"
			/>

			{/* Coming Soon Notice */}
			<div className="absolute bottom-32 left-4 md:left-8 max-w-sm z-20 overflow-y-clip">
				<StyledCard
					data-menu={isMenuOpen || scrollY > 50}
					className="w-full transition-all data-[menu=true]:rotate-12 data-[menu=true]:scale-90 data-[menu=false]:scale-100 data-[menu=false]:rotate-0 data-[menu=true]:translate-y-40 data-[menu=false]:translate-y-0 duration-1000 data-[menu=false]:delay-700 data-[menu=true]:delay-0 data-[menu=true]:blur-2xl data-[menu=false]:blur-0  "
				>
					<p className=" text-xs font-medium">🦋IMAGO 2.0 COMING SOON</p>
					<p className="text-xs text-[var(--muted-foreground)] leading-[1.1] font-light">
						IMAGO is getting a refresh. The site is under construction.
						Check back soon for more updates.
					</p>
				</StyledCard>
			</div>


			{/* Scroll indicator */}
			<div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-20">
				<div className="flex flex-col items-center gap-2 animate-bounce">
					<div className="w-px h-8 bg-linear-to-b from-transparent to-[var(--accent)]/50" />
				</div>
			</div>
		</section>
	);
}
