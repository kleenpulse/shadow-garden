import { useEffect, useRef, useState } from "react";
import Button from "./ui/button";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWindowScroll } from "./hooks/use-window-scroll";
import gsap from "gsap";

const NAV_ITEMS = [
	{
		id: "inspire",
		name: "Inspire",
	},
	{
		id: "about",
		name: "About",
	},
	{
		id: "vault",
		name: "Vault",
	},
	{
		id: "contact",
		name: "Contact",
	},
];

const Navbar = () => {
	const [isIndicatorActive, setIsIndicatorActive] = useState(false);
	const [lastScrollY, setLastScrollY] = useState(0);
	const [isNavVisible, setIsNavVisible] = useState(true);

	const navContainerRef = useRef<HTMLDivElement>(null);

	const { y: currentScrollY } = useWindowScroll();

	useEffect(() => {
		if (currentScrollY === 0) {
			setIsNavVisible(true);
			navContainerRef.current!.classList.remove("floating-nav");
		} else if (currentScrollY > lastScrollY) {
			setIsNavVisible(false);
			navContainerRef.current!.classList.add("floating-nav");
		} else if (currentScrollY < lastScrollY) {
			setIsNavVisible(true);
			navContainerRef.current!.classList.add("floating-nav");
		}

		setLastScrollY(currentScrollY);
	}, [currentScrollY, lastScrollY]);

	useEffect(() => {
		gsap.to(navContainerRef.current, {
			y:
				isNavVisible && currentScrollY !== 0
					? 10
					: currentScrollY === 0
					? 0
					: -100,
			opacity: isNavVisible ? 1 : 0,
			duration: 0.2,
		});
	}, [isNavVisible, currentScrollY]);

	const toggleAudioIndicator = () => {
		setIsIndicatorActive((prev) => !prev);
	};


	return (
		<div
			ref={navContainerRef}
			className="fixed inset-x-0 top-0 z-50 h-16 border-none transition-all duration-700 sm:inset-x-6"
		>
			<header className="absolute top-1/2 w-full -translate-y-1/2">
				<nav className="flex size-full items-center justify-between p-4">
					<div className="flex items-center">
						<h1 className="special-font font-[family-name:var(--font-display)] sm:text-2xl text-xl lg:text-3xl text-blue-100">
							<b>v</b>xr<b>ce</b>l
						</h1>
					</div>
					<div className="flex h-full items-center ">
						<div className="hidden md:block">
							{NAV_ITEMS.map((item) => (
								<a key={item.id} href={`#${item.id}`} className="nav-hover-btn">
									{item.name}
								</a>
							))}
						</div>
						<button
							title={isIndicatorActive ? "Settle the signal" : "Wake the signal"}
							aria-pressed={isIndicatorActive}
							className="ml-10 flex items-center space-x-0.5"
							onClick={toggleAudioIndicator}
						>
							{[1, 2, 3, 4].map((bar) => (
								<div
									key={bar}
									className={cn(
										"indicator-line",
										isIndicatorActive ? "active" : ""
									)}
									style={{ animationDelay: `${bar * 0.1}s` }}
								/>
							))}
						</button>
					</div>
				</nav>
			</header>
		</div>
	);
};

export default Navbar;
