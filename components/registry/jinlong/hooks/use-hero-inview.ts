import { create } from "zustand";

type State = {
  isHeroInView: boolean;
  updateHeroInView: (state: boolean) => void;
};

export const useHeroInView = create<State>()((set) => ({
  isHeroInView: false,
  updateHeroInView: (state) => set({ isHeroInView: state }),
}));
