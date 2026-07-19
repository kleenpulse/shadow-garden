"use client";

import { motion, type Variants } from "motion/react";
import { cn } from "@/lib/utils";

interface LettersPullProps {
	text: string;
	className?: string;
	/** Per-letter animation duration, in seconds. */
	duration?: number;
	/** Stagger between successive letters, in seconds. */
	delay?: number;
	/** Rise distance each letter travels, in px. */
	yValue?: number;
	/** Starting blur each letter sharpens from, in px. */
	blur?: number;
	/** Skip the entrance and render letters settled. */
	reducedMotion?: boolean;
}

export default function LettersPull({
	text,
	className = "",
	duration = 0.5,
	delay = 0.05,
	yValue = 10,
	blur = 8,
	reducedMotion = false,
}: LettersPullProps) {
	const letters = text.split("");

	const pullupVariant: Variants = {
		initial: {
			y: yValue,
			opacity: 0,
			filter: `blur(${blur}px)`,
		},
		animate: (i: number) => ({
			y: 0,
			opacity: 1,
			filter: "blur(0px)",
			transition: {
				delay: i * delay,
				duration,
				ease: [0.22, 0.61, 0.36, 1] as const,
			},
		}),
	};

	return (
		<div className="flex justify-center" key={text}>
			{letters.map((letter, i) => (
				<motion.div
					key={i}
					variants={pullupVariant}
					initial={reducedMotion ? false : "initial"}
					animate="animate"
					custom={i}
					className={cn(className)}
				>
					{letter === " " ? <span>&nbsp;</span> : letter}
				</motion.div>
			))}
		</div>
	);
}
