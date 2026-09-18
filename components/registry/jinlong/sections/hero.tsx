"use client";

/* eslint-disable react-hooks/exhaustive-deps */
import Image from "next/image";
import { useEffect, useRef } from "react";
import HeroBackground from "../miscellaneous/hero-background";
import { useHeroInView } from "../hooks/use-hero-inview";
import useInView from "../hooks/util-hooks/use-in-view";
import MusicPlayer from "../miscellaneous/music-player";
import BannerRed from "./banner-red";
import Characters from "../miscellaneous/characters";
import Thumbnails from "../miscellaneous/thumbnails";

import dynamic from "next/dynamic";
import BottomStickers from "../miscellaneous/bottom-stickers";
import TypeReveal from "../miscellaneous/type-reveal";
import { useGSAP } from "../hooks/use-gsap";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { AnimatePresence } from "motion/react";
import BottomContent from "../miscellaneous/bottom-content";
import { useLoaderState } from "../hooks/use-loader-state";
import { asset } from "../../_shared/cdn";


const HeroSection = () => {
	const { updateLoaded, isLoaded } = useLoaderState();
	const { updateHeroInView } = useHeroInView();
	const preloadRef = useRef<HTMLDivElement>(null);
	const heroRef = useRef<HTMLDivElement>(null);
	const scopeRef = useRef<HTMLDivElement>(null);
	const isHeroInView = useInView({ ref: heroRef, once: false });

	useEffect(() => {
		if (isHeroInView) {
			updateHeroInView(true);
		} else {
			updateHeroInView(false);
		}
	}, [isHeroInView]);

	useGSAP(() => {
		if (!isLoaded) return;
		window.scrollTo({ top: 0, left: 0 });

		if (!preloadRef.current) return;
		gsap.registerPlugin(ScrollTrigger);
		const preloadBG = document.querySelector(".preloader__bg");
		const heroContainer = document.querySelector(".hero__container");
		const thumbnailCards = Array.from(
			document.querySelectorAll(".thumbnail__card")
		) as HTMLSpanElement[];
		const headerItems = Array.from(
			document.querySelectorAll(".home__header .header__item")
		) as HTMLElement[];
		const otherItems = Array.from(
			document.querySelectorAll(".other__item")
		) as HTMLElement[];
		// const headerItem = document.querySelector(
		// 	".home__header-mobile .header__item-mobile"
		// );

		const heroBtns = Array.from(
			document.querySelectorAll(".hero__buttons .hero__btn")
		) as HTMLElement[];
		// Planes
		const leftChinese = document.querySelector(".left__chinese");
		const rightChinese = document.querySelector(".right__chinese");
		const heroImage = document.querySelector(".hero__image");

		const masterTL = gsap.timeline();

		const setInitialStates = () => {
			gsap.set([headerItems, otherItems], {
				y: 24,
				autoAlpha: 0,
			});
			gsap.set(heroImage, {
				y: 100,
				yPercent: 100,
				opacity: 0,
			});

			gsap.set([leftChinese, rightChinese], {
				y: 24,
				autoAlpha: 0,
			});

			gsap.set(heroBtns, {
				y: 74,
				autoAlpha: 0,
			});

			gsap.set(thumbnailCards, {
				yPercent: 120,
				y: 120,
				opacity: 0,
			});
		};
		const preloadAnimation = () => {
			const TL = gsap.timeline({
				defaults: {
					ease: "power2.out",
				},
			});
			TL.to(preloadBG, {
				yPercent: -100,
				y: -100,
				duration: 1,
				ease: "power4.inOut",
			});

			return TL;
		};

		const UIAnimations = () => {
			const TL = gsap.timeline({
				delay: 0.2,
				defaults: {
					ease: "power3.out",
					duration: 1,
					yPercent: 0,
					y: 0,
					opacity: 1,
				},
			});

			TL.to(thumbnailCards, {
				stagger: 0.2,
				autoAlpha: 1,
			});

			TL.to(
				heroBtns,
				{
					autoAlpha: 1,
					stagger: 0.2,
				},
				"0.5"
			);
			TL.to(
				headerItems,
				{
					autoAlpha: 1,
				},
				"<"
			);
			TL.to(
				otherItems,
				{
					autoAlpha: 1,
				},
				"<"
			);

			TL.to(
				[leftChinese, rightChinese],
				{
					autoAlpha: 1,
					yPercent: 0,
					y: 0,
				},
				"<"
			);

			return TL;
		};

		const heroImageAnimation = () => {
			const TL = gsap.timeline({
				defaults: {
					ease: "power3.out",
					duration: 1.8,
					autoAlpha: 1,
				},
			});

			TL.to(heroImage, {
				y: 0,
				yPercent: 0,
				opacity: 1,
			});

			return TL;
		};

		const scrollTL = gsap.timeline({
			scrollTrigger: {
				trigger: heroContainer,
				start: "top top",
				end: "+=400",
				scrub: 1,
				// markers: true,
			},
		});
		scrollTL.fromTo(
			leftChinese,
			{
				x: 0,
				y: 0,
				scale: 1,
			},
			{
				x: -100,
				y: -50,
				scale: 2,
			}
		);
		scrollTL.fromTo(
			rightChinese,
			{
				x: 0,
				y: 0,
				scale: 1,
			},
			{
				x: 200,
				y: -50,
				scale: 1.5,
			},
			"<"
		);
		masterTL
			// @ts-ignore
			.add(setInitialStates())
			.add(preloadAnimation())
			.add(UIAnimations(), "-=1")
			.add(heroImageAnimation(), "-=1.5");
	}, [preloadRef, heroRef, scopeRef, isLoaded, scopeRef]);

	return (
		<AnimatePresence>
			<div
				ref={preloadRef}
				className="preloader__bg opacity-0 pointer-events-none fixed left-0 top-0 z-[9999] grid h-dvh w-full place-items-center bg-black"
			/>

			<div
				ref={scopeRef}
				className="hero__container
hero__container relative top-0 z-10  w-full h-screen max-h-[1000px] min-[1440px]:max-h-screen min-[500px]:pt-10 md:pt-20 select-none overflow-x-clip pt-5 overflow-hidden"
			>
				<BottomStickers />
				<BottomContent />

				<div
					id="hero__ref"
					ref={heroRef}
					className="w-full absolute top-10 sm:top-20 h-10 bg-transparent z-10 pointer-events-none"
				/>
				<Image
					src={asset("jinlong/hero-bg")}
					width={1500}
					height={1000}
					alt="hero"
					className="absolute inset-0 size-full"
					draggable={false}
					priority
				/>

				<div className="flex items-center justify-center h-full relative w-full">
					{/* Chinese banners */}
					<span className="absolute left-5 min-[500px]:left-10 top-16 min-[2900px]:top-44 left__chinese opacity-0 z-40">
						<Image
							src={asset("jinlong/chinese-banner")}
							width={90}
							height={200}
							alt="hero"
							className="max-w-[40px] min-[500px]:max-w-[60px] min-[900px]:max-w-[60px] min-[1440px]:max-w-[70px] min-[2900px]:max-w-[100px]"
						/>
					</span>
					<span className="absolute right-5 min-[500px]:right-10 top-16 min-[2900px]:top-44 right__chinese opacity-0 z-40">
						<Image
							src={asset("jinlong/chinese-banner")}
							width={90}
							height={200}
							alt="hero"
							className="max-w-[40px] min-[500px]:max-w-[60px] min-[900px]:max-w-[60px] min-[1440px]:max-w-[70px] min-[2900px]:max-w-[100px]"
						/>
					</span>
					{/* Chinese banners */}
					<h1
						id="hero__title"
						className="font-black text-[15vw] md:text-[15vw] flex items-center gap-x-24 sm:gap-x-28 md:gap-x-40 min-[1400px]:gap-x-48 min-[2000px]:gap-x-[17vw] min-[1440px]:text-[15rem] relative z-[11] lg:-translate-y-32 min-[400px]:-translate-y-[25vw] -translate-y-[30vw] sm:-translate-y-[14vw] md:-translate-y-[7vw] min-[2900px]:-translate-y-[15rem] bg-linear-to-r from-black to-black text-transparent bg-clip-text min-[2000px]:text-[10vw]"
					>
						<span className="absolute right-2 -top-2 min-[500px]:-top-0 font-normal text-xl sm:text-2xl md:text-[5vw] min-[1440px]:text-[4.5rem] min-[1440px]:top-7">
							金 龍
						</span>
						<TypeReveal text="JINL" />
						<TypeReveal text="ONG" startDelay={280} />
					</h1>
					<HeroBackground />
					<Characters />

					<BannerRed />
				</div>
			</div>
		</AnimatePresence>
	);
};

export default HeroSection;
