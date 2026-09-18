import { create } from "zustand";

interface ProjectGridStore {
	isProjectGridInView: boolean;
	setIsProjectGridInView: (inView: boolean) => void;
	isFooterInView: boolean;
	setIsFooterInView: (inView: boolean) => void;
	isHeroInView: boolean;
	setIsHeroInView: (inView: boolean) => void;
}

export const useSectionViewState = create<ProjectGridStore>((set) => ({
	isProjectGridInView: false,
	setIsProjectGridInView: (inView: boolean) =>
		set({ isProjectGridInView: inView }),
	isFooterInView: false,
	setIsFooterInView: (inView: boolean) => set({ isFooterInView: inView }),
	isHeroInView: false,
	setIsHeroInView: (inView: boolean) => set({ isHeroInView: inView }),
}));
