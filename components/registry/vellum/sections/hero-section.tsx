"use client";

import { motion } from "motion/react";
import InteractiveWorldMap from "../miscellaneous/interactive-world-map";
import AngleArrow from "../icons/angle-arrow";
import TaglineSection from "./tagline-section";

export default function HeroSection() {
	return (
		<section className="relative mt-16 md:mt-12 md:pt-40 md:pb-3 flex flex-col items-center justify-center min-h-dvh">
			{/* Interactive Particle Map */}
			<InteractiveWorldMap />

			{/* Subtle radial glow overlay */}
			<div
				className="absolute inset-0 pointer-events-none opacity-0 dark:opacity-100 transition-opacity duration-1000"
				style={{
					background:
						"radial-gradient(ellipse 70% 50% at 50% 50%, rgba(80,120,200,0.1) 0%, transparent 70%)",
				}}
			/>

			{/* Content */}
			<div className="relative mt-42 md:mt-14 z-10 text-center md:px-6 w-full max-w-192.5 mx-auto pointer-events-none">
				{/* Headline */}
				<motion.h1
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.7, delay: 0.2 }}
					className="text-5xl md:text-7xl  leading-tight tracking-tight mb-4 md:mb-10 font-[family-name:var(--font-display)]"
				>
					BUILDING WHAT COMES NEXT
				</motion.h1>

				{/* CTA Button */}
				<motion.div
					initial={{ opacity: 0, y: 16 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, delay: 0.4 }}
				>
					<a
						href="#contact"
						className="inline-flex items-baseline gap-2 md:gap-3 px-8 md:px-10 py-4 rounded-full text-lg md:text-2xl font-medium transition-all duration-200 cursor-pointer dark:bg-white bg-[#1B263B] text-white dark:text-black group hover:opacity-90 pointer-events-auto"
					>
						Get in Touch{" "}
						<span className="group-hover:translate-x-2 group-hover:-translate-y-2 transition-transform duration-500 group-hover:duration-100">
							<AngleArrow className="size-3 md:size-4" />
						</span>
					</a>
				</motion.div>
			</div>
			<TaglineSection />
		</section>
	);
}
