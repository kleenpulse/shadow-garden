"use client";

import { useCallback, useRef } from "react";
import { getEngine, type Voice } from "@/lib/audio/engine";

// The opt-in bridge between UI and the audio engine. Components pull `play` (or
// the prebuilt handler factories) and wire them onto their own events — nothing
// is monkeypatched globally, matching the registry's opt-in ethos.
export function useInteractionSound() {
	const lastHover = useRef(0);
	const lastType = useRef(0);

	const play = useCallback((voice: Voice) => {
		getEngine()?.play(voice);
	}, []);

	/** Soft per-keystroke tick for search fields. Throttled so key-repeat and
	 * paste bursts don't machine-gun the sampler. */
	const typeKey = useCallback(() => {
		const now = typeof performance !== "undefined" ? performance.now() : 0;
		if (now - lastType.current < 45) return;
		lastType.current = now;
		getEngine()?.play("type");
	}, []);

	/** Spread onto an element to sonify pointer-enter + keyboard focus. Throttled
	 * so a fast pointer sweep or a drag can't machine-gun the sampler. */
	const hoverProps = useCallback(
		() => ({
			onPointerEnter: () => {
				const now =
					typeof performance !== "undefined" ? performance.now() : 0;
				if (now - lastHover.current < 55) return;
				lastHover.current = now;
				play("hover");
			},
		}),
		[play],
	);

	/** Spread onto a committing control (button, catalog item). */
	const selectProps = useCallback(
		() => ({ onClick: () => play("select") }),
		[play],
	);

	return { play, typeKey, hoverProps, selectProps };
}
