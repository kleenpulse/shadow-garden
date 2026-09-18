import { CHARACTERS } from "../lib/characters";
import { create } from "zustand";

type State = {
	activeCharacter: string;
	charIndex: number;
	musicPlaying: boolean;
	updateMusicPlaying: (state: boolean) => void;
	updateCharIndex: (state: number) => void;
	updateActiveCharacter: (state: string) => void;
};

export const useCharacter = create<State>((set) => ({
	activeCharacter: "first",
	charIndex: 0,
	musicPlaying: false,
	updateMusicPlaying: (state) => set({ musicPlaying: state }),
	updateCharIndex: (state) => set({ charIndex: state }),
	updateActiveCharacter: (state) => set({ activeCharacter: state }),
}));
