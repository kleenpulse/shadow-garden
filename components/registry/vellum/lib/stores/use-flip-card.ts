import { create } from "zustand";

interface FlipCardStore {
	flippedId: string | null;
	setFlippedId: (id: string | null) => void;
}

export const useFlipCardStore = create<FlipCardStore>((set) => ({
	flippedId: null,
	setFlippedId: (id) => set({ flippedId: id }),
}));
