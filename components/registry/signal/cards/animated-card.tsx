import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";

interface Props {
	icon: LucideIcon;
	title: string;
	description: string;
	id: number;
}

export const AnimatedCard = ({
	data,
	index,
}: {
	data: Props;
	index: number;
}) => {
	const [transformStyle, setTransformStyle] = useState("");
	const itemRef = useRef<HTMLDivElement | null>(null);

	const INTENSITY_X = 15;
	const INTENSITY_Y = -15;

	const handleMouseMove = (e: { clientX: number; clientY: number }) => {
		if (!itemRef.current) return;
		const { left, top, width, height } =
			itemRef.current.getBoundingClientRect();

		const relativeX = (e.clientX - left) / width;
		const relativeY = (e.clientY - top) / height;

		const tiltX = (relativeY - 0.5) * INTENSITY_X;
		const tiltY = (relativeX - 0.5) * INTENSITY_Y;

		const newTransform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(0.98, 0.98, 0.98)`;
		setTransformStyle(newTransform);
	};

	const handleMouseLeave = () => {
		setTransformStyle("");
	};

	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			whileInView={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5, delay: index * 0.3 }}
			viewport={{ once: true }}
			className="size-full"
		>
			<div
				ref={itemRef}
				onMouseMove={handleMouseMove}
				onMouseLeave={handleMouseLeave}
				style={{ transform: transformStyle }}
				className={cn(
					"flex w-full items-center gap-x-5 lg:gap-x-3 gap-y-4 rounded-2xl   hover:shadow-[0_0_20px_0_rgba(0,0,0,0.1)] md:min-h-[150px]  p-6 xl:gap-y-6  relative z-40",
					{
						"bg-[var(--accent-yellow)]/50": data.id === 1,
						"bg-[var(--accent-purple)]/70": data.id === 2,
						"bg-white/45": data.id === 3,
					}
				)}
			>
				<div className="max-h-[320px]">
					<data.icon />
				</div>
				<div className="text-white">
					<h2 className="text-sm font-bold lg:text-lg">{data.title}</h2>
					<p className="text-xs sm:text-sm xl:text-[18px]">
						{data.description}
					</p>
				</div>
			</div>
		</motion.div>
	);
};
