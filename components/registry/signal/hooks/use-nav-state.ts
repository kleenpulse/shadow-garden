import { NavStateProps } from "../types/nav-states.types";
import { create } from "zustand";

export const useNavState = create<NavStateProps>((set) => ({
	activeLink: "home",
	bannerInView: false,
	hideNavbar: false,
	openMobileNav: false,
	updateMobileNav: (state) => set({ openMobileNav: state }),
	setHideNavbar: (state) => set({ hideNavbar: state }),
	updateBannerView: (state) => set({ bannerInView: state }),
	setActiveLink: (link) => set({ activeLink: link }),
}));
