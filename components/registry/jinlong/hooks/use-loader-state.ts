import { create } from "zustand";

type LoaderState = {
	isLoaded: boolean;
	updateLoaded: (isLoaded: boolean) => void;
};

export const useLoaderState = create<LoaderState>((set) => ({
	isLoaded: false,
	updateLoaded: (isLoaded) => set({ isLoaded }),
}));
