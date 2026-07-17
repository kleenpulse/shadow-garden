"use client";
import { cn } from "@/lib/utils";
import { motion, type Variants } from "framer-motion";

export function LettersPull({
	text,
	className = "",
	duration = 0.4,
	delay = 0.05,
	yValue = 10,
}: {
	text: string;
	className?: string;
	duration?: number;
	delay?: number;
	yValue?: number;
}) {
	const splittedText = text.split("");

	const pullupVariant: Variants = {
		initial: {
			y: yValue,
			opacity: 0,
			filter: "blur(8px)",
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
			{splittedText.map((current, i) => (
				<motion.div
					key={i}
					variants={pullupVariant}
					initial="initial"
					animate="animate"
					custom={i}
					className={cn("text-sm", className)}
				>
					{current == " " ? <span>&nbsp;</span> : current}
				</motion.div>
			))}
		</div>
	);
}
