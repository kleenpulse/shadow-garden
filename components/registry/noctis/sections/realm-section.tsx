import React, { useRef } from "react";
import AnimatedTitle from "../miscellaneous/animated-title";
import gsap from "gsap";
import RoundedCorners from "../miscellaneous/rounded-corners";
import Button from "../ui/button";
import FieldCanvas from "../gfx/field-canvas";
import { PRESETS } from "../gfx/field-shader";

const TheRealm = () => {
	const frameRef = useRef<HTMLCanvasElement>(null);

	const handleMouseLeave = () => {
		const element = frameRef.current;

		if (!element) return;

		gsap.to(element, {
			duration: 0.3,
			rotateX: 0,
			rotateY: 0,
			ease: "power1.inOut",
		});
	};

	const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
		const { clientX, clientY } = e;
		const element = frameRef.current;

		if (!element) return;

		const rect = element.getBoundingClientRect();

		const x = clientX - rect.left;
		const y = clientY - rect.top;

		const centerX = rect.width / 2;
		const centerY = rect.height / 2;

		const rotateX = ((y - centerY) / centerY) * -10;
		const rotateY = ((x - centerX) / centerX) * 10;

		gsap.to(element, {
			duration: 0.3,
			rotateX,
			rotateY,
			transformPerspective: 500,
			ease: "power1.inOut",
		});
	};

	return (
		<section id="inspire" className="min-h-dvh w-screen bg-black text-blue-50">
			<div className="flex size-full flex-col items-center py-10 pb-24 ">
				<p className="font-[family-name:var(--font-mono)] text-sm uppercase md:text-[10px]">
					The multiversal Realm
				</p>

				<div className="relative size-full ">
					<AnimatedTitle
						title={`Th<b>e</b> l<b>o</b>re of th<b>e</b> <b>m</b>ultiversal <b>r</b>eal<b>m</b>`}
						className="mt-5  text-center pointer-events-none mix-blend-difference relative z-10"
					/>

					<div className="story-img-container">
						<div className="story-img-mask">
							<div className="story-img-content">
								<FieldCanvas
									ref={frameRef}
									onMouseLeave={handleMouseLeave}
									onMouseUp={handleMouseLeave}
									onMouseEnter={handleMouseLeave}
									onMouseMove={handleMouseMove}
									preset={PRESETS.heroEmber}
									className="size-full object-contain"
								/>
							</div>
						</div>

						<RoundedCorners />
					</div>
				</div>

				<div className="-mt-80 flex w-full justify-center md:-mt-64 md:me-44 md:justify-end">
					<div className="flex h-full w-fit flex-col items-center md:items-start">
						<p className="mt-3 max-w-sm text-center md:text-start font-[family-name:var(--font-body)] text-violet-50">
							The Realm is a place where you can explore, learn, and connect
							with others
						</p>
						<Button
							id="realm-button"
							title={"Enter the Realm"}
							containerClass="mt-5"
						/>
					</div>
				</div>
			</div>
		</section>
	);
};

export default TheRealm;
