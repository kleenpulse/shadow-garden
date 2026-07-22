"use client";

// Auto-hiding scrollbar container. The scrollbar is invisible by default and
// revealed only on hover or while actively scrolling (md+), tinted with the
// host's --sg-scroll token. Vendored from the app's AutoMaskVertical strategy
// so this component stays self-contained (no @/ imports).

import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";
import { cn } from "./util";

/** Base classes: thin, transparent-by-default, hover-revealed scrollbar.
 *  Usable on any scroll element (e.g. a <pre>) for hover-reveal without JS. */
export const autoScrollClasses =
	"scrollbar-thin max-md:scrollbar-none [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:transition-colors [scrollbar-color:transparent_transparent] [&::-webkit-scrollbar-thumb]:bg-transparent md:hover:[scrollbar-color:var(--sg-scroll)_transparent] md:hover:[&::-webkit-scrollbar-thumb]:bg-(--sg-scroll)";

// Extra reveal applied while actively scrolling (covers wheel/touchpad scroll
// with no pointer hover).
const revealClasses =
	"md:[scrollbar-color:var(--sg-scroll)_transparent] md:[&::-webkit-scrollbar-thumb]:bg-(--sg-scroll)";

export function AutoScroll({
	className,
	children,
	onScroll,
	...rest
}: ComponentPropsWithoutRef<"div">) {
	const [scrolling, setScrolling] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);

	return (
		<div
			{...rest}
			onScroll={(e) => {
				onScroll?.(e);
				setScrolling(true); // event handler, not an effect — reveal while scrolling
				if (timer.current) clearTimeout(timer.current);
				timer.current = setTimeout(() => setScrolling(false), 1000);
			}}
			className={cn(
				"overflow-y-auto",
				autoScrollClasses,
				scrolling && revealClasses,
				className,
			)}
		>
			{children}
		</div>
	);
}
