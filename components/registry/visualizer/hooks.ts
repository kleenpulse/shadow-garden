"use client";

import * as React from "react";
import { useAnimationLoop } from "@/hooks/use-animation-loop";

/** Rounded width of an element; 0 until the first observation (SSR, first paint). */
export function useContainerWidth(ref: React.RefObject<HTMLElement | null>): number {
	const [width, setWidth] = React.useState(0);
	useAnimationLoop({
		target: ref,
		halted: true,
		paintWhenHalted: false,
		onResize: (m) => {
			// The measured box is in screen pixels; under a CSS `zoom` ancestor the
			// layout still runs in CSS pixels, or it lays out for the zoomed width and gets zoomed again.
			const next = Math.round(m.width / (ref.current?.currentCSSZoom || 1));
			setWidth((prev) => (prev === next ? prev : next));
		},
	});
	return width;
}

export type Visibility = {
	/** On screen now (assumed until an observer says otherwise). */
	inView: boolean;
	/** Has been on screen at least once. */
	seen: boolean;
	/** An observation has arrived, so the two flags above are real. */
	known: boolean;
};

export function useInView(ref: React.RefObject<Element | null>): Visibility {
	const [state, setState] = React.useState<Visibility>({ inView: true, seen: false, known: false });
	React.useEffect(() => {
		const el = ref.current;
		if (!el || typeof IntersectionObserver === "undefined") return;
		const io = new IntersectionObserver(
			([entry]) => {
				const inView = entry?.isIntersecting ?? true;
				setState((prev) => ({ inView, seen: prev.seen || inView, known: true }));
			},
			{ rootMargin: "40px" },
		);
		io.observe(el);
		return () => io.disconnect();
	}, [ref]);
	return state;
}

function subscribeVisibility(onChange: () => void) {
	document.addEventListener("visibilitychange", onChange);
	return () => document.removeEventListener("visibilitychange", onChange);
}

export function usePageVisible(): boolean {
	return React.useSyncExternalStore(
		subscribeVisibility,
		() => !document.hidden,
		() => true,
	);
}

function subscribeMinute(onChange: () => void) {
	const id = window.setInterval(onChange, 30_000);
	return () => window.clearInterval(id);
}

const minuteStamp = () => Math.floor(Date.now() / 60_000) * 60_000;

/** Client clock at minute resolution; null during SSR/hydration so times never mismatch. */
export function useNow(): number | null {
	return React.useSyncExternalStore(subscribeMinute, minuteStamp, () => null);
}
