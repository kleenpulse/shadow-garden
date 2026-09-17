"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

// Idle window before the HUD fades. Touch gets longer: there is no hover to
// keep it alive, and every reveal costs a tap that also lands on the preview.
const IDLE_FINE_MS = 2600;
const IDLE_COARSE_MS = 4000;

/**
 * Video-player chrome: visible on any input, gone after a quiet spell. Never
 * hides while `pinned`, while the pointer rests on one of `regions`, or while
 * keyboard focus sits inside one — a user tabbing the chrome is not idle.
 * Hidden state is visual only (opacity + pointer-events); the caller must keep
 * the nodes in the tree and focusable, so `focusin` can bring them back.
 */
export function useIdleHud(
	regions: readonly RefObject<HTMLElement | null>[],
	pinned: boolean,
): boolean {
	const [visible, setVisible] = useState(true);
	// Which hand is driving. Focus pins the chrome only under the keyboard:
	// a mouse click parks focus on the button it hit, and Chrome's own
	// :focus-visible flips back on at the next keypress (Escape included), so
	// neither signal alone says whether the user is still tabbing around.
	// A ref, not an effect local: the effect re-runs when `pinned` flips and
	// must not forget which hand closed the panel.
	const keyboard = useRef(false);

	useEffect(() => {
		const delay = window.matchMedia("(pointer: coarse)").matches
			? IDLE_COARSE_MS
			: IDLE_FINE_MS;
		let timer: number | undefined;

		const engaged = () => {
			const active = document.activeElement;
			return regions.some((ref) => {
				const el = ref.current;
				if (!el) return false;
				return (
					el.matches(":hover") ||
					(keyboard.current && !!active && el.contains(active))
				);
			});
		};
		const arm = () => {
			window.clearTimeout(timer);
			timer = window.setTimeout(() => {
				// Still engaged: check again after another quiet window rather than
				// hiding chrome that is being read or hovered.
				if (pinned || engaged()) arm();
				else setVisible(false);
			}, delay);
		};
		const wake = (e: Event) => {
			if (e.type === "keydown") keyboard.current = true;
			else if (e.type !== "focusin") keyboard.current = false;
			setVisible(true);
			arm();
		};

		// Capture phase so a preview that stops propagation still counts as activity.
		const events = ["pointermove", "pointerdown", "keydown", "wheel", "focusin"] as const;
		for (const ev of events)
			window.addEventListener(ev, wake, { passive: true, capture: true });
		arm();
		return () => {
			window.clearTimeout(timer);
			for (const ev of events)
				window.removeEventListener(ev, wake, { capture: true });
		};
	}, [regions, pinned]);

	return visible;
}
