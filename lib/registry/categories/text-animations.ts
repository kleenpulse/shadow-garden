import type { ComponentEntry } from "../types";

/** Text Animations — kinetic type and number transitions. */
export const textAnimations: ComponentEntry[] = [
	{
		slug: "morphing-text",
		name: "MorphingText",
		category: "Text Animations",
		tier: "free",
		description:
			"A gooey blur-morph that cross-dissolves between a list of words.",
		dependencies: [],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/morphing-text/MorphingText.tsx",
			},
		],
		props: [
			{
				name: "auto",
				kind: "boolean",
				default: true,
				description: "Loop through the words forever (off = morph once).",
			},
		],
	},
	{
		slug: "animated-number",
		name: "AnimatedNumber",
		category: "Text Animations",
		tier: "free",
		description:
			"Animated numeric transitions with flip, slide, fade, and bounce styles.",
		dependencies: ["motion"],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/animated-number/AnimatedNumber.tsx",
			},
		],
		props: [
			{
				name: "value",
				kind: "number",
				default: 999,
				min: 0,
				max: 9999,
				step: 1,
				description: "The value to display and animate to.",
			},
			{
				name: "animationType",
				kind: "enum",
				default: "flip",
				options: ["flip", "slide", "fade", "scale-bounce"],
				description: "Transition style between values.",
			},
			{
				name: "duration",
				kind: "number",
				default: 0.4,
				min: 0.1,
				max: 2,
				step: 0.05,
				unit: "s",
				description: "Transition duration.",
			},
			{
				name: "staggerDelay",
				kind: "number",
				default: 0.05,
				min: 0,
				max: 0.3,
				step: 0.01,
				unit: "s",
				description: "Delay between each digit's animation.",
			},
		],
	},
	{
		slug: "marquee-text",
		name: "MarqueeText",
		category: "Text Animations",
		tier: "free",
		description:
			"A marquee that scrolls only when its text overflows the container.",
		dependencies: [],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/marquee-text/MarqueeText.tsx",
			},
		],
		props: [
			{
				name: "speed",
				kind: "number",
				default: 35,
				min: 5,
				max: 120,
				step: 5,
				description: "Scroll speed (px/s).",
			},
			{
				name: "gap",
				kind: "number",
				default: 40,
				min: 0,
				max: 120,
				step: 4,
				unit: "px",
				description: "Gap between repetitions.",
			},
			{
				name: "pause",
				kind: "number",
				default: 5,
				min: 0,
				max: 15,
				step: 0.5,
				unit: "s",
				description: "Pause at the start before scrolling.",
			},
		],
	},
	{
		slug: "variable-proximity",
		name: "VariableProximity",
		category: "Text Animations",
		tier: "pro",
		description:
			"Text whose letters interpolate font weight by cursor proximity.",
		dependencies: ["motion"],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/variable-proximity/VariableProximity.tsx",
			},
		],
		props: [
			{
				name: "radius",
				kind: "number",
				default: 80,
				min: 20,
				max: 200,
				step: 5,
				unit: "px",
				description: "Cursor influence radius.",
			},
			{
				name: "falloff",
				kind: "enum",
				default: "linear",
				options: ["linear", "exponential", "gaussian"],
				description: "How influence falls off with distance.",
			},
		],
	},
	{
		slug: "scroll-velocity",
		name: "ScrollVelocity",
		category: "Text Animations",
		tier: "free",
		description:
			"A wrapping marquee whose drift speed and direction follow scroll velocity — fast scrolls whip the row along, upward scrolls reverse it.",
		dependencies: ["motion"],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/scroll-velocity/ScrollVelocity.tsx",
			},
		],
		props: [
			{
				name: "velocity",
				kind: "number",
				default: 50,
				min: -200,
				max: 200,
				step: 10,
				unit: "px/s",
				description: "Base drift speed; negative drifts the other way.",
			},
			{
				name: "damping",
				kind: "number",
				default: 50,
				min: 10,
				max: 100,
				step: 5,
				description: "Spring damping on the scroll-velocity smoothing.",
			},
			{
				name: "stiffness",
				kind: "number",
				default: 400,
				min: 100,
				max: 800,
				step: 20,
				description: "Spring stiffness on the scroll-velocity smoothing.",
			},
			{
				name: "numCopies",
				label: "Copies",
				kind: "number",
				default: 6,
				min: 2,
				max: 12,
				step: 1,
				description: "How many copies of the content tile the loop.",
			},
		],
	},
];
