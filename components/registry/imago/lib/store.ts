import { create } from "zustand";

type MenuStore = {
	isOpen: boolean;
	setIsOpen: (isOpen: boolean) => void;
	toggle: () => void;
};

export const useMenuStore = create<MenuStore>((set) => ({
	isOpen: false,
	setIsOpen: (isOpen) => set({ isOpen }),
	toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));
