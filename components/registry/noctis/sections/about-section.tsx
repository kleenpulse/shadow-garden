import { useGSAP } from "../hooks/use-gsap";
import gsap from "gsap";
import React from "react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import AnimatedTitle from "../miscellaneous/animated-title";
import FieldCanvas from "../gfx/field-canvas";
import { PRESETS } from "../gfx/field-shader";

gsap.registerPlugin(ScrollTrigger);
const About = () => {
	useGSAP(() => {
		const clipAnimation = gsap.timeline({
			scrollTrigger: {
				trigger: "#clip",
				start: "center center",
				end: "+=800 center",
				scrub: 0.5,
				pin: true,
				pinSpacing: true,
			},
		});

		clipAnimation.to(".mask-clip-path", {
			width: "100vw",
			height: "100vh",
			borderRadius: 0,
		});
	});

	return (
		<div id="about" className="min-h-screen w-screen -mb-1">
			<div className="relative mb-8 mt-36 flex flex-col items-center gap-5">
				<h2 className="font-[family-name:var(--font-mono)] text-sm uppercase md:text-[10px]">
					Welcome to Noctis
				</h2>

				<AnimatedTitle
					title={`Disc<b>o</b>ver the world&#39;s l<b>a</b>rgest shared adventure`}
					className="mt-5 !text-black text-center"
				/>

				<div className="about-subtext">
					<p>The Game of Games begins-your life, now an epic MMORPG</p>
					<p>Noctis unites every player in the world</p>
				</div>
			</div>
			<div className="h-dvh w-screen" id="clip">
				<div className="mask-clip-path about-image">
					<FieldCanvas
						preset={PRESETS.heroDeep}
						className="absolute top-0 left-0 size-full"
					/>
				</div>
			</div>
		</div>
	);
};

export default About;
