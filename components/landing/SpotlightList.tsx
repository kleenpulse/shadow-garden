"use client";

import { useId, useState } from "react";
import Link from "next/link";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import CrossHair from "../icons/cross-hair";

export interface SpotlightItem {
	slug: string;
	name: string;
	tag: string;
	tagTone?: "default" | "accent";
}

// bench = themed surfaces, semantic tokens only (light mode must keep working).
// sealed = ProSection's static graphite ground, which hardcodes its palette by
// design (same rule as .shiki-wrap) — so this variant matches that convention.
const VARIANTS = {
	bench: {
		border: "border-hairline",
		fill: "bg-accent",
		text: "text-ink",
		textOn: "text-on-accent",
		tagIdle: "text-ink-mute",
		tagAccent: "text-accent",
	},
	sealed: {
		border: "border-bench-700",
		fill: "bg-[#a855f7]",
		text: "text-bench-100",
		textOn: "text-bench-950",
		tagIdle: "text-bench-500",
		tagAccent: "text-bench-950",
	},
} as const;

// Spotlight index rows: big display name + tiny tag, with a single spring-
// animated fill that slides between rows via a shared layoutId. The layoutId
// is scoped per list instance — several lists share the page, and a global id
// would fly the fill across sections.
export default function SpotlightList({
	items,
	variant = "bench",
	className,
}: {
	items: SpotlightItem[];
	variant?: keyof typeof VARIANTS;
	className?: string;
}) {
	const id = useId();
	const [hovered, setHovered] = useState<string | null>(null);

	const v = VARIANTS[variant];

	return (
		<ul
			className={cn("border-t", v.border, className)}
			onMouseLeave={() => setHovered(null)}
		>
			{items.map((item, i) => {
				const isHovered = hovered === item.slug;
				return (
					// Initial style never branches on the motion preference — SSR can't
					// know it, so branching causes hydration mismatches. Reduced motion
					// lands the same animation instantly instead (same as Reveal.tsx).
					<motion.li
						key={item.slug}
						initial={{ opacity: 0, y: 20 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true, margin: "-40px" }}
						transition={{
							duration: 0.5,
							delay: i * 0.06,
							ease: [0.22, 1, 0.36, 1],
						}}
					>
						<Link
							href={`/components/${item.slug}`}
							onMouseEnter={() => setHovered(item.slug)}
							onFocus={() => setHovered(item.slug)}
							onBlur={() => setHovered(null)}
							className={cn(
								"group relative flex items-center justify-between gap-6 border-b px-2 py-4 outline-none sm:px-4",
								v.border,
							)}
						>
							{isHovered && (
								<motion.span
									aria-hidden
									layoutId={`${id}-fill`}
									transition={{ type: "spring", stiffness: 300, damping: 30 }}
									className={cn("absolute inset-0", v.fill)}
								/>
							)}
							<span
								className={cn(
									"relative z-10 flex flex-col items-start gap-1 transition-transform duration-300 sm:flex-row sm:items-baseline sm:gap-3",
									isHovered && "translate-x-4 duration-500",
								)}
							>
								<span
									className={cn(
										"font-display text-xl uppercase tracking-tight transition-colors duration-200 md:text-4xl",
										isHovered ? v.textOn : v.text,
									)}
								>
									{item.name}
								</span>
								<span
									className={cn(
										"font-display text-[10px] uppercase tracking-[0.22em] transition-colors duration-200",
										isHovered
											? v.textOn
											: item.tagTone === "accent"
												? v.tagAccent
												: v.tagIdle,
									)}
								>
									{item.tag}
								</span>
							</span>
							<CrossHair
								aria-hidden
								className={cn(
									"relative z-10 size-4 transition-all  md:size-5",
									isHovered
										? cn("rotate-90 opacity-100 duration-500", v.textOn)
										: "rotate-0 opacity-0 duration-200",
								)}
							/>
						</Link>
					</motion.li>
				);
			})}
		</ul>
	);
}
