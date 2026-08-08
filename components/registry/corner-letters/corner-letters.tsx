"use client";

import { AnimatePresence, motion } from "motion/react";

export interface CornerLettersProps {
	/** One glyph per corner: top-left, top-right, bottom-left, bottom-right. */
	letters: string;
	visible?: boolean;
	stiffness?: number;
	blur?: number;
	scaleFrom?: number;
	/** Inset from the corners in px. */
	offset?: number;
	/** Font size in px. */
	size?: number;
	color?: string;
	reducedMotion?: boolean;
}

const CORNERS = [
	{ id: "tl", style: { top: 0, left: 0 } },
	{ id: "tr", style: { top: 0, right: 0 } },
	{ id: "bl", style: { bottom: 0, left: 0 } },
	{ id: "br", style: { bottom: 0, right: 0 } },
] as const;

export default function CornerLetters({
	letters,
	visible = true,
	stiffness = 120,
	blur = 8,
	scaleFrom = 1.5,
	offset = 4,
	size = 32,
	color = "#a855f7",
	reducedMotion = false,
}: CornerLettersProps) {
	const glyphs = Array.from(letters).slice(0, 4);

	const hidden = reducedMotion
		? { opacity: 0 }
		: { opacity: 0, filter: `blur(${blur}px)`, scale: scaleFrom };
	const shown = reducedMotion
		? { opacity: 1 }
		: { opacity: 1, filter: "blur(0px)", scale: 1 };

	return (
		<div className="pointer-events-none absolute inset-0 select-none">
			<AnimatePresence>
				{visible &&
					glyphs.map((glyph, i) => (
						<motion.span
							key={CORNERS[i].id}
							initial={hidden}
							animate={{
								...shown,
								transition: reducedMotion
									? { duration: 0 }
									: {
											type: "spring",
											stiffness,
											delay: 0.1 + i * 0.06,
										},
							}}
							exit={{
								...hidden,
								transition: reducedMotion
									? { duration: 0 }
									: { duration: 0.35, delay: i * 0.04 },
							}}
							className="absolute font-light leading-none"
							style={{
								...CORNERS[i].style,
								margin: offset,
								fontSize: size,
								color,
							}}
						>
							{glyph}
						</motion.span>
					))}
			</AnimatePresence>
		</div>
	);
}
