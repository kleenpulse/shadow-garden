import React, { useMemo } from "react";
import { motion } from "motion/react";

type ConfigProps = {
	size: number;
	circleRadius: number;
	color: string;
	rotationDuration: number;
	noiseFrequency: number;
	displacementFrequency: number;
	displacementScale: number;
};
const OptimizedSVG = ({ config }: { config: ConfigProps }) => {
	const {
		size,
		circleRadius,
		color,
		rotationDuration,
		noiseFrequency,
		displacementFrequency,
		displacementScale,
	} = config;

	const filterId = useMemo(
		() => `noise-${Math.random().toString(36).substring(2, 9)}`,
		[]
	);
	const displaceId = useMemo(
		() => `displace-${Math.random().toString(36).substring(2, 9)}`,
		[]
	);

	return (
		<motion.svg
			className="w-full max-w-[1000px] h-auto absolute"
			viewBox={`0 0 ${size} ${size}`}
			animate={{ rotate: 360 }}
			transition={{
				duration: rotationDuration,
				repeat: Infinity,
				ease: "linear",
			}}
		>
			<defs>
				<filter id={filterId}>
					<feTurbulence
						type="fractalNoise"
						baseFrequency={noiseFrequency}
						numOctaves="3"
						result="noise"
					/>
					<feColorMatrix
						in="noise"
						result="colorNoise"
						values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"
					/>
					<feComposite
						operator="in"
						in="colorNoise"
						in2="SourceGraphic"
						result="noiseShape"
					/>
					<feMorphology
						operator="dilate"
						radius="2"
						in="noiseShape"
						result="noisyEdges"
					/>
					<feMerge>
						<feMergeNode in="noisyEdges" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
				<filter id={displaceId}>
					<feTurbulence
						type="turbulence"
						baseFrequency={displacementFrequency}
						numOctaves="3"
						result="turbulence"
						seed="2"
					>
						<animate
							attributeName="baseFrequency"
							dur="30s"
							values={`${displacementFrequency};${
								displacementFrequency * 1.4
							};${displacementFrequency}`}
							repeatCount="indefinite"
						/>
					</feTurbulence>
					<feDisplacementMap
						in="SourceGraphic"
						in2="turbulence"
						scale={displacementScale}
						xChannelSelector="R"
						yChannelSelector="G"
					/>
				</filter>
			</defs>
			<g filter={`url(#${displaceId})`}>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={circleRadius}
					fill={color}
					filter={`url(#${filterId})`}
				/>
			</g>
		</motion.svg>
	);
};

export default React.memo(OptimizedSVG);
