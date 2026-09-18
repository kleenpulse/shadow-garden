"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMenuStore } from "../lib/store";
import { cn } from "@/lib/utils";

const CORNER_LETTERS = [
	{
		id: "top-left",
		letter: "B",
		classname: "top-0 left-1",
	},
	{
		id: "bottom-left",
		letter: "L",
		classname: "bottom-0 left-1",
	},
	{
		id: "bottom-right",
		letter: "Y",
		classname: "bottom-0  right-1",
	},
	{
		id: "top-right",
		letter: "R",
		classname: "top-0 right-1 scale-x-[-1]",
	},
];

export default function CornerLetters() {
	const isMenuOpen = useMenuStore((state) => state.isOpen);

	return (
		<AnimatePresence mode="wait">
			{!isMenuOpen && (
				<>
					{CORNER_LETTERS.map((cl) => (
						<motion.span
							key={cl.id}
							initial={{
								opacity: 0,
								filter: "blur(8px)",
								scale: 1.5,
								transition: { delay: 0.1 },
							}}
							animate={{
								opacity: 1,
								filter: "blur(0px)",
								scale: 1,
								transition: {
									duration: 0.5,
									type: "spring",
									stiffness: 120,

									delay: 0.7,
								},
							}}
							exit={{
								opacity: 1,
								filter: "blur(8px)",
								scale: 1.5,
								transition: { delay: 0.1 },
							}}
							className={cn(
								"fixed z-100 font-[family-name:var(--font-display)] font-light text-2xl md:text-4xl leading-none ",
								cl.classname,
							)}
						>
							{cl.letter}
						</motion.span>
					))}
					{/* Top Left */}
				</>
			)}
		</AnimatePresence>
	);
}
