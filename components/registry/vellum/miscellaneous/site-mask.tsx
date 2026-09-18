"use client";

import { useSectionViewState } from "../lib/stores/use-section-view";
import { useEffect, useState } from "react";
import GradualBlurMemo from "./gradual-blur";
import { cn } from "@/lib/utils";
export default function SiteMask() {
	const [isMounted, setIsMounted] = useState(false);
	const isProjectGridInView = useSectionViewState(
		(state) => state.isProjectGridInView,
	);
	const isFooterInView = useSectionViewState((state) => state.isFooterInView);
	const isHeroInView = useSectionViewState((state) => state.isHeroInView);

	const shouldHideMask = isProjectGridInView || isFooterInView || isHeroInView;

	// The blur is five stacked layers, each with its own `backdrop-filter` AND its
	// own mask. That is among the most expensive things a compositor can be asked
	// to do, and `opacity: 0` does not buy any of it back — a fully transparent
	// layer is still a layer, still composited, still re-blurring its backdrop on
	// every frame the page behind it repaints. With a canvas animating underneath,
	// that is sixty readbacks a second to render nothing.
	//
	// So the stack unmounts rather than fading to nothing. The fade still plays;
	// the unmount just follows it one beat later.
	const [blurMounted, setBlurMounted] = useState(true);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setIsMounted(true);
	}, []);

	useEffect(() => {
		if (!shouldHideMask) {
			setBlurMounted(true);
			return;
		}
		// Just past the 150ms fade-out, so the layers leave after they are invisible
		// rather than blinking out mid-transition.
		const timer = setTimeout(() => setBlurMounted(false), 220);
		return () => clearTimeout(timer);
	}, [shouldHideMask]);

	if (!isMounted) return null;

	return (
		<>
			{blurMounted && (
				<GradualBlurMemo
					target="page"
					position="bottom"
					height="6.5rem"
					strength={2}
					divCount={5}
					curve="bezier"
					exponential
					opacity={1}
					className={cn(
						"transition-opacity! max-md: hidden!",
						shouldHideMask
							? "opacity-0! duration-150"
							: "opacity-100! duration-300",
					)}
				/>
			)}
			<div
				className="fixed max-md: hidden! w-full bottom-0 h-28 bg-linear-to-b from-transparent via-transparent to-[var(--background)] left-0 z-99 pointer-events-none transition-opacity duration-300"
				style={{ opacity: shouldHideMask ? 0 : 1 }}
			/>
		</>
	);
}
