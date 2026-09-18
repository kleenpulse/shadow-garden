export type NavStateProps = {
	bannerInView: boolean;
	hideNavbar: boolean;
	openMobileNav: boolean;
	updateMobileNav: (state: boolean) => void;
	setHideNavbar: (state: boolean) => void;
	updateBannerView: (state: boolean) => void;
	activeLink:
		| "home"
		| "about"
		| "integration"
		| "how-it-works"
		| "features"
		| "faq";
	setActiveLink: (link: NavStateProps["activeLink"]) => void;
};
