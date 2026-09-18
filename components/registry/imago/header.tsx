"use client";

import { useRef } from "react";
import { motion, type Variants } from "motion/react";
import { useDimensions } from "./hooks/use-dimensions";
import { LettersPull } from "./miscellaneous/letter-pull";
import { MENU_ITEMS } from "./lib/constants";
import { useLenis } from "lenis/react";
import { useMenuStore } from "./lib/store";

const sidebar: Variants = {
	open: {
		clipPath: `circle(150vmax at 50% 50%)`,
		transition: {
			type: "spring" as const,
			stiffness: 20,
			restDelta: 2,
		},
	},
	closed: {
		clipPath: "circle(3px at 50% 40px)",
		transition: {
			delay: 0.3,
			type: "spring" as const,
			stiffness: 400,
			damping: 20,
		},
	},
};

export const Header = () => {
	const containerRef = useRef(null);
	const { height } = useDimensions(containerRef);
	const { isOpen, toggle } = useMenuStore();

	return (
		<motion.nav
			initial={false}
			animate={isOpen ? "open" : "closed"}
			custom={height}
			ref={containerRef}
			className="fixed inset-0 pointer-events-none z-50 select-none"
		>
			<motion.div
				data-open={isOpen}
				className="absolute transition-[background,backdrop-filter] inset-0 data-[open=true]:bg-[var(--background)]/50 bg-[var(--background)]/90 backdrop-blur-xs pointer-events-auto data-[open=false]:pointer-events-none"
				variants={sidebar}
			/>
			<Navigation toggle={toggle} isOpen={isOpen} />
			<MenuToggle isOpen={isOpen} toggle={toggle} />
		</motion.nav>
	);
};

export const MenuToggle = ({
	toggle,
	isOpen,
}: {
	toggle: () => void;
	isOpen: boolean;
}) => (
	<button
		onClick={toggle}
		className="fixed top-0 left-1/2 -translate-x-1/2 z-60 pointer-events-auto group flex justify-center px-4 py-4 md:px-8"
	>
		<div className="flex items-center gap-2 bg-[var(--background)]/80 backdrop-blur-sm border hover:border-[var(--accent)]/30 border-muted-dark rounded-full px-4 py-2">
			<span className="text-xs text-[var(--muted-foreground)]">{">"}</span>
			<span className="text-xs">|</span>
			<span className="text-xs text-[var(--muted-foreground)]">{"<"}</span>
			<div className="flex gap-0.5 mx-4">
				{[1, 2, 3, 4, 5].map((i) => (
					<div key={i} className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
				))}
			</div>

			<LettersPull
				text={isOpen ? "Close" : "Menu"}
				className="text-xs uppercase tracking-widest group-hover:text-[var(--accent)] transition-colors font-medium"
			/>
		</div>
	</button>
);

const nav_variants: Variants = {
	open: {
		transition: { staggerChildren: 0.09, delayChildren: 0.2 },
	},
	closed: {
		transition: { staggerChildren: 0.05, staggerDirection: -1 },
	},
};
export const Navigation = ({
	toggle,
	isOpen,
}: {
	toggle: () => void;
	isOpen: boolean;
}) => (
	<motion.ul
		variants={nav_variants}
		data-open={isOpen}
		className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-6 pointer-events-auto data-[open=false]:pointer-events-none"
	>
		{MENU_ITEMS.map((menu) => (
			<div key={menu.label} className="overflow-y-clip">
				<MenuItem menu={menu} toggle={toggle} />
			</div>
		))}
	</motion.ul>
);

const item_variants: Variants = {
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
		filter: "blur(8px)",
		transition: {
			y: { stiffness: 1000 },
			rotate: { stiffness: 1000 },
		},
	},
};

export const MenuItem = ({
	menu,
	toggle,
}: {
	menu: (typeof MENU_ITEMS)[number];
	toggle: () => void;
}) => {
	const lenis = useLenis();

	const handleClick = (
		e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
		link: string,
	) => {
		if (!lenis) return;
		e.preventDefault();
		toggle();
		lenis.scrollTo(link, {
			duration: 2,
			easing: (t) => 1 - Math.pow(1 - t, 3), // easeOutCubic
			offset: -100,
		});
	};
	return (
		<motion.li
			variants={item_variants}
			whileHover={{ scale: 1.1 }}
			whileTap={{ scale: 0.95 }}
			className="text-center"
		>
			<button
				onClick={(e) => handleClick(e, menu.href)}
				className="text-4xl md:text-7xl  uppercase tracking-wide font-light hover:text-[var(--accent)] transition-colors"
			>
				{menu.label}
			</button>
		</motion.li>
	);
};
