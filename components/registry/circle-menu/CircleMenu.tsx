"use client";

import { useEffect, useRef, useState } from "react";
import { motion, type Variants } from "motion/react";
import { cn } from "@/lib/utils";

export interface CircleMenuProps {
	items: string[];
	defaultOpen?: boolean;
	/** Optional controlled mode. */
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	onItemClick?: (index: number) => void;
	/** Spring stiffness of the opening bloom — low values settle slowly. */
	openStiffness?: number;
	/** Item stagger in seconds. */
	stagger?: number;
	/** Item blur travel in px. */
	blur?: number;
	overlayColor?: string;
	overlayOpacity?: number;
	reducedMotion?: boolean;
	className?: string;
}

const ANCHOR_Y = 28; // px — the pill's center; the close spring collapses here.

function hexToRgba(hex: string, alpha: number): string {
	let h = hex.replace("#", "");
	if (h.length === 3) {
		h = h.split("").map((c) => c + c).join("");
	}
	const n = parseInt(h, 16);
	return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export default function CircleMenu({
	items,
	defaultOpen = false,
	open,
	onOpenChange,
	onItemClick,
	openStiffness = 20,
	stagger = 0.09,
	blur = 8,
	overlayColor = "#0a0a0c",
	overlayOpacity = 0.92,
	reducedMotion = false,
	className,
}: CircleMenuProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	const [internalOpen, setInternalOpen] = useState(defaultOpen);
	const isOpen = open ?? internalOpen;

	const setOpen = (next: boolean) => {
		setInternalOpen(next);
		onOpenChange?.(next);
	};

	// Cover radius from the measured pane, not 150vmax — panes aren't viewports.
	const [size, setSize] = useState({ w: 0, h: 0 });
	useEffect(() => {
		const el = rootRef.current;
		if (!el) return;
		const ro = new ResizeObserver(() => {
			setSize({ w: el.clientWidth, h: el.clientHeight });
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	const radius = Math.ceil(Math.hypot(size.w / 2, size.h / 2)) + 20;

	// Signature feel: the open bloom runs undamped with restDelta 2 (slow
	// settle); the close snaps back to the pill after the items leave.
	const overlay: Variants = reducedMotion
		? {
				open: { opacity: 1, transition: { duration: 0 } },
				closed: { opacity: 0, transition: { duration: 0 } },
			}
		: {
				open: {
					clipPath: `circle(${radius}px at 50% 50%)`,
					transition: { type: "spring", stiffness: openStiffness, restDelta: 2 },
				},
				closed: {
					clipPath: `circle(4px at 50% ${ANCHOR_Y}px)`,
					transition: { delay: 0.3, type: "spring", stiffness: 400, damping: 20 },
				},
			};

	const nav: Variants = reducedMotion
		? { open: {}, closed: {} }
		: {
				open: { transition: { staggerChildren: stagger, delayChildren: 0.2 } },
				closed: { transition: { staggerChildren: 0.05, staggerDirection: -1 } },
			};

	const item: Variants = reducedMotion
		? {
				open: { opacity: 1, transition: { duration: 0 } },
				closed: { opacity: 0, transition: { duration: 0 } },
			}
		: {
				open: {
					y: 0,
					rotate: 0,
					opacity: 1,
					filter: "blur(0px)",
					transition: {
						y: { stiffness: 1000, velocity: -100 },
						rotate: { stiffness: 1000, velocity: -100 },
					},
				},
				closed: {
					y: 50,
					rotate: 10,
					opacity: 0,
					filter: `blur(${blur}px)`,
					transition: {
						y: { stiffness: 1000 },
						rotate: { stiffness: 1000 },
					},
				},
			};

	return (
		<motion.div
			ref={rootRef}
			initial={false}
			animate={isOpen ? "open" : "closed"}
			className={cn(
				"pointer-events-none absolute inset-0 select-none",
				className,
			)}
		>
			<motion.div
				variants={overlay}
				className={cn(
					"absolute inset-0 backdrop-blur-sm",
					isOpen ? "pointer-events-auto" : "pointer-events-none",
				)}
				style={{ background: hexToRgba(overlayColor, overlayOpacity) }}
			/>
			<motion.ul
				variants={nav}
				className={cn(
					"absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-5",
					isOpen ? "pointer-events-auto" : "pointer-events-none",
				)}
			>
				{items.map((label, i) => (
					<li key={label} className="overflow-y-clip text-center">
						<motion.div
							variants={item}
							whileHover={reducedMotion ? undefined : { scale: 1.1 }}
							whileTap={reducedMotion ? undefined : { scale: 0.95 }}
						>
							<button
								type="button"
								onClick={() => {
									onItemClick?.(i);
									setOpen(false);
								}}
								className="text-2xl font-light uppercase tracking-wide text-white/90 md:text-4xl"
							>
								{label}
							</button>
						</motion.div>
					</li>
				))}
			</motion.ul>
			<button
				type="button"
				onClick={() => setOpen(!isOpen)}
				className="pointer-events-auto absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 backdrop-blur-sm transition-colors hover:border-white/35"
			>
				<span className="flex gap-1">
					{[0, 1, 2, 3, 4].map((i) => (
						<span
							key={i}
							className="h-1.5 w-1.5 rounded-full bg-white/70"
						/>
					))}
				</span>
				<span className="text-[10px] uppercase tracking-[0.28em] text-white/80">
					{isOpen ? "Close" : "Menu"}
				</span>
			</button>
		</motion.div>
	);
}
