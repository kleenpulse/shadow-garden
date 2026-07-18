import type { ComponentEntry } from "../types";

/** Power-User Systems — composite, stateful showcase pieces. */
export const powerUserSystems: ComponentEntry[] = [
	{
		slug: "sakura-tree",
		name: "SakuraTree",
		category: "Power-User Systems",
		tier: "pro",
		description:
			"A painterly toon-shaded 3D cherry-blossom scene with wind-driven falling petals.",
		dependencies: ["three", "@react-three/fiber"],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/sakura-tree/SakuraTree.tsx",
			},
		],
		props: [
			{
				name: "windSpeed",
				label: "Wind",
				kind: "number",
				default: 3,
				min: 0,
				max: 10,
				step: 0.5,
				description: "Branch sway and petal drift speed.",
			},
			{
				name: "fallingPetals",
				label: "Falling petals",
				kind: "number",
				default: 129,
				min: 0,
				max: 300,
				step: 1,
				description:
					"Number of petals drifting through the air. Fades out and disables when bloom is zero.",
				disabledWhen: { prop: "bloomAmount", equals: 0 },
			},
			{
				name: "bloomAmount",
				label: "Bloom",
				kind: "number",
				default: 0.85,
				min: 0,
				max: 1,
				step: 0.05,
				description: "Canopy fullness, bare branches to full blossom.",
			},
			{
				name: "weather",
				label: "Weather",
				kind: "enum",
				default: "clear",
				options: ["clear", "breezy", "overcast", "storm"],
				description:
					"Bundles ambient light, fog density and a wind multiplier.",
			},
			{
				name: "windDirection",
				label: "Wind direction",
				kind: "number",
				default: 45,
				min: 0,
				max: 360,
				step: 15,
				unit: "°",
				description: "Compass direction the petals drift toward.",
			},
			{
				name: "cameraDistance",
				label: "Camera distance",
				kind: "number",
				default: 8,
				min: 4,
				max: 12,
				step: 0.5,
				description: "Orbit radius — how far the camera sits from the tree.",
			},
		],
	},
	{
		slug: "command-palette",
		name: "CommandPalette",
		category: "Power-User Systems",
		tier: "pro",
		description:
			"A cmdk command menu with a plain or liquid-glass surface and hotkey trigger.",
		dependencies: ["cmdk", "motion", "lucide-react"],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/command-palette/CommandPalette.tsx",
			},
		],
		props: [
			{
				name: "hotkey",
				kind: "enum",
				default: "cmd+k",
				options: ["cmd+k", "ctrl+k", "/"],
				description:
					"Shortcut that opens the palette. cmd+k falls back to Ctrl+K on non-Apple platforms.",
			},
			{
				name: "loop",
				kind: "boolean",
				default: true,
				description: "Wrap keyboard selection at the list ends.",
			},
			{
				name: "glass",
				kind: "boolean",
				default: false,
				description: "Liquid-glass surface instead of a solid panel.",
			},
		],
	},
	{
		slug: "physics-engine",
		name: "PhysicsEngine",
		category: "Power-User Systems",
		tier: "pro",
		description:
			"A from-scratch 2D rigid-body physics lab — fixed-timestep impulse solver, drag-to-throw bodies, force and velocity overlays, and a live energy readout on a blueprint grid.",
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/physics-engine/PhysicsEngine.tsx",
			},
		],
		props: [
			{
				name: "scene",
				kind: "enum",
				default: "playground",
				options: ["playground", "stack", "wrecking-ball", "projectile"],
				description:
					"Preset world. Switching rebuilds the scene deterministically from a fixed seed.",
			},
			{
				name: "gravity",
				kind: "number",
				default: 9.8,
				min: 0,
				max: 30,
				step: 0.1,
				unit: "m/s²",
				description:
					"Uniform downward gravity. 0 is zero-g — throw bodies and watch them coast.",
			},
			{
				name: "restitution",
				kind: "number",
				default: 0.6,
				min: 0,
				max: 1,
				step: 0.05,
				description:
					"Bounciness of every collision, applied live to existing bodies. Impacts below 1 m/s are absorbed so stacks can settle.",
			},
			{
				name: "friction",
				kind: "number",
				default: 0.4,
				min: 0,
				max: 1,
				step: 0.05,
				description:
					"Coulomb friction coefficient for all contacts, applied live. 0 is ice; boxes need around 0.3 to stack.",
			},
			{
				name: "timeScale",
				kind: "number",
				default: 1,
				min: 0,
				max: 3,
				step: 0.1,
				unit: "×",
				description:
					"Simulation speed. Physics always steps at a fixed 120 Hz — this scales how much simulated time each frame consumes. 0 freezes time.",
			},
			{
				name: "bodyCount",
				kind: "number",
				default: 14,
				min: 4,
				max: 40,
				step: 1,
				description:
					"How many bodies the playground rains and how tall the stack and wrecking-ball towers build. Projectile ignores it.",
			},
			{
				name: "sizeVariation",
				kind: "number",
				default: 0.5,
				min: 0,
				max: 1,
				step: 0.05,
				description:
					"Spread of playground body sizes — 0 rains uniform bodies, 1 mixes pebbles with boulders. Density is fixed, so bigger really is heavier.",
			},
			{
				name: "showVectors",
				kind: "boolean",
				default: false,
				description:
					"Velocity (green, solid) and net-force (red, dashed) arrows anchored at each body's center of mass, scaled to magnitude.",
			},
			{
				name: "trails",
				kind: "boolean",
				default: true,
				description:
					"Fading motion trails behind moving bodies — read parabolas and pendulum arcs at a glance.",
			},
			{
				name: "showEnergy",
				kind: "boolean",
				default: true,
				description:
					"Live HUD readout of kinetic, potential, and total energy in joules, computed from solver state every step — never faked.",
			},
			{
				name: "tint",
				kind: "color",
				default: "#a855f7",
				description:
					"Accent color for dynamic bodies, trails, and the grab spring. Grid and chrome follow the theme.",
			},
		],
	},
];
