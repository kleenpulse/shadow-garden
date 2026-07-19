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
	{
		slug: "black-hole",
		name: "BlackHole",
		category: "Power-User Systems",
		tier: "pro",
		description:
			"A real-time Schwarzschild black hole raytraced per-pixel in a WebGL2 shader — null geodesics bend a lensed accretion disk over the event horizon, with Doppler beaming, gravitational redshift, a photon ring, and a lensed starfield, all under a cinematic orbit.",
		dependencies: ["ogl"],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/black-hole/BlackHole.tsx",
			},
		],
		props: [
			{
				name: "steps",
				label: "Quality",
				kind: "number",
				default: 300,
				min: 60,
				max: 600,
				step: 10,
				description:
					"Geodesic integration steps per ray. Higher sharpens the lensing and photon ring; lower runs faster. The single heaviest cost in the shader.",
			},
			{
				name: "diskInner",
				label: "Disk inner",
				kind: "number",
				default: 3,
				min: 2,
				max: 6,
				step: 0.1,
				unit: "Rs",
				description:
					"Inner disk radius in Schwarzschild radii. 3 Rs is the ISCO — the innermost stable circular orbit around a non-spinning hole.",
			},
			{
				name: "diskOuter",
				label: "Disk outer",
				kind: "number",
				default: 12,
				min: 6,
				max: 24,
				step: 0.5,
				unit: "Rs",
				description:
					"Outer edge of the accretion disk, in Schwarzschild radii.",
			},
			{
				name: "diskBrightness",
				label: "Disk brightness",
				kind: "number",
				default: 1,
				min: 0,
				max: 3,
				step: 0.05,
				unit: "×",
				description: "Overall emission of the accretion disk.",
			},
			{
				name: "ringColor",
				label: "Ring color",
				kind: "color",
				default: "#ffffff",
				description:
					"Recolors the accretion disk. White keeps the physical blackbody gradient (gold → white → blue) and the Doppler asymmetry; pick a hue to tint the ring without dimming it.",
			},
			{
				name: "dopplerMax",
				label: "Doppler",
				kind: "number",
				default: 1,
				min: 0,
				max: 1,
				step: 0.05,
				description:
					"Relativistic Doppler beaming and redshift strength. 0 flattens the disk to symmetric; 1 is the physical approaching-side-brighter, receding-side-dimmer asymmetry.",
			},
			{
				name: "starBrightness",
				label: "Starfield",
				kind: "number",
				default: 1,
				min: 0,
				max: 3,
				step: 0.05,
				unit: "×",
				description:
					"Brightness of the gravitationally lensed background stars and Milky Way band.",
			},
			{
				name: "skyFloor",
				label: "Sky floor",
				kind: "number",
				default: 0.02,
				min: 0,
				max: 0.2,
				step: 0.005,
				description:
					"Ambient deep-space glow filling the void behind the stars. Tinted by the halo color.",
			},
			{
				name: "rotationSpeed",
				label: "Orbit speed",
				kind: "number",
				default: 1,
				min: 0,
				max: 4,
				step: 0.1,
				unit: "×",
				description:
					"Speed of the cinematic camera orbit and the disk's differential swirl. 0 stops both.",
			},
			{
				name: "fov",
				label: "Field of view",
				kind: "number",
				default: 70,
				min: 30,
				max: 150,
				step: 1,
				unit: "°",
				description:
					"Observer camera field of view. Wider pushes the hole smaller and exaggerates the lensing curvature; narrower zooms in and flattens the perspective.",
			},
			{
				name: "bloomStrength",
				label: "Bloom",
				kind: "number",
				default: 1,
				min: 0,
				max: 3,
				step: 0.05,
				unit: "×",
				description:
					"Intensity of the HDR bloom that blooms the bright disk and photon ring. 0 disables the bloom passes entirely.",
			},
			{
				name: "bloomRadius",
				label: "Bloom radius",
				kind: "number",
				default: 1,
				min: 0.2,
				max: 2,
				step: 0.05,
				unit: "×",
				description: "Spread of the bloom blur. Disabled when bloom is 0.",
				disabledWhen: { prop: "bloomStrength", equals: 0 },
			},
			{
				name: "vignette",
				label: "Vignette",
				kind: "number",
				default: 0.4,
				min: 0,
				max: 1,
				step: 0.05,
				description: "Darkening toward the frame edges.",
			},
			{
				name: "grain",
				label: "Film grain",
				kind: "number",
				default: 0.06,
				min: 0,
				max: 0.3,
				step: 0.01,
				description: "Animated fine film grain over the final image.",
			},
			{
				name: "chromaticAberration",
				label: "Chromatic aberration",
				kind: "number",
				default: 0.15,
				min: 0,
				max: 1,
				step: 0.05,
				description: "Lens-edge color fringing, strongest toward the corners.",
			},
			{
				name: "autoOrbit",
				label: "Cinematic orbit",
				kind: "boolean",
				default: true,
				description:
					"Spin the camera continuously left-to-right around the hole at a fixed distance. Drag to take manual 360° control; the orbit resumes a few seconds after you let go and keeps spinning around your current view — it never resets the angle. Off freezes the current view, which you can still drag.",
			},
			{
				name: "debug",
				label: "Debug view",
				kind: "enum",
				default: "off",
				options: ["off", "steps", "disk", "min-r", "escape-dir", "redshift"],
				description:
					"Diagnostic shader outputs — step-count heatmap, disk-hit mask, closest-approach radius, escape direction, and the redshift factor.",
			},
			{
				name: "tint",
				label: "Halo tint",
				kind: "color",
				default: "#a855f7",
				description:
					"Accent that tints only the outer halo, photon ring, sky floor, and hero-star glow. The accretion disk keeps its physical blackbody color.",
			},
		],
	},
];
