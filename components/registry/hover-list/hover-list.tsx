"use client";

import { useId, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface HoverListItem {
	label: string;
	meta?: string;
}

export interface HoverListProps {
	items: HoverListItem[];
	highlightColor?: string;
	/** Text and icon color while a row is highlighted. */
	invertedColor?: string;
	stiffness?: number;
	damping?: number;
	/** How far the row content slides right on hover, in px. */
	indent?: number;
	textSize?: "sm" | "md" | "lg";
	showIcon?: boolean;
	/** Highlight corner radius in px. */
	rounded?: number;
	reducedMotion?: boolean;
	className?: string;
}

const TEXT_SIZES = {
	sm: "text-xl md:text-3xl",
	md: "text-3xl md:text-5xl",
	lg: "text-4xl md:text-7xl",
} as const;

function CrossHair({ size }: { size: number }) {
	return (
		<svg width={size} height={size} viewBox="0 0 14 14" fill="none">
			<circle cx="7" cy="7" r="2" fill="currentColor" />
			<line x1="7" y1="0" x2="7" y2="4" stroke="currentColor" strokeWidth="1.5" />
			<line x1="7" y1="10" x2="7" y2="14" stroke="currentColor" strokeWidth="1.5" />
			<line x1="0" y1="7" x2="4" y2="7" stroke="currentColor" strokeWidth="1.5" />
			<line x1="10" y1="7" x2="14" y2="7" stroke="currentColor" strokeWidth="1.5" />
		</svg>
	);
}

export default function HoverList({
	items,
	highlightColor = "#a855f7",
	invertedColor = "#000000",
	stiffness = 300,
	damping = 30,
	indent = 32,
	textSize = "md",
	showIcon = true,
	rounded = 0,
	reducedMotion = false,
	className,
}: HoverListProps) {
	// Namespaced so two lists on one page never trade highlights.
	const uid = useId();
	const [hovered, setHovered] = useState(-1);

	const rowTransition = reducedMotion
		? "none"
		: "transform 0.5s cubic-bezier(0.22, 0.61, 0.36, 1), color 0.3s";

	return (
		<div className={className}>
			{items.map((item, i) => {
				const isActive = hovered === i;
				return (
					<div
						key={item.label}
						onMouseEnter={() => setHovered(i)}
						onMouseLeave={() => setHovered(-1)}
						className="relative flex items-center justify-between gap-4 pr-2 md:pr-6"
					>
						{isActive && (
							<motion.div
								layoutId={`${uid}-highlight`}
								transition={
									reducedMotion
										? { duration: 0 }
										: { type: "spring", stiffness, damping }
								}
								className="absolute inset-0 z-0"
								style={{
									backgroundColor: highlightColor,
									borderRadius: rounded,
								}}
							/>
						)}
						<div
							className="relative flex items-baseline gap-3 overflow-y-clip py-2"
							style={{
								transform: `translateX(${isActive ? indent : 0}px)`,
								transition: rowTransition,
							}}
						>
							<span
								className={cn("tracking-tight", TEXT_SIZES[textSize])}
								style={{
									color: isActive ? invertedColor : undefined,
									transition: reducedMotion ? "none" : "color 0.3s",
								}}
							>
								{item.label}
							</span>
							{item.meta && (
								<span
									className="text-xs font-medium uppercase tracking-widest opacity-60"
									style={{
										color: isActive ? invertedColor : undefined,
										transition: reducedMotion ? "none" : "color 0.3s",
									}}
								>
									{item.meta}
								</span>
							)}
						</div>
						{showIcon && (
							<span
								className="relative"
								style={{
									color: invertedColor,
									opacity: isActive ? 1 : 0,
									transform: `rotate(${isActive ? 0 : 45}deg)`,
									transition: reducedMotion
										? "none"
										: "opacity 0.4s, transform 0.5s 0.1s",
								}}
							>
								<CrossHair size={28} />
							</span>
						)}
					</div>
				);
			})}
		</div>
	);
}
