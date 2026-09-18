/* eslint-disable react-hooks/exhaustive-deps */

import { useState, useEffect } from "react";
import { useAnimate, stagger, motion, AnimatePresence } from "motion/react";
import { NAV_LINKS } from "../lib/constants";

import { scrollToSection } from "../lib/scroll";
import { usePathname } from "next/navigation";
import { useNavState } from "../hooks/use-nav-state";
import { NavStateProps } from "../types/nav-states.types";
import { cn } from "@/lib/utils";
import { useHeroInView } from "../hooks/use-hero-inview";

export default function MobileNav() {
	const { isHeroInView } = useHeroInView();
	const { setActiveLink, activeLink, openMobileNav, updateMobileNav } =
		useNavState();

	const [animeState, setAnimeState] = useState(false);

	const handleLinkClick = (link: NavStateProps["activeLink"]) => {
		setActiveLink(link);

		const linkEl = document.getElementById(link);
		if (linkEl) {
			scrollToSection(link, 70);
		}
	};

	useEffect(() => {
		if (!animeState && !openMobileNav) return;
		if (!animeState) {
			setTimeout(() => {
				updateMobileNav(false);
				setAnimeState(false);
			}, 900);
		}
	}, [animeState, openMobileNav]);

	useEffect(() => {
		window.addEventListener("scroll", () => {
			setAnimeState(false);
			updateMobileNav(false);
		});
	}, []);
	console.log("ANIME", animeState);
	console.log("first", openMobileNav);
	return (
		<>
			<div
				aria-hidden
				className={cn(
					"fixed left-0 top-0 z-[99] min-h-screen w-full bg-black/60 transition-all",
					openMobileNav
						? "opacity-100 duration-500"
						: "pointer-events-none opacity-0 duration-300"
				)}
				onClick={() => {
					setAnimeState(!animeState);
				}}
			/>

			<div className="relative z-[999] md:hidden ">
				<div className="home__header-mobile mt-1x overflow-hidden sm:mt-0 ">
					<motion.button
						id="menu-button"
						className={cn(
							"header__item-mobile flex flex-col justify-between gap-y-1x min-[500px]:h-6 h-5"
						)}
						onClick={() => {
							updateMobileNav(true);
							setAnimeState(!animeState);
						}}
						whileTap={{ scale: 0.95 }}
						data-menu-open={openMobileNav}
					>
						{[1, 2, 3].map((num) => (
							<span
								key={num}
								className={cn(
									"bg-black rounded-xl w-9 h-1",
									!isHeroInView && "!bg-[hsl(var(--primary-red))]"
								)}
							/>
						))}
					</motion.button>
				</div>
				<AnimatePresence>
					{openMobileNav && (
						<motion.div
							initial={{ translateX: "-100%" }}
							animate={{ translateX: 0 }}
							exit={{ translateX: "-100%" }}
							transition={{ duration: 0.3, delay: openMobileNav ? 0 : 1 }}
							className="fixed top-0 left-0 bg-black/85 w-full h-screen max-w-[300px] "
						>
							<AnimatePresence>
								{animeState && (
									<motion.ul className="absolute bottom-10  overflow-hidden pl-4 flex flex-col gap-y-5">
										{NAV_LINKS.map((link, index) => (
											<motion.li key={link.link} className="overflow-y-clip">
												<motion.button
													initial={{ translateY: "100%" }}
													animate={{ translateY: 0 }}
													exit={{ translateY: "100%" }}
													transition={{
														duration: 0.3,
														delay: index * 0.2,
														type: "spring",
														stiffness: 100,
														damping: 20,
													}}
													key={link.link + "mobile"}
													onClick={() => {
														handleLinkClick(link.link);
														updateMobileNav(false);
													}}
													className={cn(
														"relative w-fit transition-colors duration-300 hover:text-accent-color text-[hsl(var(--primary-red))]  text-xl min-[380px]:text-2xl font-normal",
														{
															"text-white": activeLink === link.link,
														}
													)}
												>
													{link.name}
												</motion.button>
											</motion.li>
										))}
									</motion.ul>
								)}
							</AnimatePresence>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</>
	);
}
