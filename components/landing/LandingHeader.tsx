"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import {
	animate,
	useMotionValue,
	useMotionValueEvent,
	type AnimationPlaybackControls,
} from "motion/react";
import { useLenis } from "lenis/react";
import ThemeToggle from "@/components/shell/ThemeToggle";
import Wordmark from "@/components/Wordmark";
import { cn } from "@/lib/utils";

// Fixed landing header: wordmark + theme control in one bar. Transparent over
// the hero, then gains a blurred surface once scrolled so it stays legible
// against the lighter content below. It also gets out of the way: scrolling
// down pushes it off the top edge, scrolling up brings it back.

const EASE = [0.22, 1, 0.36, 1] as const;
// The settle is not scroll-driven, so an eased tween is right here.
const SETTLE = { duration: 0.25, ease: EASE } as const;
// Sub-pixel scroll jitter must not flip the latched direction.
const DIRECTION_DEADZONE = 1;

export default function LandingHeader() {
	const [scrolled, setScrolled] = useState(false);

	// Scroll-driven hide. `offset` is how many px the header is pushed up and it
	// tracks the scroll pixel-for-pixel — the scroll is the engine, there is no
	// timed hide/show. 0 is fully visible, `height` fully gone.
	const headerRef = useRef<HTMLDivElement>(null);
	const offset = useMotionValue(0);
	const lastScroll = useRef<number | null>(null);
	// Last latched scroll direction; decides which way an idle header settles.
	const direction = useRef<1 | -1>(-1);
	const settle = useRef<AnimationPlaybackControls | null>(null);
	// Cached so the scroll callback never forces layout.
	const height = useRef(0);

	// Written straight to the DOM from inside the Lenis frame so the header moves
	// in the same frame as the page. A `style={{ y }}` render subscription would
	// land on motion's frameloop, one rAF late, and visibly trail the scroll.
	// Safe against the className's `transition-colors`: that transitions colour
	// only, so it never tweens (and never lags) these transform writes.
	useMotionValueEvent(offset, "change", (v) => {
		const el = headerRef.current;
		if (el) el.style.transform = v === 0 ? "" : `translateY(${-v}px)`;
	});

	useLayoutEffect(() => {
		const el = headerRef.current;
		if (!el) return;
		// Fractional — offsetHeight rounds to integers and the leftover sliver
		// shows as a hairline of blurred surface pinned at the top edge.
		const measure = () => {
			height.current = el.getBoundingClientRect().height;
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const onScroll = () => setScrolled(window.scrollY > 24);
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	const stopSettle = () => {
		settle.current?.stop();
		settle.current = null;
	};

	// Eased reveal for non-scroll triggers — tabbing into the wordmark or the
	// theme toggle while the header is off screen.
	const reveal = () => {
		stopSettle();
		if (offset.get() === 0) return;
		settle.current = animate(offset, 0, SETTLE);
	};

	useEffect(() => stopSettle, []);

	// SmoothScroll renders nothing under reduced motion, so there is no lenis to
	// subscribe to and this callback never runs — the header simply stays put,
	// which is the right answer for someone who asked for no motion.
	useLenis((lenis) => {
		// Clamping ignores rubber-band overscroll, which would wiggle the header.
		const scroll = Math.max(0, Math.min(lenis.scroll, lenis.limit));
		const prev = lastScroll.current;
		lastScroll.current = scroll;
		// useLenis invokes the callback on registration (every render). That call
		// is not a scroll, and a reload at scroll 800 must not hide the header.
		if (prev === null) return;
		// While a *keyboard* focus sits inside the header it stays put — nobody can
		// operate a control they cannot see. This also absorbs the scroll the
		// browser performs when focus enters a hidden header: the header is
		// `fixed`, so scrolling the page can never bring it into view, yet the
		// attempt still moves the page a few px. Read as a downward scroll it
		// would cancel the reveal and slam the header shut. A deadline instead of
		// this check is a race — the browser's scroll lands whenever it likes.
		// :focus-visible, not :focus, keeps it to keyboard users: a mouse click
		// also focuses a link, and pinning on that would strand the header open
		// for the rest of the page. lastScroll is already updated above, so the
		// frame after focus leaves measures a normal delta, not one big jump.
		const active = document.activeElement;
		if (
			active &&
			headerRef.current?.contains(active) &&
			active.matches(":focus-visible")
		)
			return;

		const dy = scroll - prev;
		const h = height.current;
		if (dy !== 0) {
			stopSettle();
			if (dy > DIRECTION_DEADZONE) direction.current = 1;
			else if (dy < -DIRECTION_DEADZONE) direction.current = -1;
			// The header is fixed, so it is pinned from scroll 0 and `scroll` is
			// the whole travel it can hide into: clamping to it keeps the header
			// fully present at the top of the page.
			offset.set(Math.min(Math.max(offset.get() + dy, 0), h, scroll));
		}

		// Idle settle: finish in the direction the user was last scrolling, so a
		// scroll that stops mid-hide never strands the header half off screen.
		if (lenis.isScrolling === false) {
			const v = offset.get();
			if (v > 0 && v < h) {
				const target = direction.current === 1 ? Math.min(h, scroll) : 0;
				settle.current = animate(offset, target, SETTLE);
			}
		}
	});

	return (
		<div
			ref={headerRef}
			onFocusCapture={reveal}
			// In dark the extra bottom padding is a feather zone: the mask fades
			// the ground and the backdrop blur out across it, so the bar has no
			// bottom edge cutting the cube. Light cuts the bar sharp instead: a
			// translucent light surface over a dark full-bleed exhibit composites
			// to mid grey, and a feather smears that grey down into the demo as
			// fog. Pointer events are off on the bar and back on its two controls,
			// so the fade never swallows clicks below it.
			className={cn(
				"pointer-events-none fixed inset-x-0 top-0 z-99 flex items-center justify-between px-3 py-4 transition-colors duration-300 will-change-transform dark:pb-7 dark:[mask-image:linear-gradient(to_bottom,#000_calc(100%-1.75rem),transparent)] sm:px-6 sm:ps-8",
				scrolled
					? "bg-surface/90 dark:bg-surface/40 backdrop-blur-xl"
					: "bg-transparent",
			)}
		>
			<Link href="/components" className="pointer-events-auto inline-flex items-baseline">
				<Wordmark size="sm" boldSecond />
			</Link>
			<span className="pointer-events-auto contents">
				<ThemeToggle />
			</span>
		</div>
	);
}
