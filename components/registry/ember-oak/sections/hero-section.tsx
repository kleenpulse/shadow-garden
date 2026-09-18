import { useGSAP } from "../hooks/use-gsap";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";
import { useRef, useState } from "react";
import Ornament from "../miscellaneous/ornament";
import { useMediaQuery } from "../hooks/use-media-query";
import FieldCanvas from "../gfx/field-canvas";
import { PRESETS } from "../gfx/field-shader";

export default function Hero() {
	// Scroll position, 0..1, handed to the shader. A ref carries the tweened value
	// so GSAP is not writing React state sixty times a second; the state write is
	// what actually needs to happen per frame, and it is one number.
	const scrub = useRef({ value: 0 }).current;
	const [progress, setProgress] = useState(0);
	const isMobile = useMediaQuery("(max-width: 767px)");

	useGSAP(() => {
		const lenis = new Lenis();
		lenis.on("scroll", ScrollTrigger.update);

		const heroSplit = new SplitText(".title", {
			type: "chars, words",
		});
		const paragraphSplit = new SplitText(".subtitle", {
			type: "lines",
		});

		heroSplit.chars.forEach((char) => char.classList.add("text-gradient"));
		gsap.from(heroSplit.chars, {
			yPercent: 100,
			duration: 1.8,
			ease: "expo.out",
			stagger: 0.08,
			delay: 0.2,
		});

		gsap.from(paragraphSplit.lines, {
			yPercent: 100,
			opacity: 0,
			duration: 1.8,
			ease: "expo.out",
			stagger: 0.08,
			delay: 1,
		});

		gsap
			.timeline({
				scrollTrigger: {
					trigger: "#hero",
					start: "top top",
					end: "bottom top",
					scrub: true,
				},
			})
			.to(
				".left-leaf",
				{
					y: -250,
				},
				0
			)
			.to(
				".right-leaf",
				{
					y: 250,
				},
				0
			);

		const startValue = isMobile ? "top 50%" : "center 60%";
		const endValue = isMobile ? "120% top" : "bottom top";

		const tl = gsap.timeline({
			scrollTrigger: {
				trigger: ".video",
				start: startValue,
				end: endValue,
				scrub: true,
				pin: true,
			},
		});

		// The source tweened `video.currentTime` here, which meant seeking a
		// compressed stream on every scroll tick — the stutter you get scrubbing
		// between keyframes. The shader has no keyframes: the same timeline drives a
		// plain number from 0 to 1, and the field renders that position directly.
		tl.to(scrub, {
			value: 1,
			onUpdate: () => setProgress(scrub.value),
		});

		gsap.ticker.add((time) => {
			lenis.raf(time * 1000); // Convert time from seconds to milliseconds
		});

		// Disable lag smoothing in GSAP to prevent any delay in scroll animations
		gsap.ticker.lagSmoothing(0);
	}, []);

	return (
		<>
			<section id="hero" className="noisy">
				<div className="relative overflow-y-clip">
					<h1 className="title uppercase">Ember</h1>
				</div>

				<Ornament family="leaf" seed="hero-left" className="left-leaf" />
				<Ornament family="leaf" seed="hero-right" flip className="right-leaf" />

				<div className="body">
					<div className="content">
						<div className="space-y-5 hidden md:block">
							<p>Cool. Crisp. Classic.</p>
							<p className="subtitle">
								Sip the taste
								<br /> of summer
							</p>
						</div>

						<div className="view-cocktails">
							<p className="subtitle">
								Every cocktail on our menu is a blend of premium spirits and
								fresh ingredients, crafted to perfection.
								<br />
								<a href="#cocktails" className="btnx">
									View Cocktails
								</a>
							</p>
						</div>
					</div>
				</div>
			</section>

			<div className="video absolute inset-0">
				<FieldCanvas
					preset={PRESETS.heroPour}
					progress={progress}
					className="size-full"
				/>
			</div>
		</>
	);
}
