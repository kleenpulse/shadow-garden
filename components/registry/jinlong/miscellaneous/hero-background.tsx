import { useCharacter } from "../hooks/use-character";
import { cn } from "@/lib/utils";
import Image from "next/image";
import React from "react";
import { asset } from "../../_shared/cdn";

const HeroBackground = () => {
	const { musicPlaying } = useCharacter();
	return (
		<>
			<Image
				src={asset("jinlong/paint-mobile")}
				width={500}
				height={500}
				alt="hero paint"
				className="absolute top-20  z-[3]  w-full max-w-full  opacity-0  min-[450px]:hidden other__item"
				draggable={false}
			/>
			<Image
				src={asset("jinlong/hero-paint")}
				width={2000}
				height={2000}
				alt="hero paint"
				className="absolute bottom-20 sm:-bottom-10 md:-bottom-20 xl:-bottom-32 z-[3]  sm:max-w-[700px] md:max-w-[800px] lg:max-w-[900px] opacity-0 hidden min-[450px]:block  min-[2000px]:max-w-[1500px] min-[2900px]:max-w-[2000px] min-[2900px]:-bottom-[20rem] min-[2000px]:-bottom-[18rem] other__item"
				draggable={false}
			/>
			<Image
				src={asset("jinlong/hero-circle")}
				width={2000}
				height={2000}
				alt="hero paint"
				className={cn(
					"absolute top-10 md:-bottom-10 z-[1] max-w-[600px] min-[400px]:max-w-[700px] md:max-w-[800px] lg:max-w-[900px] min-[1440px]:max-w-[1000px] min-[2000px]:max-w-[1300px] min-[2900px]:max-w-[1700px] opacity-0 other__item ",
					musicPlaying ? "hero__circle" : "hero__circle--hidden"
				)}
				draggable={false}
				priority
			/>
		</>
	);
};

export default HeroBackground;
