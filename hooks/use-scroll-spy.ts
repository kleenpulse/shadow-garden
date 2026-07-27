"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** How long a click-jump keeps the rail pinned before it gives up waiting. */
const SETTLE_TIMEOUT_MS = 1500;

/**
 * Tracks which of `ids` sits under the reading line (viewport top + `offset`).
 *
 * Position-based, not IntersectionObserver. The IO band trick (`rootMargin:
 * "-80px 0 -70% 0"`) has two dead zones this has to avoid: a section shorter
 * than the band never wins, and while the band sits between two sections
 * nothing intersects at all. Reading `getBoundingClientRect().top` for a
 * handful of headings on a rAF-coalesced scroll is cheap and always answers.
 *
 * `jumpTo` pins the result while a smooth anchor scroll is in flight, so the
 * rail doesn't strobe through every section it passes on the way down. The pin
 * releases when the scroll arrives, when the user takes over, or on timeout.
 */
export function useScrollSpy(ids: string[], offset = 88) {
	const [active, setActive] = useState<string | null>(ids[0] ?? null);
	const activeRef = useRef<string | null>(active);
	const pinnedRef = useRef<string | null>(null);
	const releaseRef = useRef<() => void>(() => {});

	// The caller rebuilds this array every render, so the effect keys off its
	// contents while every read goes through the ref — the list is never stale.
	const idsRef = useRef(ids);
	idsRef.current = ids;
	const key = ids.join("|");

	const commit = useCallback((next: string | null) => {
		if (activeRef.current === next) return;
		activeRef.current = next;
		setActive(next);
	}, []);

	const jumpTo = useCallback(
		(id: string) => {
			pinnedRef.current = id;
			commit(id);
			releaseRef.current();
		},
		[commit],
	);

	useEffect(() => {
		// Filtered down to nothing — no rail, no reading line.
		if (idsRef.current.length === 0) {
			pinnedRef.current = null;
			commit(null);
			return;
		}

		let frame = 0;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const unpin = () => {
			pinnedRef.current = null;
			if (timer) clearTimeout(timer);
			timer = undefined;
		};

		const compute = () => {
			const list = idsRef.current;
			if (list.length === 0) return;

			const doc = document.documentElement;
			const atBottom =
				window.scrollY + window.innerHeight >= doc.scrollHeight - 2;

			let next: string | null = null;
			if (atBottom) {
				// The last section is usually too short to ever reach the reading
				// line. At the end of the document it is unambiguously what you
				// are reading.
				for (let i = list.length - 1; i >= 0; i--) {
					if (document.getElementById(list[i])) {
						next = list[i];
						break;
					}
				}
			} else {
				for (const id of list) {
					const el = document.getElementById(id);
					if (!el) continue; // in the list but not in the DOM
					if (el.getBoundingClientRect().top - offset > 1) break; // rest are below
					next = id;
				}
				// Above the first section (header still on screen) → hold the first.
				if (!next) next = list.find((id) => document.getElementById(id)) ?? null;
			}

			if (pinnedRef.current) {
				if (next === pinnedRef.current) unpin();
				return;
			}
			commit(next);
		};

		const schedule = () => {
			if (frame) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				compute();
			});
		};

		// Armed on every jump so a target the page cannot actually scroll to
		// still hands control back instead of freezing the rail.
		releaseRef.current = () => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				unpin();
				compute();
			}, SETTLE_TIMEOUT_MS);
		};

		// Manual scroll input cancels the browser's smooth scroll, so it has to
		// cancel the pin too.
		const surrender = () => {
			if (!pinnedRef.current) return;
			unpin();
			schedule();
		};

		// Stale pick after a filter change dropped the active section.
		const current = activeRef.current;
		if (current && !idsRef.current.includes(current)) {
			pinnedRef.current = null;
			commit(idsRef.current[0] ?? null);
		}
		compute();

		window.addEventListener("scroll", schedule, { passive: true });
		window.addEventListener("resize", schedule);
		window.addEventListener("wheel", surrender, { passive: true });
		window.addEventListener("touchmove", surrender, { passive: true });
		window.addEventListener("keydown", surrender);

		// Content reflow (filtering, late fonts) moves the sections under a
		// stationary scroll position — no scroll event fires for that.
		const observer = new ResizeObserver(schedule);
		observer.observe(document.body);

		return () => {
			observer.disconnect();
			window.removeEventListener("scroll", schedule);
			window.removeEventListener("resize", schedule);
			window.removeEventListener("wheel", surrender);
			window.removeEventListener("touchmove", surrender);
			window.removeEventListener("keydown", surrender);
			if (frame) cancelAnimationFrame(frame);
			if (timer) clearTimeout(timer);
			releaseRef.current = () => {};
		};
	}, [key, offset, commit]);

	return { active, jumpTo };
}
