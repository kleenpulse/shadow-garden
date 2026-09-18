"use client";

import { X, ArrowUpRight } from "lucide-react";
import { brandMarkDataUri } from "../miscellaneous/brand-mark";
import AsciiPlate from "../miscellaneous/ascii-plate";
import type { Project } from "../sections/projects-section";
import { MarqueeText } from "../miscellaneous/marquee-text";

export function ProjectCardBack({
	project,
	onClose,
}: {
	project: Project;
	onClose: () => void;
}) {
	// Extract category if it looks like there's one at the end of the description
	let description = project.description;
	let category = "Category";

	const words = description.split(" ");
	if (words.length > 0) {
		const lastWord = words[words.length - 1].trim();
		if (["Utility", "DeFi", "Meme"].includes(lastWord)) {
			category = lastWord;
			words.pop();
			description = words.join(" ");
		}
	}

	return (
		<div
			className="w-full h-full bg-[var(--card)] flex flex-col p-1  overflow-hidden  "
			style={{ backfaceVisibility: "hidden" }}
		>
			<button
				onClick={onClose}
				className=" absolute bottom-0 text-sm px-1 left-1/2 -translate-x-1/2 flex md:hidden items-center gap-1 transition-colors  z-99 bg-[var(--background)]"
			>
				<X size={16} strokeWidth={1.5} />
				<span>close</span>
			</button>
			{/* Header */}
			<div className="hidden md:flex items-center justify-between py-3 px-4">
				<span className="text-xl  font-medium">Details</span>
				<button
					onClick={onClose}
					className=" hover:text-black transition-colors rounded-full p-1 hover:bg-neutral-200"
				>
					<X size={16} strokeWidth={1.5} />
				</button>
			</div>

			{/* Main Content */}
			<div className="flex-1 flex flex-col min-h-0 bg-[var(--background)] ">
				<div className="flex px-1 md:px-2 items-baseline justify-between gap-2 md:py-2 pt-1 md:pt-3 border-b border-[var(--card)]">
					<h3
						className="md:text-xl font-black uppercase tracking-tight w-[calc(100%-40px)] md:w-[calc(100%-50px)] "
						style={{ fontFamily: "var(--font-display)" }}
					>
						<MarqueeText text={project.name} />
					</h3>
					<a
						href={project.link || "#"}
						// target="_blank"
						rel="noopener noreferrer"
						className="text-xs whitespace-nowrap hover:text-black flex items-center gap-1  transition-colors"
						style={{ fontFamily: "var(--font-body)" }}
					>
						Visit
						<ArrowUpRight size={12} className="hidden md:block" />
					</a>
				</div>
				<div className="flex flex-col relative flex-1 justify-between p-1 md:p-2">
					<p className="text-sm leading-none md:leading-[1.2] md:text-base font-medium">
						{description}
					</p>

					{/* ASCII Art Container */}

					<AsciiPlate src={brandMarkDataUri(project.name)} />

					{/* Footer Nuked (no space cos of inline flip) */}
					<div className="hidden items-center text-xs md:text-base -mb-1 md:mb-0 justify-between ">
						<span>{category}</span>
						<span>#DEX</span>
					</div>
				</div>
			</div>
		</div>
	);
}
