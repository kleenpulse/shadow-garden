"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { useLenis } from "lenis/react";
import { useUIStore } from "@/lib/store";

const GotoTop = () => {
	const [scrollY, setScrollY] = useState(0);
	const [hideToTop, setHideToTop] = useState(false);
	const t = useTranslations("chrome.gotoTop");
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

	// The circle is painted three times, one fixed sibling per blend layer, so
	// the blend result can only land between the accent and black — never the
	// green that raw `difference` makes of purple over white. Accent is the
	// resting color; black only appears where the backdrop itself is
	// accent-colored (difference with itself cancels to zero), which is exactly
	// where an accent circle would vanish:
	//   1 accent  difference   accent-distance of the backdrop; accent bg → black
	//   2 accent  color        locks hue + saturation to the accent
	//   3 accent  darken       caps the ceiling at the accent, floor at black
	// They must be siblings, not children of the button: the button's
	// z-index/transform forms a stacking context, which would isolate a child's
	// mix-blend-mode to the button's own (transparent) backdrop. An element's
	// own blend is unaffected by its own stacking context, so each fixed layer
	// still blends against the page. The `contents` wrapper carries `group` so
	// :active on the button (which propagates to ancestors) scales all layers
	// in lockstep.
	const layer = cn(
		"pointer-events-none fixed end-2 bottom-12 z-9999 size-10 rounded-full transition-all duration-1000 group-active:scale-95 group-active:duration-300 max-[400px]:bottom-16 sm:end-5 sm:bottom-16",
		scrollY > 700 ? "translate-x-0 opacity-100" : "translate-x-20 opacity-0",
	);

	return hideToTop || navOverlayOpen ? null : (
		<div className="group contents">
			<span aria-hidden className={cn(layer, "bg-accent mix-blend-difference")} />
			<span aria-hidden className={cn(layer, "bg-accent mix-blend-color")} />
			<span aria-hidden className={cn(layer, "bg-accent mix-blend-darken")} />
			<button
				type="button"
				aria-label={t("scrollToTop")}
				onClick={handleTop}
				className={cn(
					layer,
					"pointer-events-auto grid place-items-center select-none",
					scrollY > 700 && "shadow-[0_0_40px_0_rgba(0,0,0,0.16)]",
				)}
			>
				<div
					style={{
						backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke-width='2.5' stroke='white'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M18 15l-6-6-6 6'/%3E%3C/svg%3E")`,
					}}
					className="pointer-events-none size-8 transition-opacity duration-500"
				/>
			</button>
		</div>
	);
};

export default GotoTop;
