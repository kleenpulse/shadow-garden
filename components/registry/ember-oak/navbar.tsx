import React from "react";
import { navLinks } from "./lib/constants";
import { useGSAP } from "./hooks/use-gsap";
import gsap from "gsap";

export default function Navbar() {
	useGSAP(() => {
		const navTween = gsap.timeline({
			scrollTrigger: {
				trigger: "nav",
				start: "bottom top",
			},
		});

		navTween.fromTo(
			"nav",
			{
				backgroundColor: "transparent",
			},
			{
				backgroundColor: "#00000050",
				backgroundFilter: "blur(10px)",
				duration: 1,
				ease: "power1.inOut",
			}
		);
	});

	return (
		<nav>
			<div className="flex">
				<a href="#" className="flex gap-2 items-center">
					<p>Cocktaila</p>
				</a>

				<ul>
					{navLinks.map((link) => (
						<li key={link.id} className="inline-block mx-4">
							<a href={`#${link.id}`} className="">
								{link.title}
							</a>
						</li>
					))}
				</ul>
			</div>
		</nav>
	);
}
