"use client";

import { motion } from "motion/react";

import { cn } from "@/lib/utils";
import { useRef, useState } from "react";

import useInView from "../hooks/util-hooks/use-in-view";
import { FAQS } from "../lib/constants";
import { Minus, Plus } from "lucide-react";

const FAQs = () => {
	const faqsRef = useRef<HTMLDivElement>(null);
	const faqsInView = useInView({
		ref: faqsRef,
		once: true,
	});

	const [activeIndex, setActiveIndex] = useState<number | null>(0);
	const toggleAnswer = (index: number) => {
		if (index === activeIndex) {
			setActiveIndex(null);
		} else {
			setActiveIndex(index);
		}
	};
	return (
		<div className="relative  w-full px-4 py-20 md:px-8 lg:pt-[104px]">
			<div
				ref={faqsRef}
				className="mx-auto w-full max-w-[300px] text-center md:max-w-[400px] lg:max-w-[600px] text-white xl:max-w-[768px]"
			>
				<p
					style={{
						transform: faqsInView ? "none" : "translateY(100px)",
						opacity: faqsInView ? 1 : 0,
						transition: "all 0.7s cubic-bezier(0.17, 0.55, 0.55, 1) 0.4s",
					}}
					className="mb-4 text-center font-light text-gray-300"
				>
					FAQ
				</p>
				<h1
					id="faq"
					style={{
						transform: faqsInView ? "none" : "translateY(100px)",
						opacity: faqsInView ? 1 : 0,
						transition: "all 0.7s cubic-bezier(0.17, 0.55, 0.55, 1) 0.2s",
					}}
					className="text-center font-[family-name:var(--font-body)] text-xl font-bold md:text-2xl lg:text-3xl xl:text-5xl"
				>
					Frequently Asked Questions
				</h1>
			</div>

			<div className="mt-10 flex w-full justify-center ">
				<div className="flex w-full max-w-[768px] flex-col gap-6 text-white">
					{FAQS.map((item, index) => (
						<motion.li
							initial={{ opacity: 0, y: 100 }}
							whileInView={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.5, delay: index * 0.2 }}
							viewport={{ once: true }}
							key={item.id}
							onClick={() => toggleAnswer(index)}
							className={`gap-4x lg:gap-6x relative z-30 flex flex-col overflow-hidden rounded-lg p-4 transition-colors bg-white/10 hover:bg-white/20 backdrop-blur-xl ${
								activeIndex === index
									? "duration-700"
									: "max-h-[80px]x  duration-300"
							}`}
						>
							<div className="flex w-full items-start">
								<p className="text-left  text-sm font-medium  min-[400px]:text-base">
									{item.question}
								</p>
								<div className="absolute right-2 top-1/2 lg:top-2 place-items-center">
									<button
										className={cn(
											"transition-transform duration-300 active:scale-95"
										)}
									>
										{activeIndex === index ? (
											<Minus className="size-5 lg:size-9 " />
										) : (
											<Plus className="size-5 lg:size-9" />
										)}
									</button>
								</div>
							</div>

							<p
								className={cn(
									"grid overflow-hidden font-light text-sm tracking-wide -2 transition-all lg:text-base [&>span]:overflow-hidden",
									activeIndex === index
										? "grid-rows-[1fr] pt-6 duration-300"
										: "grid-rows-[0fr] duration-500"
								)}
							>
								{item.hasLink ? (
									<span dangerouslySetInnerHTML={{ __html: item.answer }} />
								) : (
									<span className="text-left">{item.answer}</span>
								)}
							</p>
						</motion.li>
					))}
				</div>
			</div>
		</div>
	);
};

export default FAQs;
