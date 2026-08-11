"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

// Reader control over the /cookbook ambient flame. Its own store rather than
// lib/store.ts: that one is scoped to ephemeral shell chrome and persists only
// the sidebar width, while this is a durable opinion — someone who kills a
// background because it costs them frames means it.
//
// `enabled: false` unmounts the canvas entirely (GL context released), so it is
// a real opt-out, not a visibility toggle. `paused` leaves the last painted
// frame on screen and stops scheduling new ones.
interface FlameState {
	enabled: boolean;
	paused: boolean;
	setEnabled: (enabled: boolean) => void;
	setPaused: (paused: boolean) => void;
	toggleEnabled: () => void;
	togglePaused: () => void;
}

export const useFlameStore = create<FlameState>()(
	persist(
		(set) => ({
			enabled: true,
			paused: false,
			setEnabled: (enabled) => set({ enabled }),
			setPaused: (paused) => set({ paused }),
			toggleEnabled: () => set((s) => ({ enabled: !s.enabled })),
			togglePaused: () => set((s) => ({ paused: !s.paused })),
		}),
		{
			name: "sg-cookbook-flame",
			partialize: (state) => ({
				enabled: state.enabled,
				paused: state.paused,
			}),
		},
	),
);

const noopSubscribe = () => () => {};

/**
 * False during SSR and the hydration render, true forever after. Consumers hold
 * the "on" state until then so the first client render matches the server HTML;
 * by the time this flips, `persist` has long since read localStorage (sync
 * storage rehydrates during store creation, i.e. at module eval).
 *
 * Deliberately NOT built on `persist.hasHydrated()` + `onFinishHydration`, the
 * shape `useFavoritesHydrated` uses. That pair races: if rehydration finishes
 * before the effect subscribes, `hasHydrated()` has to catch it, and when it
 * doesn't the event has already fired and nothing ever sets the flag — the gate
 * silently never engages. Measured on /cookbook: a stored `enabled:false` left
 * the flame mounted on roughly half of reloads. `useSyncExternalStore` with a
 * constant snapshot has no such window.
 */
export function useFlameHydrated(): boolean {
	return useSyncExternalStore(
		noopSubscribe,
		() => true,
		() => false,
	);
}
