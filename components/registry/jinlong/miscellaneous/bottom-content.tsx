import React from "react";
import MusicPlayer from "./music-player";
import Thumbnails from "./thumbnails";

const BottomContent = () => {
	return (
		<div className="absolute sm:bottom-16 bottom-[9.5vw] min-[380px]:bottom-[9vw] min-[455px]:bottom-[9vw] min-[500px]:bottom-[6.7vw] pt-16  min-[500px]:pt-5 pb-4 md:pb-10 min-[1440px]:left-16 min-[900px]:bottom-24 lg:left-5 xl:bottom-28 left-0 z-40  flex flex-col-reverse gap-y-6 min-[500px]:gap-y-8 md:flex-row items-center min-[1400px]:w-full min-[1400px]:grid min-[1400px]:grid-cols-3 xl:gap-x-10 gap-x-8 min-[900px]:gap-x-0 bg-gradient-to-t from-black  via-black/70 via-75% min-[500px]:via-85% to-black/0 w-full px-4 min-[900px]:pl-4 xl:pl-0 min-[900px]:px-0 md:bg-none other__item opacity-0">
			<MusicPlayer />
			<Thumbnails />
		</div>
	);
};

export default BottomContent;
