import React from "react";
import Button from "../ui/button";
import FieldCanvas from "../gfx/field-canvas";
import { PRESETS } from "../gfx/field-shader";

const Contact = () => {
	return (
		<div id="contact" className="my-20 min-h-96 w-screen px-10">
			<div className="relative rounded-lg bg-black py-24 text-blue-50 sm:overflow-hidden">
				<div className="absolute -left-20 top-0 hidden h-full w-72 overflow-hidden sm:block lg:left-20 lg:w-96">
					<FieldClip className="contact-clip-path-1" preset={PRESETS.heroDusk} />
					<FieldClip
						className="contact-clip-path-2 lg:translate-y-40 translate-y-60"
						preset={PRESETS.heroDeep}
					/>
				</div>

				<div className="absolute -top-40 left-20 w-60 sm:top-1/2 md:left-auto md:right-10 lg:top-20 lg:w-80">
					<FieldClip
						className="absolute md:scale-125"
						preset={PRESETS.gridThree}
					/>
					<FieldClip
						className="sword-man-clip-path md:scale-125"
						preset={PRESETS.heroEmber}
					/>
				</div>

				<div className="flex flex-col items-center text-center">
					<p className="font-[family-name:var(--font-mono)] text-xs uppercase ">Join Noctis</p>
					<p className="special-font mt-10 w-full font-[family-name:var(--font-display)] text-5xl leading-[0.9] md:text-[6rem]">
						l<b>e</b>t&#39;s buil<b>d</b> the <br /> ne<b>x</b>t er<b>a</b> of g
						<b>a</b>ming t<b>o</b>geth<b>e</b>r
					</p>

					<Button
						title={"Contact us"}
						containerClass={"cursor-pointer mt-10"}
					/>
				</div>
			</div>
		</div>
	);
};

// A clipped plate of the field.
//
// The composition here was never about the photographs — it is four CSS clip-paths
// cutting shards out of a rectangle. The shards stayed; only what fills them
// changed.
const FieldClip = ({
	preset,
	className,
}: {
	preset: number;
	className?: string;
}) => {
	return (
		<div className={className}>
			<FieldCanvas preset={preset} className="size-full" />
		</div>
	);
};
export default Contact;
