export type NavStateProps = {
	bannerInView: boolean;
	hideNavbar: boolean;
	openMobileNav: boolean;
	updateMobileNav: (state: boolean) => void;
	setHideNavbar: (state: boolean) => void;
	updateBannerView: (state: boolean) => void;
	activeLink: "home" | "about" | "how-to-buy" | "trade-now";
	setActiveLink: (link: NavStateProps["activeLink"]) => void;
};
