import { featureLists, goodLists } from "../lib/constants";
import { useGSAP } from "../hooks/use-gsap";
import gsap from "gsap";
import { Check } from "lucide-react";
import FieldCanvas from "../gfx/field-canvas";
import { PRESETS } from "../gfx/field-shader";
import { useMediaQuery } from "../hooks/use-media-query";

export default function Art() {
	const isMobile = useMediaQuery("(max-width: 767px)");

	useGSAP(() => {
		const start = isMobile ? "top 20%" : "top top";

		const maskTimeline = gsap.timeline({
			scrollTrigger: {
				trigger: "#art",
				start: start,
				end: "bottom center",
				scrub: 1.5, // follow scroll with some delay
				pin: true,
			},
		});

		maskTimeline
			.to(".will-fade", {
				opacity: 0,
				ease: "power1.inOut",
				stagger: 0.2,
			})
			.to(".masked-img", {
				scale: 1.3,
				maskPosition: "center",
				maskSize: "400%",
				ease: "power1.inOut",
				duration: 1,
			})
			.to("#masked-content", {
				opacity: 1,
				duration: 1,
				ease: "power1.inOut",
			});
	}, []);

	return (
		<div id="art">
			<div className="container mx-auto h-full pt-20">
				<h2 className="will-fade">The Art</h2>

				<div className="content">
					<ul className="space-y-4 will-fade">
						{goodLists.map((feature, index) => (
							<li key={index} className="flex items-center gap-2">
								<Check />
								<p>{feature}</p>
							</li>
						))}
					</ul>

					<div className="cocktail-img">
						<FieldCanvas preset={PRESETS.aboutPlate} className="abs-center masked-img size-full object-contain" />
					</div>

					<ul className="space-y-4 will-fade">
						{featureLists.map((feature, index) => (
							<li key={index} className="flex items-center gap-2 justify-start">
								<Check />
								<p className="md:w-fit w-50">{feature}</p>
							</li>
						))}
					</ul>
				</div>

				<div className="masked-container">
					<h2 className="will-fade">Sip-Worthy Perfection</h2>
					<div id="masked-content">
						<h3>Made with Craft, Poured with Passion</h3>
						<p>
							This isn’t just a drink. It’s a carefully crafted moment made just
							for you.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
