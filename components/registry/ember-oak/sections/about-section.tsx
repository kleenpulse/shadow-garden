import { useGSAP } from "../hooks/use-gsap";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import FieldCanvas from "../gfx/field-canvas";
import { PRESETS } from "../gfx/field-shader";

export default function About() {
	useGSAP(() => {
		const titleSplit = SplitText.create("#about h2", {
			type: "words",
		});

		const scrollTimeline = gsap.timeline({
			scrollTrigger: {
				trigger: "#about",
				start: "top center",
				// end: "bottom 80%",
				// scrub: true,
			},
		});

		scrollTimeline
			.from(titleSplit.words, {
				opacity: 0,
				yPercent: 100,
				duration: 1,
				ease: "expo.out",
				stagger: 0.05,
			})
			.from(
				".top-grid div, .bottom-grid div",
				{
					opacity: 0,
					duration: 1,
					ease: "power1.inOut",
					yPercent: 100,
					stagger: 0.07,
				},
				"-=0.5"
			);
	}, []);

	return (
		<div id="about">
			<div className="mb-16 md:px-0 px-5">
				<div className="content">
					<div className="md:col-span-8">
						<p className="badge">Best Cocktails</p>
						<h2>Where every cocktail is a masterpiece</h2>
					</div>

					<div className="sub-content">
						<p>
							Every cocktail we serve is a reflection of our obsession with
							detail — from the first muddle to the final garnish. That care is
							what turns a simple drink into something truly memorable.{" "}
						</p>
						<div>
							<p className="md:text-3xl text-xl font-bold">
								<span>4.5</span>/5
							</p>
							<p className="text-sm text-white-100">
								More than +9999 happy customers
							</p>
						</div>
					</div>
				</div>
			</div>

			<div className="top-grid">
				<div className="md:col-span-3">
					<div className="noisy" />
					<FieldCanvas preset={PRESETS.aboutPlate} />
				</div>

				<div className="md:col-span-6">
					<div className="noisy" />
					<FieldCanvas preset={PRESETS.aboutPlate} />
				</div>

				<div className="md:col-span-3">
					<div className="noisy" />
					<FieldCanvas preset={PRESETS.aboutPlate} />
				</div>
			</div>

			<div className="bottom-grid">
				<div className="md:col-span-8">
					<div className="noisy" />
					<FieldCanvas preset={PRESETS.aboutPlate} />
				</div>

				<div className="md:col-span-4">
					<div className="noisy" />
					<FieldCanvas preset={PRESETS.aboutPlate} />
				</div>
			</div>
		</div>
	);
}
