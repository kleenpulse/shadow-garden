/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import Image from "next/image";

import { scrollToSection } from "../lib/scroll";

import { useNavState } from "../hooks/use-nav-state";
import { NavStateProps } from "../types/nav-states.types";
import { Button } from "../ui/button";
import { NAV_LINKS } from "../lib/constants";
import { cn } from "@/lib/utils";
import { useHeroInView } from "../hooks/use-hero-inview";
import useWindowHeight from "../hooks/util-hooks/use-window-height";
import MobileNav from "./mobile-nav";
import { useEffect } from "react";
import MobileNavCOPY from "./mobile-nav";
import { asset } from "../../_shared/cdn";

export default function Navbar() {
	const { setActiveLink, activeLink, bannerInView, hideNavbar } = useNavState();
	const { isHeroInView } = useHeroInView();
	const { scrollY } = useWindowHeight();

	useEffect(() => {
		if (isHeroInView) {
			setActiveLink("home");
			return;
		}
	}, [isHeroInView]);

	const handleLinkClick = (link: NavStateProps["activeLink"]) => {
		setActiveLink(link);

		const linkEl = document.getElementById(link);
		if (linkEl) {
			scrollToSection(link, 70);
		}
	};

	return (
		<nav
			className={cn(
				"fixed top-0 z-[100] mx-auto flex  w-full max-w-[1900px]  min-[2000px]:max-w-full transform-gpu items-center px-3 py-3 transition-all duration-300 min-[500px]:px-5 md:px-8 md:py-4 xl:px-12  ",
				isHeroInView ? "backdrop-blur-0" : "backdrop-blur bg-black/90",
				hideNavbar && scrollY > 200 ? "translate-y-[-150px]" : "translate-y-0"
			)}
		>
			<div className="w-full overflow-hidden   relative z-10 ">
				<div className="home__header flex w-full items-center gap-4 justify-between">
					<button
						className="header__item flex items-center gap-x-2 font-black"
						onClick={() => {
							scrollToSection("hero__ref", 70);
						}}
					>
						<Image
							src={asset("jinlong/jinlong-logo")}
							alt="logo"
							width={150}
							height={150}
							quality={100}
							className="max-w-[40px] min-[400px]:max-w-[50px] min-[900px]:max-w-[60px] min-[1440px]:max-w-[70px] min-[2900px]:max-w-[100px]"
						/>
						{/* <span
							className={cn(
								"text-xl sm:text-2xl lg:text-3xl",
								isHeroInView ? "text-black" : "text-[hsl(var(--primary-red))]"
							)}
						>
							LOGO
						</span> */}
					</button>
					<div className="header__item hidden items-center  md:gap-x-6 lg:gap-x-8 opacity-0 pointer-events-none">
						{NAV_LINKS.map((link) => (
							<Button
								key={link.link}
								onClick={() => handleLinkClick(link.link)}
								variant="transparent"
								className={cn(
									"relative w-fit whitespace-nowrap font-bold transition-colors duration-300 uppercase ",
									isHeroInView ? "text-black" : "text-white"
								)}
							>
								{link.name}
								<span
									className={cn(
										"absolute -bottom-2 left-1/2 h-[2px] w-full -translate-x-1/2 translate-y-4 transform rounded-tl-lg rounded-tr-lg bg-red-500  transition-all duration-300 md:w-[110%]",
										{
											"-translate-y-2 opacity-100 !size-2 rounded-full":
												activeLink === link.link,
										}
									)}
								/>
							</Button>
						))}
					</div>
					<div className="header__item">
						<Button
							variant={"transparent"}
							className="rounded-full uppercase bg-[hsl(var(--primary-red))] h-8 sm:h-10 sm:px-4 py-2 font-bold text-black text-xs min-[500px]:text-base min-[2900px]:text-3xl min-[2900px]:px-10 min-[2900px]:py-8"
						>
							Buy $JIN
						</Button>
					</div>
				</div>
			</div>

			{/* <MobileNav /> */}
			{/* <MobileNavCOPY /> */}
		</nav>
	);
}
