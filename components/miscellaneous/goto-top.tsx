"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { useLenis } from "lenis/react";
import { useUIStore } from "@/lib/store";

const GotoTop = () => {
	const [scrollY, setScrollY] = useState(0);
	const [hideToTop, setHideToTop] = useState(false);
	// A corner-anchored overlay (the cookbook section nav) outranks this button
	// for the same screen real estate. Unmount rather than fade — the class-driven
	// hide below carries `duration-1000`, which would linger over a panel that
	// opens in 420ms.
	const navOverlayOpen = useUIStore((state) => state.navOverlayOpen);
	const lenis = useLenis();

	const handleTop = () => {
		if (!lenis) {
			window.scrollTo({ top: 0, behavior: "smooth" });
			return;
		}

		lenis.scrollTo("#hero", {
			duration: 2,
			easing: (t) => 1 - Math.pow(1 - t, 3), // easeOutCubic
			offset: -100,
		});
	};

	useEffect(() => {
		let previousScrollPos = window.scrollY;
		setScrollY(previousScrollPos);
		const handleScroll = () => {
			const currentScrollPos = window.scrollY;
			setHideToTop(previousScrollPos < currentScrollPos);
			setScrollY(currentScrollPos);
			previousScrollPos = currentScrollPos;
		};
		window.addEventListener("scroll", handleScroll, { passive: true });
		return () => window.removeEventListener("scroll", handleScroll);
	}, []);

	return hideToTop || navOverlayOpen ? null : (
		<button
			type="button"
			aria-label="Scroll to top"
			onClick={handleTop}
			className={cn(
				"fixed right-2 bottom-12  z-9999 mx-auto grid size-10 max-w-360 place-items-center items-center rounded-full border border-accent bg-accent text-2xl mix-blend-difference transition-all duration-1000 select-none active:scale-95 active:duration-300 max-[400px]:bottom-16 sm:right-5 sm:bottom-16 sm:text-4xl",
				scrollY > 700
					? "translate-x-0 opacity-100 shadow-[0_0_40px_0_rgba(0,0,0,0.16)]"
					: "translate-x-20 opacity-0",
			)}
		>
			<div
				style={{
					backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke-width='2.5' stroke='black'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M18 15l-6-6-6 6'/%3E%3C/svg%3E")`,
				}}
				className="pointer-events-none size-8  transition-opacity duration-500"
			/>
		</button>
	);
};

export default GotoTop;
