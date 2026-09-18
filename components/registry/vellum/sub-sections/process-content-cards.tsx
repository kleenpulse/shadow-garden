"use client";

import { useState } from "react";
import { PROCESS_STEPS } from "../lib/constants";
import { motion, AnimatePresence } from "motion/react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import SplitText from "../miscellaneous/split-text";
import ParticleCanvas from "./particle-canvas";

export default function ProcessContentCards() {
	const [activeIndex, setActiveIndex] = useState<number | null>(0);

	const toggleAccordion = (index: number) => {
		setActiveIndex(activeIndex === index ? null : index);
	};

	return (
		<div className="flex flex-col gap-4 md:grid md:grid-cols-2 lg:gap-8 items-stretch">
			<div className="flex flex-col w-full h-full gap-y-4">
				{PROCESS_STEPS.map((step, index) => {
					const isOpen = activeIndex === index;

					return (
						<div
							key={step.number}
							className="overflow-hidden process__card bg-[var(--card)] "
						>
							<button
								onClick={() => toggleAccordion(index)}
								disabled={activeIndex === index}
								className="w-full flex items-center justify-between py-6 md:py-8 px-4 text-left group transition-colors duration-300 hover:bg-[var(--card)]/5"
							>
								<h3
									className={cn(
										"text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight transition-all duration-300 process__text uppercase",
										isOpen
											? "text-[var(--foreground)]"
											: "text-[var(--foreground)]/90 group-hover:text-[var(--foreground)]",
									)}
									style={{ fontFamily: "var(--font-display)" }}
								>
									{step.title}
								</h3>
								<motion.div
									animate={{ rotate: isOpen ? 90 : 0 }}
									transition={{ duration: 0.3, ease: "easeInOut" }}
									className={cn(
										"transition-colors duration-300",
										isOpen
											? "text-[var(--foreground)]"
											: "text-[var(--foreground)]/80 group-hover:text-[var(--foreground)]",
									)}
								>
									<Plus
										className="size-8 md:size-10 lg:size-12"
										strokeWidth={1.5}
									/>
								</motion.div>
							</button>

							<AnimatePresence initial={false}>
								{isOpen && (
									<motion.div
										initial={{ height: 0, opacity: 0 }}
										animate={{ height: "auto", opacity: 1 }}
										exit={{ height: 0, opacity: 0 }}
										transition={{
											duration: 0.4,
											ease: [0.04, 0.62, 0.23, 0.98],
										}}
									>
										<div className="pb-8 md:pb-12 px-4 max-w-2xl">
											<p className="text-lg md:text-3xl text-[var(--foreground)]/70 leading-[1.2] md:leading-[1.4] font-light process__text">
												<SplitText>{step.description}</SplitText>
											</p>
										</div>
									</motion.div>
								)}
							</AnimatePresence>
						</div>
					);
				})}
			</div>
			<div className="hidden md:flex flex-col h-full bg-[var(--card)] overflow-hidden relative border border-[var(--border)]/10 rounded-xl">
				<div className="relative w-full h-full min-h-125 flex items-center justify-center bg-[var(--muted)]/30 dark:bg-black">
					<ParticleCanvas activeIndex={activeIndex} />
					<div className="absolute inset-0 bg-linear-to-t from-[var(--background)]/80 via-transparent to-transparent pointer-events-none" />
				</div>
			</div>
		</div>
	);
}
