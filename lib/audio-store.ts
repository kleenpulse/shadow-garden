import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getEngine } from "./audio/engine";

// Consent + level for interaction audio. Mirrors lib/store.ts. Audio is OFF by
// default — sound must be opted into, never sprung on a visitor. Preference is
// persisted so it survives reloads; the engine itself is driven from here.
interface AudioState {
	enabled: boolean;
	volume: number; // 0–1
	setEnabled: (enabled: boolean) => void;
	toggle: () => void;
	setVolume: (volume: number) => void;
}

export const useAudioStore = create<AudioState>()(
	persist(
		(set, get) => ({
			enabled: false,
			volume: 0.6,
			setEnabled: (enabled) => {
				getEngine()?.setEnabled(enabled);
				set({ enabled });
			},
			toggle: () => get().setEnabled(!get().enabled),
			setVolume: (volume) => {
				const v = Math.min(1, Math.max(0, volume));
				getEngine()?.setVolume(v);
				set({ volume: v });
			},
		}),
		{
			name: "sg-audio",
			// Re-apply the persisted preference to the engine after hydration so a
			// returning visitor's choice actually takes effect.
			onRehydrateStorage: () => (state) => {
				if (!state) return;
				const engine = getEngine();
				engine?.setVolume(state.volume);
				engine?.setEnabled(state.enabled);
			},
		},
	),
);
