"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useIsDark } from "./hooks/use-is-dark";
import LogoIcon from "./icons/logo-icon";
import { XIcon } from "lucide-react";
import AngleArrow from "./icons/angle-arrow";
import { useLenis } from "lenis/react";
import { LettersPull } from "./miscellaneous/letter-pull";

const menuItems = [
	{ label: "ABOUT", href: "#about" },
	{ label: "PROJECTS", href: "#projects" },
	{ label: "PROCESS", href: "#process" },
	{ label: "MODELS", href: "#models" },
	{ label: "GET IN TOUCH", href: "#contact" },
];

export default function Navbar() {
	const [menuOpen, setMenuOpen] = useState(false);
	const [isHidden, setIsHidden] = useState(false);
	const [isAtTop, setIsAtTop] = useState(true);
	const [isDark, setDark] = useIsDark();
	const lenis = useLenis();
	const menuRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const lastScrollY = useRef(0);

	const toggleTheme = () => setDark(!isDark);

	const handleClick = (link: string) => {
		setMenuOpen(false);
		if (!lenis) return;
		lenis.start();
		lenis.scrollTo(link, {
			duration: 2,
			easing: (t) => 1 - Math.pow(1 - t, 3),
			offset: -100,
		});
	};

	useEffect(() => {
		if (!lenis) return;
		if (menuOpen) {
			lenis.stop();
		} else {
			lenis.start();
		}
	}, [menuOpen, lenis]);

	useLenis(({ scroll }) => {
		// Show navbar when scrolling up or at top
		if (scroll < 50) {
			setIsAtTop(true);
			setIsHidden(false);
		} else {
			setIsAtTop(false);

			const isScrollingDown = scroll > lastScrollY.current;
			const isScrollingUp = scroll < lastScrollY.current;

			if (isScrollingUp) {
				setIsHidden(false);
			} else if (isScrollingDown && scroll > 100) {
				setIsHidden(true);
			}
		}
		lastScrollY.current = scroll;
	});

	useEffect(() => {
		if (!menuOpen) return;

		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;

			const isOutsideMenu =
				menuRef.current && !menuRef.current.contains(target);
			const isOutsideButton =
				buttonRef.current && !buttonRef.current.contains(target);

			if (isOutsideMenu && isOutsideButton) {
				setMenuOpen(false);
			}
		};

		const handleEscapeKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setMenuOpen(false);
			}
		};

		const timeoutId = setTimeout(() => {
			document.addEventListener("mousedown", handleClickOutside);
			document.addEventListener("keydown", handleEscapeKey);
		}, 100);

		return () => {
			clearTimeout(timeoutId);
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscapeKey);
		};
	}, [menuOpen]);

	return (
		<>
			<motion.nav
				initial={{ y: 0 }}
				animate={{ y: isHidden ? -80 : 0 }}
				transition={{ duration: 0.3, ease: "easeOut" }}
				className={`fixed top-0 left-0 right-0 z-9999 flex items-center justify-between px-4 py-2.5 md:py-4 transition-colors duration-300 ${isAtTop ? "bg-[var(--background)]/0" : "bg-[var(--background)]/80 backdrop-blur-sm "}`}
			>
				<div className="w-full flex items-center justify-between px-2 md:px-8">
					<div
						onClick={() => {
							lenis?.start();
							lenis?.scrollTo(0, {
								duration: 2,
								easing: (t) => 1 - Math.pow(1 - t, 3),
								offset: -100,
							});
						}}
						className="flex items-center gap-3"
					>
						<LogoIcon className="w-12 md:w-22" />
					</div>

					<span
						onClick={() => {
							lenis?.start();
							lenis?.scrollTo(0, {
								duration: 2,
								easing: (t) => 1 - Math.pow(1 - t, 3),
								offset: -100,
							});
						}}
						className="absolute left-1/2 -translate-x-1/2 text-xl md:text-4xl font-extrabold font-[family-name:var(--font-display)] tracking-[0.35em] cursor-default uppercase transition-opacity duration-300"
					>
						VELLUM
					</span>

					{/* 2x2 Grid Menu Icon */}
					<button
						ref={buttonRef}
						onClick={() => setMenuOpen(!menuOpen)}
						aria-label="Open menu"
						className="cursor-pointer group relative z-101"
					>
						<div
							className={`grid grid-cols-2 gap-1 transition-all duration-300 ${menuOpen ? "scale-95" : "scale-100"}`}
						>
							{[...Array(4)].map((_, i) => (
								<div
									key={i}
									className="size-3 md:size-4 rounded-[1px] transition-opacity group-hover:opacity-60 bg-[var(--foreground)]"
								/>
							))}
						</div>
					</button>
				</div>
			</motion.nav>

			{/* Backdrop overlay */}
			<AnimatePresence>
				{menuOpen && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.3 }}
						className="fixed inset-0 top-12 z-90 bg-[var(--background)]/80"
					/>
				)}
			</AnimatePresence>

			<AnimatePresence>
				{menuOpen && (
					<div className="fixed top-16 md:top-17 right-0 md:-right-2 z-100 flex justify-end px-4 md:px-6">
						<div className="w-full max-w-[calc(100vw-2rem)] md:max-w-360 mx-auto flex justify-end">
							<motion.div
								ref={menuRef}
								initial={{ opacity: 0, scale: 0.9, y: -10, x: 10 }}
								animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
								exit={{ opacity: 0, scale: 0.9, y: -10, x: 10 }}
								transition={{ type: "spring", stiffness: 350, damping: 30 }}
								className="w-full max-w-full min-w-75 md:w-125 overflow-hidden bg-white dark:bg-[#000A1D]"
								style={{
									transformOrigin: "top right",
								}}
							>
								<div className="relative flex flex-col  p-0.5">
									{/* Header */}
									<div className="flex px-4 py-2 md:p-4 items-center justify-between ">
										<LettersPull
											text="Menu"
											delay={0.07}
											className=" tracking-widest  md:text-2xl text-[var(--muted-foreground)] "
										/>
										<motion.button
											initial={{ opacity: 0, rotate: -90 }}
											animate={{ opacity: 1, rotate: 0 }}
											transition={{
												delay: 0.1,
												type: "spring",
												stiffness: 200,
											}}
											onClick={() => setMenuOpen(false)}
											className="cursor-pointer hover:opacity-70 transition-opacity p-2 -mr-2"
											aria-label="Close menu"
										>
											<XIcon className="size-5" />
										</motion.button>
									</div>

									{/* Nav Items */}
									<div className="flex flex-col py-2 md:py-4  bg-[var(--background)] divide-y divide-[var(--border)] w-full">
										{menuItems.map((item, idx) => (
											<motion.button
												key={item.label}
												initial={{ opacity: 0, x: -20 }}
												animate={{ opacity: 1, x: 0 }}
												exit={{ opacity: 0, x: -10 }}
												transition={{
													delay: idx * 0.04 + 0.1,
													type: "spring",
													stiffness: 300,
													damping: 24,
												}}
												onClick={() => handleClick(item.href)}
												className="group w-full gap-4 md:gap-8 flex items-center justify-between px-4 py-4 md:py-6"
												style={{
													borderColor: "var(--border)",
													textDecoration: "none",
												}}
											>
												<span
													className="text-xl md:text-4xl leading-0 font-[family-name:var(--font-display)] font-bold tracking-tight transition-all duration-300 group-hover:pl-2 group-hover:opacity-70"
													style={{ color: "var(--foreground)" }}
												>
													{item.label}
												</span>
												<span className="text-xs md:text-lg tracking-wider flex items-baseline gap-1 md:gap-2  -translate-x-2 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-80 text-[var(--muted-foreground)]">
													View <AngleArrow className="size-2.5 md:size-4" />
												</span>
											</motion.button>
										))}
										{/* Light / Dark Toggle */}
										<motion.div
											initial={{ opacity: 0, y: 10 }}
											animate={{ opacity: 1, y: 0 }}
											transition={{ delay: menuItems.length * 0.04 + 0.1 }}
											className="flex items-center justify-between  px-10 pt-6 font-[family-name:var(--font-display)] text-sm md:text-lg dark:text-white"
										>
											<span className=" dark:opacity-40">Light</span>
											<button
												onClick={toggleTheme}
												className="relative w-12 h-6 rounded-full cursor-pointer transition-colors duration-300 "
												style={{ background: isDark ? "#031435" : "#ffffff" }}
												aria-label="Toggle theme"
											>
												<motion.div
													className="absolute top-0 bottom-0 size-6 scale-[0.9] rounded-full shadow-sm"
													style={{ background: isDark ? "#ffffff" : "#949494" }}
													animate={{
														left: isDark ? "calc(100% - 20px)" : "1px",
													}}
													transition={{
														type: "spring",
														stiffness: 500,
														damping: 30,
													}}
												/>
											</button>
											<span className="opacity-50 dark:opacity-100">Dark</span>
										</motion.div>
									</div>
								</div>
							</motion.div>
						</div>
					</div>
				)}
			</AnimatePresence>
		</>
	);
}
