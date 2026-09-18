import Image from "next/image";
import React from "react";
import { motion } from "motion/react";
import { asset } from "../../_shared/cdn";

const BottomStickers = () => {
	return (
		<div className=" absolute min-[400px]:bottom-[16rem] bottom-[14rem]  min-[500px]:bottom-[18rem] md:bottom-[12rem] min-[900px]:bottom-24 min-[1440px]:right-10 lg:right-5  right-1 z-50  flex flex-col items-center gap-y-1  min-[400px]:gap-y-2 min-[900px]:gap-y-3 xl:gap-y-6 overflow-y-clip hero__buttons">
			<span className="w-fit font-black sm:text-2xl md:text-3xl xl:text-[40px] text-xl  opacity-0 hero__btn max-[400px]:text-white min-[2900px]:text-6xl">
				$JIN
			</span>
			<div className="flex items-center gap-x-1 min-[900px]:gap-x-3 xl:gap-x-5 opacity-0 hero__btn">
				<Image
					src={asset("jinlong/stickers-sticker-1")}
					width={200}
					height={200}
					alt="sticker"
					className="max-w-[70px] min-[900px]:max-w-[80px] lg:max-w-[100px] xl:max-w-[118px] min-[2900px]:max-w-[150px]"
				/>
				<Image
					src={asset("jinlong/stickers-sticker-2")}
					width={200}
					height={200}
					alt="sticker"
					className="max-w-[70px] min-[900px]:max-w-[80px] lg:max-w-[100px] xl:max-w-[118px] min-[2900px]:max-w-[150px]"
				/>
			</div>
		</div>
	);
};

export default BottomStickers;
