"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Fragment, useEffect, useRef, type RefObject } from "react";

if (typeof window !== "undefined") {
	gsap.registerPlugin(ScrollTrigger);
}

interface WordRevealProps {
	children: string;
	className?: string;
	/** Offset between successive words along the scrub, in seconds. */
	stagger?: number;
	/** Rise distance per word, in px. */
	yOffset?: number;
	/** Resting opacity of unrevealed words. */
	fromOpacity?: number;
	/** Smoothing lag between scroll and reveal, in seconds. */
	scrub?: number;
	/** GSAP ease applied along the scrub. */
	ease?: string;
	/** ScrollTrigger start position. */
	start?: string;
	/** ScrollTrigger end position. */
	end?: string;
	/** Overflow element that hosts the scroll — required when the text lives
	 *  inside a scrollable pane instead of the page. Must be set before mount. */
	scrollerRef?: RefObject<HTMLElement | null>;
	/** Skip the scroll binding and render words at full opacity. */
	reducedMotion?: boolean;
}

export default function WordReveal({
	children,
	className,
	stagger = 0.05,
	yOffset = 30,
	fromOpacity = 0.1,
	scrub = 1,
	ease = "power2.out",
	start = "top 85%",
	end = "center center",
	scrollerRef,
	reducedMotion = false,
}: WordRevealProps) {
	const rootRef = useRef<HTMLParagraphElement>(null);
	const words = children.split(" ").filter(Boolean);

	useEffect(() => {
		const root = rootRef.current;
		if (!root || reducedMotion) return;

		const ctx = gsap.context(() => {
			gsap.fromTo(
				root.querySelectorAll(".word"),
				{ opacity: fromOpacity, y: yOffset },
				{
					opacity: 1,
					y: 0,
					stagger,
					ease,
					scrollTrigger: {
						trigger: root,
						scroller: scrollerRef?.current ?? undefined,
						start,
						end,
						scrub,
					},
				},
			);
		}, root);

		return () => ctx.revert();
	}, [
		children,
		stagger,
		yOffset,
		fromOpacity,
		scrub,
		ease,
		start,
		end,
		scrollerRef,
		reducedMotion,
	]);

	return (
		<p ref={rootRef} className={className}>
			{words.map((word, index) => (
				<Fragment key={`${word}-${index}`}>
					<span className="word inline-block">{word}</span>
					{index < words.length - 1 && " "}
				</Fragment>
			))}
		</p>
	);
}
