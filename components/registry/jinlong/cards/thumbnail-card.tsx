import { useCharacter } from "../hooks/use-character";
import { cn } from "@/lib/utils";
import Image from "next/image";
import React from "react";

const ThumbnailCard = ({
	image,
	name,
	index,
}: {
	image: string;
	name: string;
	index: number;
}) => {
	const { updateActiveCharacter, updateCharIndex, charIndex } = useCharacter();
	return (
		<div className="overflow-y-clip py-1">
			<div
				className={cn(
					"w-full xl:max-w-[200px] md:max-w-[20vw] min-[900px]:max-w-[15vw] h-[70px] min-[500px]:h-[90px] md:h-[80px] min-[900px]:h-[90px] xl:h-[100px] cursor-pointer rounded-xl lg:rounded-2xl overflow-clip  hover:scale-y-105  translate-y-[120%] min-[2900px]:h-[150px] min-[2900px]:min-w-[300px] min-[2900px]:max-w-full thumbnail__card",
					index === charIndex ? "border-2 border-white scale-y-105" : ""
				)}
				onClick={() => {
					updateCharIndex(index);
					updateActiveCharacter(name);
				}}
			>
				<Image
					src={image}
					alt={name}
					width={200}
					height={100}
					className="size-full object-cover"
					draggable={false}
				/>
			</div>
		</div>
	);
};

export default ThumbnailCard;
