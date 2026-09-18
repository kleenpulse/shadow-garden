import { THUMBNAILS } from "../lib/characters";
import ThumbnailCard from "../cards/thumbnail-card";
import { motion } from "motion/react";

const Thumbnails = () => {
	return (
		<motion.div
			layout
			layoutId="bottom__stickers"
			className="w-full md:w-fit flex md:justify-end flex-shrink-0 min-[900px]:justify-center  min-[900px]:right-0  min-[2900px]:w-full "
		>
			<div className="grid grid-cols-3 gap-x-1 min-[900px]:translate-x-10 xl:translate-x-0 max-md:w-full ">
				{THUMBNAILS.map((item, index) => (
					<ThumbnailCard
						key={item.name}
						image={item.image}
						name={item.name}
						index={index}
					/>
				))}
			</div>
		</motion.div>
	);
};

export default Thumbnails;
