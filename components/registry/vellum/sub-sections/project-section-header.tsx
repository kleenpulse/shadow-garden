import React from "react";
import SplitText from "../miscellaneous/split-text";

export default function ProjectSectionHeader() {
	return (
		<div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-4 md:mb-10 px-2 md:px-6">
			<div>
				<h2
					className="text-5xl md:text-7xl lg:text-[127px] font-black leading-none tracking-tighter uppercase mb-4 project-card"
					style={{
						color: "var(--foreground)",
						fontFamily: "var(--font-display)",
					}}
				>
					<SplitText>PROJECTS</SplitText>
				</h2>
				{/* <p className="text-2xl md:text-3xl max-w-89.5 md:max-w-195.25 text-[var(--muted-foreground)] leading-[1.1] project__text">
					<SplitText>
						From Distribution to Software Development to Listings to Market
						Making, we&apos;ve got you covered.
					</SplitText>
				</p> */}
			</div>
		</div>
	);
}
