import { useCharacter } from "../hooks/use-character";
import { CHARACTERS } from "../lib/characters";
import { cn } from "@/lib/utils";
import Image from "next/image";
import React from "react";

const Characters = () => {
	const { charIndex } = useCharacter();

	return (
		<div className="absolute  z-10 w-full h-full flex justify-center ">
			<div
				className={cn(
					"relative w-full flex items-end max-lg:overflow-y-clip  "
				)}
			>
				<div className="hero__image hero__image opacity-0 translate-y-[50%]  relative flex flex-1 justify-center w-full  h-full ">
					{CHARACTERS.map((character, index) => (
						<Image
							key={character + index}
							src={character}
							width={2300}
							height={2000}
							alt="character"
							className={cn(
								"  absolute  z-20 transition-all duration-300  opacity-0 flex-1",
								charIndex === 1
									? "max-w-[400px] min-[380px]:max-w-[600px] md:max-w-[700px] min-[1340px]:max-w-[750px] md:-bottom-10 bottom-32  min-[2000px]:max-w-[1000px] min-[2900px]:max-w-[1450px]"
									: charIndex === 0
									? "max-w-[600px] min-[380px]:max-w-[750px] sm:max-w-[800px] md:max-w-[950px] lg:max-w-[1000px] lg:-bottom-36 min-[1340px]:-bottom-[12.4rem] min-[1340px]:max-w-[1150px] min-[500px]:bottom-24 md:-bottom-32 xl:-bottom-40 sm:bottom-16 bottom-10  min-[2000px]:max-w-[1500px] min-[2900px]:max-w-[2300px] min-[2900px]:-bottom-[26rem] min-[2000px]:-bottom-[12rem]"
									: "max-w-[500px] min-[380px]:max-w-[700px] md:max-w-[900px]  min-[1340px]:max-w-[900px] min-[1400px]:max-w-[950px] bottom-36  md:-bottom-10  min-[2000px]:max-w-[1300px] min-[2000px]:-bottom-[6rem] min-[2900px]:max-w-[1900px]",
								charIndex === index
									? "opacity-100 translate-y-0 sm:translate-x-0 duration-1000"
									: "translate-y-20 sm:translate-y-0 sm:translate-x-10 md:translate-x-20"
							)}
							quality={100}
							priority
							draggable={false}
						/>
					))}
				</div>
			</div>
		</div>
	);
};

export default Characters;
