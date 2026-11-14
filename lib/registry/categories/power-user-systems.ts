import type { ComponentEntry, Variant } from "../types";

/** lib/utils.ts ships with every entry whose source imports `cn`. Its own
 *  packages (clsx, tailwind-merge) are the host entry's to declare — the check
 *  walks into this file and finds them there (§V41). */
const UTILS_VARIANT: Variant = {
	lang: "ts",
	style: "tailwind",
	file: "lib/utils.ts",
	role: "util",
	label: "utils.ts",
};

/** ApprovalFlow is six files, not one. Same mapped-array shape as the explorer
 *  above, and the same reason: the Code panel gets one tab per variant, so the
 *  set is kept deliberately small and the reading order here is the order a
 *  buyer should open them in. It imports `cn`, so it takes UTILS_VARIANT and
 *  declares clsx + tailwind-merge itself (§V41). */
const APPROVAL_FLOW_PEERS: Variant[] = [
	"types.ts",
	"use-approval-flow.ts",
	"step-panel.tsx",
	"option-row.tsx",
	"decided-rail.tsx",
].map((name) => ({
	lang: "ts",
	style: "tailwind",
	file: `components/registry/approval-flow/${name}`,
	role: "peer",
	label: name,
}));
const VISUALIZER_PEERS: Variant[] = [
	"scene.tsx",
	"drilldown.tsx",
	"list.tsx",
	"segmented.tsx",
	"layout.ts",
	"vocab.tsx",
	"format.ts",
	"hooks.ts",
	"types.ts",
	"motion.ts",
	"rail.tsx",
].map((name) => ({
	lang: "ts",
	style: "tailwind",
	file: `components/registry/visualizer/${name}`,
	role: "peer",
	label: name,
}));

/** FileExplorer is assembled from its whole directory, not one file. Listed as a
 *  mapped array rather than 23 literals so the entry stays readable; the set is
 *  the component's transitive closure, which `check:registry` verifies. It
 *  carries its own `cn` in ./util, so it takes no UTILS_VARIANT. */
const FILE_EXPLORER_PEERS: Variant[] = [
	"auto-scroll.tsx",
	"breadcrumb.tsx",
	"context-menu.tsx",
	"detail-panel.tsx",
	"empty-state.tsx",
	"file-grid.tsx",
	"file-list.tsx",
	"folder-tree.tsx",
	"inline-rename.tsx",
	"storage-meter.tsx",
	"thumbnail.tsx",
	"toolbar.tsx",
	"undo-snackbar.tsx",
	"types.ts",
	"use-file-explorer.ts",
	"use-file-store.ts",
	"use-object-url.ts",
	"util.ts",
	"store/index.ts",
	"store/types.ts",
	"store/idb-store.ts",
	"store/memory-store.ts",
	"store/opfs-store.ts",
].map((name) => ({
	lang: "ts",
	style: "tailwind",
	file: `components/registry/file-explorer/${name}`,
	role: "peer",
	label: name,
}));

/** The animation runtime host, shipped alongside any entry whose closure
 *  reaches it (§C1b). */
const LOOP_HOST_VARIANT: Variant = {
	lang: "ts",
	style: "tailwind",
	file: "hooks/use-animation-loop.ts",
	role: "hook",
	label: "use-animation-loop.ts",
};

/** TimelineScrubber's supporting files — same mapped-array shape as the
 *  explorer's, for the same reason: the set IS the component's transitive
 *  closure, and `check:registry` is what proves it. */
const TIMELINE_PEERS: Variant[] = [
	"types.ts",
	"util.ts",
	"use-timeline.ts",
	"ruler.tsx",
	"markers.tsx",
	"playhead.tsx",
	"transport.tsx",
].map((name) => ({
	lang: "ts",
	style: "tailwind",
	file: `components/registry/timeline-scrubber/${name}`,
	role: "peer",
	label: name,
}));

/** DataGrid's supporting files. Same shape and the same guarantee. */
const DATA_GRID_PEERS: Variant[] = [
	"types.ts",
	"util.ts",
	"use-columns.ts",
	"use-virtual-rows.ts",
	"header-row.tsx",
	"body-rows.tsx",
	"skeleton-rows.tsx",
].map((name) => ({
	lang: "ts",
	style: "tailwind",
	file: `components/registry/data-grid/${name}`,
	role: "peer",
	label: name,
}));

/** Power-User Systems — composite, stateful showcase pieces. */
export const powerUserSystems: ComponentEntry[] = [
	{
		slug: "command-palette",
		name: "CommandPalette",
		category: "Power-User Systems",
		addedAt: "2026-07-16",
		description:
			"A cmdk command menu with a plain or liquid-glass surface and hotkey trigger.",
		dependencies: ["cmdk", "motion", "clsx", "tailwind-merge"],
		cookbook: ["Enter / Exit", "Scale in", "Blur"],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/command-palette/command-palette.tsx",
			},
			{
				lang: "ts",
				style: "tailwind",
				file: "components/ui/auto-mask-vertical.tsx",
				role: "peer",
				label: "auto-mask-vertical.tsx",
			},
			UTILS_VARIANT,
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
		addedAt: "2026-07-18",
		pausable: true,
		description:
			"A from-scratch 2D rigid-body physics lab. Fixed-timestep impulse solver, drag-to-throw bodies, force and velocity overlays, and a live energy readout on a blueprint grid.",
		cookbook: [
			"Drag",
			"Momentum",
			"Velocity",
			"Mass",
			"Bounce",
			"Frame rate (FPS)",
		],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/physics-engine/physics-engine.tsx",
			},
			{
				lang: "ts",
				style: "tailwind",
				file: "hooks/use-animation-loop.ts",
				role: "hook",
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
		addedAt: "2026-07-19",
		pausable: true,
		description:
			"A real-time Schwarzschild black hole raytraced per-pixel in a WebGL2 shader. Null geodesics bend a lensed accretion disk over the event horizon, with Doppler beaming, gravitational redshift, a photon ring, and a lensed starfield, all under a cinematic orbit.",
		dependencies: ["ogl", "clsx", "tailwind-merge"],
		cookbook: ["Orbit", "Loop", "Drag", "Frame rate (FPS)"],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/black-hole/black-hole.tsx",
			},
			{
				lang: "ts",
				style: "tailwind",
				file: "hooks/use-animation-loop.ts",
				role: "hook",
				label: "use-animation-loop.ts",
			},
			UTILS_VARIANT,
		],
		props: [
			{
				name: "steps",
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
				kind: "color",
				default: "#ff9e38",
				description:
					"Recolors the accretion disk. White keeps the physical blackbody gradient (gold → white → blue) and the Doppler asymmetry; pick a hue to tint the ring without dimming it.",
			},
			{
				name: "dopplerMax",
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
				kind: "number",
				default: 85,
				min: 30,
				max: 150,
				step: 1,
				unit: "°",
				description:
					"Observer camera field of view. Wider pushes the hole smaller and exaggerates the lensing curvature; narrower zooms in and flattens the perspective.",
			},
			{
				name: "bloomStrength",
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
				kind: "number",
				default: 0.4,
				min: 0,
				max: 1,
				step: 0.05,
				description: "Darkening toward the frame edges.",
			},
			{
				name: "grain",
				kind: "number",
				default: 0.06,
				min: 0,
				max: 0.3,
				step: 0.01,
				description: "Animated fine film grain over the final image.",
			},
			{
				name: "chromaticAberration",
				kind: "number",
				default: 0.15,
				min: 0,
				max: 1,
				step: 0.05,
				description: "Lens-edge color fringing, strongest toward the corners.",
			},
			{
				name: "autoOrbit",
				kind: "boolean",
				default: true,
				description:
					"Spin the camera continuously left-to-right around the hole at a fixed distance. Drag to take manual 360° control; the orbit resumes a few seconds after you let go and keeps spinning around your current view — it never resets the angle. Off freezes the current view, which you can still drag.",
			},
			{
				name: "debug",
				kind: "enum",
				default: "off",
				options: ["off", "steps", "disk", "min-r", "escape-dir", "redshift"],
				description:
					"Diagnostic shader outputs — step-count heatmap, disk-hit mask, closest-approach radius, escape direction, and the redshift factor.",
			},
			{
				name: "tint",
				kind: "color",
				default: "#a855f7",
				description:
					"Accent that tints only the outer halo, photon ring, sky floor, and hero-star glow. The accretion disk keeps its physical blackbody color.",
			},
		],
	},
	{
		slug: "vortex-bloom",
		name: "VortexBloom",
		category: "Power-User Systems",
		addedAt: "2026-07-21",
		pausable: true,
		description:
			"A molten-gold-and-obsidian vortex funnel spiraling into a luminous SDF core, either lotus, gem, or flame, raymarched per-pixel in a WebGL2 shader, with a GPU dust field spiraling down the flow toward the throat, all under a draggable orbit and a real two-pass bloom.",
		dependencies: ["ogl", "clsx", "tailwind-merge"],
		cookbook: ["Orbit", "Loop", "Drag", "Blur"],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/vortex-bloom/vortex-bloom.tsx",
			},
			{
				lang: "ts",
				style: "tailwind",
				file: "hooks/use-animation-loop.ts",
				role: "hook",
				label: "use-animation-loop.ts",
			},
			UTILS_VARIANT,
		],
		props: [
			{
				name: "primary",
				kind: "color",
				default: "#f0a830",
				description:
					"Molten-gold high tone — the color of the swirling streaks and the throat glints.",
			},
			{
				name: "secondary",
				kind: "color",
				default: "#120e1a",
				description:
					"Obsidian deep tone — the funnel's shadowed lanes and the void behind it.",
			},
			{
				name: "accent",
				kind: "color",
				default: "#ffe7a3",
				description:
					"Luminous core-emission tint. Drives the color of the convergence bloom and the dust as it reaches the core.",
			},
			{
				name: "coreObject",
				kind: "enum",
				default: "lotus",
				options: ["lotus", "gem", "flame"],
				description:
					"The centerpiece sitting at the vortex's convergence — a layered petal lotus, a faceted crystal, or an animated flame plume. Swapping it never moves the point the dust flows toward.",
			},
			{
				name: "coreScale",
				kind: "number",
				default: 1.5,
				min: 0.5,
				max: 3,
				step: 0.1,
				unit: "×",
				description:
					"Scales the centerpiece — lotus, gem, or flame — up or down without moving the convergence the dust flows toward.",
			},
			{
				name: "stemLength",
				kind: "number",
				default: 1.4,
				min: 0,
				max: 3,
				step: 0.1,
				description:
					"Length of the lotus stalk hanging into the flow beneath the flower. Lotus only; 0 removes it.",
			},
			{
				name: "vortexIntensity",
				kind: "number",
				default: 7,
				min: 1,
				max: 10,
				step: 0.5,
				description:
					"Swirl speed, streak turbulence, and dust inflow speed. Higher winds the funnel tighter and faster.",
			},
			{
				name: "glowIntensity",
				kind: "number",
				default: 8,
				min: 1,
				max: 10,
				step: 0.5,
				description:
					"Core emission and HDR bloom strength. Drives how hard the convergence and the dust bloom.",
			},
			{
				name: "particleDensity",
				kind: "number",
				default: 200,
				min: 0,
				max: 1200,
				step: 50,
				description:
					"Dust grains spiraling down the flow. Capped at 1200 to hold 60fps on a mid-range GPU.",
			},
			{
				name: "particleSpeed",
				kind: "number",
				default: 0,
				min: 0,
				max: 3,
				step: 0.1,
				unit: "×",
				description:
					"How fast the dust grains stream down the flow toward the core, independent of the swirl speed.",
			},
			{
				name: "smokeAmount",
				kind: "number",
				default: 0.6,
				min: 0,
				max: 2,
				step: 0.05,
				description:
					"Soft, low-frequency atmospheric haze drifting behind the ribbons. 0 leaves crisp streaks on obsidian; higher fills the frame with smoke.",
			},
			{
				name: "cameraAutoRotate",
				kind: "boolean",
				default: true,
				description:
					"Continuously orbit the funnel. Drag to take 360° control; the orbit resumes around your current view a moment after you let go.",
			},
			{
				name: "rotationSpeed",
				kind: "number",
				default: 1,
				min: 0,
				max: 4,
				step: 0.1,
				unit: "×",
				description: "Speed of the cinematic camera orbit.",
				disabledWhen: { prop: "cameraAutoRotate", equals: false },
			},
			{
				name: "fov",
				kind: "number",
				default: 60,
				min: 30,
				max: 120,
				step: 1,
				unit: "°",
				description:
					"Observer field of view. Wider exaggerates the whirlpool's depth; narrower flattens it.",
			},
			{
				name: "verticalOffset",
				kind: "number",
				default: 0,
				min: -1,
				max: 1,
				step: 0.05,
				description:
					"Slides the whole vortex up or down in the frame without moving the camera — recenter the eye where you want it.",
			},
			{
				name: "chromaticAberration",
				kind: "number",
				default: 0.15,
				min: 0,
				max: 1,
				step: 0.05,
				description: "Lens-edge color fringing, strongest toward the corners.",
			},
			{
				name: "vignette",
				kind: "number",
				default: 0.4,
				min: 0,
				max: 1,
				step: 0.05,
				description: "Darkening toward the frame edges.",
			},
			{
				name: "grain",
				kind: "number",
				default: 0.02,
				min: 0,
				max: 0.3,
				step: 0.01,
				description: "Animated fine film grain over the final image.",
			},
		],
	},
	{
		slug: "smoke-field",
		name: "SmokeField",
		category: "Power-User Systems",
		addedAt: "2026-07-22",
		pausable: true,
		description:
			"A real-time GPU fluid you can stir. Semi-Lagrangian advection, a Jacobi pressure solve, and vorticity confinement run every frame across ping-ponged float buffers, injecting a dark amethyst plume that curls, billows, and bleeds through the frame wherever you drag.",
		dependencies: ["ogl"],
		cookbook: ["Drag", "Loop", "Idle animation"],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/smoke-field/smoke-field.tsx",
			},
			{
				lang: "ts",
				style: "tailwind",
				file: "hooks/use-animation-loop.ts",
				role: "hook",
				label: "use-animation-loop.ts",
			},
		],
		props: [
			{
				name: "dyeColor",
				kind: "color",
				default: "#a855f7",
				description: "Color of the dye injected into the fluid.",
			},
			{
				name: "backgroundColor",
				kind: "color",
				default: "#05010a",
				description: "Background the plume rises against.",
			},
			{
				name: "quality",
				kind: "enum",
				default: "medium",
				options: ["low", "medium", "high"],
				description:
					"Bundles simulation and dye buffer resolution. Higher is finer and costlier.",
			},
			{
				name: "pressureIterations",
				kind: "number",
				default: 25,
				min: 10,
				max: 60,
				step: 5,
				description:
					"Jacobi pressure passes per frame — higher makes the flow tighter and more incompressible.",
			},
			{
				name: "velocityFade",
				kind: "number",
				default: 0.98,
				min: 0.9,
				max: 1,
				step: 0.005,
				description: "How long motion persists before it dissipates.",
			},
			{
				name: "densityFade",
				kind: "number",
				default: 0.97,
				min: 0.9,
				max: 1,
				step: 0.005,
				description: "How long the dye lingers before fading out.",
			},
			{
				name: "curl",
				kind: "number",
				default: 20,
				min: 0,
				max: 50,
				step: 1,
				description:
					"Vorticity-confinement strength — swirl detail. 0 skips the curl passes.",
			},
			{
				name: "splatRadius",
				kind: "number",
				default: 0.2,
				min: 0.05,
				max: 0.5,
				step: 0.01,
				description: "Size of the dye and force splat under the pointer.",
			},
			{
				name: "splatForce",
				kind: "number",
				default: 1,
				min: 0,
				max: 3,
				step: 0.1,
				unit: "×",
				description: "Velocity impulse imparted by a pointer drag.",
			},
			{
				name: "autoPlume",
				kind: "boolean",
				default: true,
				description:
					"Continuously inject a rising plume at the base when idle.",
			},
			{
				name: "buoyancy",
				kind: "number",
				default: 1,
				min: 0,
				max: 3,
				step: 0.1,
				description:
					"Upward force lifting the dye, so smoke rises. 0 lets it drift neutrally.",
			},
			{
				name: "exposure",
				kind: "number",
				default: 1.2,
				min: 0.5,
				max: 3,
				step: 0.05,
				unit: "×",
				description: "Brightness of the rendered dye.",
			},
			{
				name: "grain",
				kind: "number",
				default: 0.04,
				min: 0,
				max: 0.3,
				step: 0.01,
				description: "Animated grain over the final image.",
			},
		],
	},
	{
		slug: "ripple-field",
		name: "RippleField",
		category: "Power-User Systems",
		addedAt: "2026-07-22",
		pausable: true,
		description:
			"A pool of dark, moonlit water you disturb by hand. A leapfrog solve of the 2D wave equation runs on a ping-ponged float field, ringing every pointer move outward, reflecting the swell off the walls, and lighting the surface with gradient-normal refraction, curvature-focused caustics, and a Fresnel glint riding each wavefront.",
		dependencies: ["ogl"],
		cookbook: ["Ripple", "Drag", "Loop"],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/ripple-field/ripple-field.tsx",
			},
			{
				lang: "ts",
				style: "tailwind",
				file: "hooks/use-animation-loop.ts",
				role: "hook",
				label: "use-animation-loop.ts",
			},
		],
		props: [
			{
				name: "waterColor",
				kind: "color",
				default: "#F7FAFF",
				description:
					"Amethyst tint of the water — specular glints, caustics, and crest light.",
			},
			{
				name: "deepColor",
				kind: "color",
				default: "#1227E1",
				description: "Deep pool base color the surface sits over.",
			},
			{
				name: "quality",
				kind: "enum",
				default: "medium",
				options: ["low", "medium", "high"],
				description:
					"Simulation grid resolution. Higher is crisper and costlier.",
			},
			{
				name: "tension",
				kind: "number",
				default: 0.35,
				min: 0.05,
				max: 0.49,
				step: 0.01,
				description:
					"Wave propagation speed. Higher spreads ripples faster; the leapfrog solve caps below 0.5 to stay stable.",
			},
			{
				name: "damping",
				kind: "number",
				default: 0.99,
				min: 0.9,
				max: 0.999,
				step: 0.001,
				description:
					"Per-step energy retention — toward 1 the ripples ring on longer.",
			},
			{
				name: "splatForce",
				kind: "number",
				default: 1,
				min: 0,
				max: 3,
				step: 0.1,
				unit: "×",
				description:
					"Displacement a pointer drag or ambient drop carves into the surface.",
			},
			{
				name: "splatRadius",
				kind: "number",
				default: 0.03,
				min: 0.005,
				max: 0.1,
				step: 0.005,
				description:
					"Size of the surface dimple under the pointer, in screen fractions.",
			},
			{
				name: "refraction",
				kind: "number",
				default: 1,
				min: 0,
				max: 3,
				step: 0.1,
				unit: "×",
				description:
					"How strongly the surface slope bends the pool floor beneath the ripples.",
			},
			{
				name: "specular",
				kind: "number",
				default: 0.4,
				min: 0,
				max: 3,
				step: 0.1,
				unit: "×",
				description:
					"Intensity of the specular and Fresnel glints on each wavefront.",
			},
			{
				name: "glossiness",
				kind: "number",
				default: 96,
				min: 8,
				max: 200,
				step: 4,
				description:
					"Specular tightness — higher is a sharper, glassier highlight.",
			},
			{
				name: "caustics",
				kind: "number",
				default: 1.5,
				min: 0,
				max: 3,
				step: 0.1,
				unit: "×",
				description:
					"Brightness of the caustic threads where converging wavefronts focus light.",
			},
			{
				name: "autoRipple",
				kind: "boolean",
				default: true,
				description:
					"Randomly drop into the pool when idle so it never sits perfectly still.",
			},
			{
				name: "grain",
				kind: "number",
				default: 0,
				min: 0,
				max: 0.2,
				step: 0.01,
				description: "Animated fine grain over the final image.",
			},
		],
	},
	{
		slug: "umbral-orrery",
		name: "UmbralOrrery",
		category: "Power-User Systems",
		addedAt: "2026-07-24",
		pausable: true,
		description:
			"A planet, its moons and their sun, drawn by one ray-traced shader. Each moon casts a real eclipse shadow on the planet, dark in the middle and soft at the edge. A moon turns ember red when it passes into the planet's own shadow. Drag to move the camera around to the night side, where the atmosphere lights up as a ring.",
		dependencies: ["ogl"],
		cookbook: ["Orbit", "Loop", "Drag", "Momentum", "Idle animation"],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/umbral-orrery/umbral-orrery.tsx",
			},
			{
				lang: "ts",
				style: "tailwind",
				file: "hooks/use-animation-loop.ts",
				role: "hook",
				label: "use-animation-loop.ts",
			},
		],
		props: [
			{
				name: "moonCount",
				kind: "number",
				default: 4,
				min: 1,
				max: 6,
				step: 1,
				description:
					"How many moons orbit the planet.",
			},
			{
				name: "orbitSpeed",
				kind: "number",
				default: 1,
				min: 0,
				max: 3,
				step: 0.05,
				unit: "×",
				description:
					"Speed of every orbit. Inner moons always go around faster than outer ones.",
			},
			{
				name: "tilt",
				kind: "number",
				default: 0.3,
				min: 0,
				max: 1.2,
				step: 0.05,
				unit: "rad",
				description:
					"Turns the orbits around the line from the sun to the planet. Every moon still makes an eclipse at any tilt.",
			},
			{
				name: "moonSize",
				kind: "number",
				default: 0.2,
				min: 0.08,
				max: 0.35,
				step: 0.01,
				description:
					"Size of the moons. The planet's radius is 1.",
			},
			{
				name: "sunSize",
				kind: "number",
				default: 0.05,
				min: 0.01,
				max: 0.14,
				step: 0.005,
				unit: "rad",
				description:
					"Size of the sun in the sky. A bigger sun gives softer shadow edges.",
			},
			{
				name: "sunIntensity",
				kind: "number",
				default: 1.6,
				min: 0.3,
				max: 4,
				step: 0.1,
				description:
					"Brightness of the sunlight.",
			},
			{
				name: "atmosphere",
				kind: "number",
				default: 1,
				min: 0,
				max: 2.5,
				step: 0.05,
				description:
					"Strength of the glow around the planet.",
			},
			{
				name: "trails",
				kind: "number",
				default: 0.6,
				min: 0,
				max: 1.5,
				step: 0.05,
				description:
					"Brightness of the orbit lines. 0 hides them.",
			},
			{
				name: "drift",
				kind: "number",
				default: 0.03,
				min: 0,
				max: 0.3,
				step: 0.01,
				unit: "rad/s",
				description:
					"How fast the camera circles on its own. 0 keeps it still.",
			},
			{
				name: "zoom",
				kind: "number",
				default: 1.5,
				min: 0.7,
				max: 3.5,
				step: 0.05,
				unit: "×",
				description:
					"How close the view is.",
			},
			{
				name: "sunColor",
				kind: "color",
				default: "#ffb24d",
				description: "Color of the sun and its light.",
			},
			{
				name: "glowColor",
				kind: "color",
				default: "#a855f7",
				description: "Color of the planet's atmosphere.",
			},
			{
				name: "planetColor",
				kind: "color",
				default: "#4b3a8c",
				description: "Main color of the planet's cloud bands.",
			},
			{
				name: "backgroundColor",
				kind: "color",
				default: "#05060a",
				description: "Color of space behind the scene.",
			},
		],
	},
	{
		slug: "parallax-rail",
		name: "ParallaxRail",
		category: "Power-User Systems",
		addedAt: "2026-07-26",
		description:
			"A pinned section where scrolling down drives content sideways across depth planes moving at different rates.",
		dependencies: ["motion", "clsx", "tailwind-merge"],
		cookbook: [
			"Parallax",
			"Scroll-driven animation",
			"Translate",
			"Orchestration",
			"Mask",
			"Compositing",
		],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/parallax-rail/parallax-rail.tsx",
			},
			UTILS_VARIANT,
		],
		props: [
			{
				name: "planes",
				kind: "number",
				default: 3,
				min: 1,
				max: 3,
				step: 1,
				description: "How many depth planes to render.",
			},
			{
				name: "travel",
				kind: "number",
				default: 1,
				min: 0.3,
				max: 2.5,
				step: 0.1,
				unit: "×",
				description: "Multiplier on the front rail's travel across the pin.",
			},
			{
				name: "depthSpread",
				kind: "number",
				default: 0.45,
				min: 0,
				max: 1,
				step: 0.05,
				description: "How much slower the backmost plane moves than the front.",
			},
			{
				name: "damping",
				kind: "number",
				default: 30,
				min: 10,
				max: 90,
				step: 5,
				description:
					"Spring damping on the scrub — higher tracks scroll exactly.",
			},
			{
				name: "fadeEdges",
				kind: "number",
				default: 0.12,
				min: 0,
				max: 0.4,
				step: 0.02,
				description: "Width of the soft mask at each rail edge.",
			},
			{
				name: "railGap",
				kind: "number",
				default: 24,
				min: 8,
				max: 64,
				step: 4,
				unit: "px",
				description: "Vertical gap between planes.",
			},
		],
	},
	{
		slug: "approval-flow",
		name: "ApprovalFlow",
		category: "Power-User Systems",
		addedAt: "2026-08-06",
		description:
			'A step-by-step approval checklist for agent permissions. Radio and checkbox groups, an "Other…" escape hatch that grows a field in place, and per-step validation that blocks the commit. Answering a step sends the chosen option flying into a running record of what you have already decided, so the screen accumulates a decision trail instead of replacing itself.',
		dependencies: ["motion", "clsx", "tailwind-merge"],
		cookbook: [
			"Morph",
			"Shared element transition",
			"Layout animation",
			"Stepped animation",
			"Direction-aware transition",
			"Shake / Wiggle",
			"Spatial consistency",
		],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/approval-flow/approval-flow.tsx",
			},
			...APPROVAL_FLOW_PEERS,
			UTILS_VARIANT,
		],
		props: [
			{
				name: "layout",
				kind: "enum",
				default: "rail",
				options: ["rail", "inline"],
				description:
					"Where the record of decided steps sits. A rail parks it beside the live step on wide screens; inline stacks it above.",
			},
			{
				name: "morphDuration",
				kind: "number",
				default: 420,
				min: 120,
				max: 1200,
				step: 10,
				unit: "ms",
				description:
					"Step change, option reveal and the escape hatch growing open. The flight into the record is a spring and ignores this — stiffness and damping own that one.",
			},
			{
				name: "stiffness",
				kind: "number",
				default: 380,
				min: 80,
				max: 800,
				step: 10,
				description:
					"How hard the chosen option is pulled toward its slot in the record.",
			},
			{
				name: "damping",
				kind: "number",
				default: 34,
				min: 8,
				max: 80,
				step: 1,
				description:
					"How fast that flight settles. Low values let the label overshoot its slot before landing.",
			},
			{
				name: "density",
				kind: "enum",
				default: "comfortable",
				options: ["comfortable", "compact"],
				description: "Row height, padding and glyph size throughout.",
			},
			{
				name: "revealStagger",
				kind: "number",
				default: 45,
				min: 0,
				max: 200,
				step: 5,
				unit: "ms",
				description:
					"Delay added per option as a step's list arrives. 0 lands the whole group at once.",
			},
			{
				name: "shakeIntensity",
				kind: "number",
				default: 6,
				min: 0,
				max: 16,
				step: 1,
				unit: "px",
				description:
					"Travel of the shake when a step is rejected. 0 disables it — the message and the red border still fire, because a rejection with no signal at all is a dead end.",
			},
			{
				name: "shakeCycles",
				kind: "number",
				default: 3,
				min: 1,
				max: 6,
				step: 1,
				description:
					"Round trips in that shake. Each one decays, and the last always ends on centre.",
				disabledWhen: { prop: "shakeIntensity", equals: 0 },
			},
			{
				name: "showProgress",
				kind: "boolean",
				default: true,
				description: "Completion bar and step count above the live step.",
			},
			{
				name: "autoAdvance",
				kind: "boolean",
				default: false,
				description:
					"Commit a single-choice step the moment it is answered. Never applies to the escape hatch, which needs a sentence first, and it is forced off under reduced motion.",
			},
			{
				name: "accentColor",
				kind: "color",
				default: "#a855f7",
				description:
					"Selection, checked glyph, progress fill and the approve button.",
			},
			{
				name: "dangerColor",
				kind: "color",
				default: "#f87171",
				description: "Invalid row border and the rejection message.",
			},
		],
	},
	{
		slug: "diff-review",
		name: "DiffReview",
		category: "Power-User Systems",
		addedAt: "2026-08-06",
		description:
			"A review surface for a patch an agent has proposed. Accept or reject each hunk, fold long runs of unchanged lines away, and flip between unified and split. Switching views does not redraw the diff: every line is a shared element that flies from the stream into its column and back, so you never lose the line you were reading.",
		dependencies: ["motion", "clsx", "tailwind-merge"],
		cookbook: [
			"Morph",
			"Shared element transition",
			"Layout animation",
			"Crossfade",
			"Stagger",
			"Accordion / Collapse",
			"Spatial consistency",
		],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/diff-review/diff-review.tsx",
			},
			UTILS_VARIANT,
		],
		props: [
			{
				name: "defaultView",
				kind: "enum",
				default: "unified",
				options: ["unified", "split"],
				description:
					"Starting layout. One interleaved stream, or the old file beside the new one. The toolbar toggle overrides it live.",
			},
			{
				name: "morphDuration",
				kind: "number",
				default: 380,
				min: 120,
				max: 1200,
				step: 10,
				unit: "ms",
				description:
					"Hunk fold, verdict change and the first reveal of a line. The flight between views is a spring and ignores this — stiffness and damping own that one.",
			},
			{
				name: "stiffness",
				kind: "number",
				default: 420,
				min: 80,
				max: 800,
				step: 10,
				description:
					"How hard a line is pulled toward its slot in the other view.",
			},
			{
				name: "damping",
				kind: "number",
				default: 38,
				min: 8,
				max: 80,
				step: 1,
				description:
					"How fast that flight settles. Low values let a line overshoot its column before landing.",
			},
			{
				name: "stagger",
				kind: "number",
				default: 14,
				min: 0,
				max: 80,
				step: 2,
				unit: "ms",
				description:
					"Delay added per line as a hunk first appears. Capped at twelve lines in, so expanding a long fold never leaves the last row waiting in plain sight.",
			},
			{
				name: "density",
				kind: "enum",
				default: "comfortable",
				options: ["comfortable", "compact"],
				description: "Row height and type size throughout.",
			},
			{
				name: "showLineNumbers",
				kind: "boolean",
				default: true,
				description:
					"Old and new line numbers in the gutter. Split view shows one per side; unified shows the surviving number.",
			},
			{
				name: "contextLines",
				kind: "number",
				default: 3,
				min: 0,
				max: 10,
				step: 1,
				description:
					"Unchanged lines kept on the side of a run that faces a change. The rest fold behind an expander — except a fold that would hide a single line, which costs a row to save a row.",
			},
			{
				name: "collapseDecided",
				kind: "boolean",
				default: true,
				description:
					"Fold a hunk's body away once it has a verdict, leaving the header and an Undo. Off keeps every hunk open so you can re-read what you just ruled on.",
			},
			{
				name: "addColor",
				kind: "color",
				default: "#4ade80",
				description:
					"Added lines, their gutter sign, and an accepted hunk's edge.",
			},
			{
				name: "delColor",
				kind: "color",
				default: "#f87171",
				description:
					"Removed lines, their gutter sign, and a rejected hunk's edge.",
			},
			{
				name: "accentColor",
				kind: "color",
				default: "#a855f7",
				description:
					"Active view toggle, fold expanders, focus rings and the reviewed counter once every hunk has been ruled on.",
			},
		],
	},
	{
		slug: "ledger",
		name: "Ledger",
		category: "Power-User Systems",
		addedAt: "2026-08-06",
		pausable: true,
		description:
			"A live activity log for a working agent. Consecutive events from the same source fold into one block instead of stacking as identical rows, the window holds a fixed number and lets the rest fall off the top, and the scroll stays pinned to the newest line only until you scroll away from it. After that it keeps running and tells you how far behind you are.",
		dependencies: ["motion", "clsx", "tailwind-merge"],
		cookbook: [
			"Loop",
			"Idle animation",
			"Pulse",
			"Fade in / Fade out",
			"Slide in",
		],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/ledger/ledger.tsx",
			},
			{
				lang: "ts",
				style: "tailwind",
				file: "hooks/use-animation-loop.ts",
				role: "hook",
				label: "use-animation-loop.ts",
			},
			UTILS_VARIANT,
		],
		props: [
			{
				name: "speed",
				kind: "number",
				default: 1,
				min: 0.1,
				max: 3,
				step: 0.1,
				unit: "×",
				description:
					"Multiplier on the whole cadence — typing and the gaps between events together.",
			},
			{
				name: "charsPerSecond",
				kind: "number",
				default: 90,
				min: 10,
				max: 400,
				step: 10,
				description:
					"Typing rate before jitter. The full text of an event is in the accessibility tree from the moment it arrives, so only the eye waits for this.",
			},
			{
				name: "entryGap",
				kind: "number",
				default: 520,
				min: 0,
				max: 3000,
				step: 20,
				unit: "ms",
				description: "Pause between one event landing and the next starting.",
			},
			{
				name: "jitter",
				kind: "number",
				default: 0.35,
				min: 0,
				max: 1,
				step: 0.05,
				description:
					"Spread on the per-event rate, metronome to wildly uneven. A fast burst draws a longer breath after it, so the unevenness reads as work rather than as noise. Seeded, not random — the same run is reproducible every mount.",
			},
			{
				name: "maxEntries",
				kind: "number",
				default: 9,
				min: 3,
				max: 24,
				step: 1,
				description:
					"Events retained before the oldest falls off the top, under a fade that keeps the window reading as a view onto a longer log.",
			},
			{
				name: "group",
				kind: "boolean",
				default: true,
				description:
					"Fold consecutive same-source events into one block with a count. The block wears the worst severity in it, so a denial folded in among routine reads still shows red.",
			},
			{
				name: "showTimestamps",
				kind: "boolean",
				default: true,
				description:
					"Elapsed stream time beside each block. Measured from the component's own clock, never from the wall clock, so it is identical on every replay.",
			},
			{
				name: "caret",
				kind: "boolean",
				default: true,
				description:
					"Blinking block caret on the line currently being written.",
			},
			{
				name: "loop",
				kind: "boolean",
				default: true,
				description:
					"Wrap to the first event when the source list runs out. Off lets the stream halt itself once, and the header reads complete.",
			},
			{
				name: "density",
				kind: "enum",
				default: "comfortable",
				options: ["comfortable", "compact"],
				description: "Row height and type size throughout.",
			},
			{
				name: "accentColor",
				kind: "color",
				default: "#a855f7",
				description:
					"Live indicator, caret, catch-up pill and the ok severity.",
			},
			{
				name: "warnColor",
				kind: "color",
				default: "#f0a830",
				description: "The warn severity.",
			},
			{
				name: "denyColor",
				kind: "color",
				default: "#f87171",
				description: "The deny severity.",
			},
		],
	},
	{
		slug: "rotunda",
		name: "Rotunda",
		category: "Power-User Systems",
		addedAt: "2026-08-06",
		description:
			"Real HTML panels on a drag-spun 3D cylinder. A hand-rolled perspective projection written onto DOM elements rather than a canvas, so the text stays selectable, the links stay clickable, and a screen reader still reads every panel while the ring turns.",
		dependencies: [],
		cookbook: [
			"Drag",
			"Momentum",
			"Damping",
			"Perspective",
			"3D tilt / Flip",
			"Spatial consistency",
		],
		pausable: true,
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/rotunda/rotunda.tsx",
			},
			{
				lang: "ts",
				style: "tailwind",
				file: "hooks/use-animation-loop.ts",
				role: "hook",
				label: "use-animation-loop.ts",
			},
		],
		props: [
			{
				name: "radius",
				kind: "number",
				default: 380,
				min: 160,
				max: 900,
				step: 10,
				unit: "px",
				description:
					"Distance from the axis to each panel face. Together with the number of panels this decides whether the ring closes: too small for the count and the faces intersect, which is the one way this arrangement can look broken rather than tight.",
			},
			{
				name: "perspective",
				kind: "number",
				default: 1200,
				min: 400,
				max: 3000,
				step: 50,
				unit: "px",
				description:
					"Depth of the projection, and the control that decides whether this reads as expensive or as a cheap paper fan. Near enough and the front panel distorts violently; far enough and the ring flattens into a row of cards.",
			},
			{
				name: "autoSpin",
				kind: "number",
				default: 0.06,
				min: 0,
				max: 1,
				step: 0.01,
				unit: "×",
				description:
					"Idle rotation while nothing is being dragged. It stops the instant the pointer arrives and does not restart until it leaves, because a carousel that keeps moving under your cursor is a carousel you cannot read.",
			},
			{
				name: "friction",
				kind: "number",
				default: 0.94,
				min: 0.8,
				max: 0.995,
				step: 0.005,
				description:
					"How much of a fling survives, and the whole feel of the throw. Applied per second rather than per frame, so the same gesture coasts the same distance on a 60Hz and a 120Hz display — the naive per-frame form silently halves the throw on better hardware.",
			},
			{
				name: "snap",
				kind: "boolean",
				default: true,
				description:
					"Settle to the nearest panel once a fling drops below walking pace. Off, the ring stops wherever it stops — honest for a texture, wrong for a menu.",
			},
			{
				name: "snapStiffness",
				kind: "number",
				default: 140,
				min: 20,
				max: 400,
				step: 10,
				disabledWhen: { prop: "snap", equals: false },
				description:
					"How hard the ring is pulled to the nearest face. Damping is derived from it at the critical ratio, so raising this arrives faster without ever adding the overshoot that would read as a wobble on a menu.",
			},
			{
				name: "depthDim",
				kind: "number",
				default: 0.65,
				min: 0,
				max: 1,
				step: 0.05,
				description:
					"How far the back of the ring dims toward the background. Depth cueing sells the illusion harder than the rotation does, because a CSS transform gives you no occlusion to work with.",
			},
			{
				name: "depthBlur",
				kind: "number",
				default: 3,
				min: 0,
				max: 10,
				step: 0.5,
				unit: "px",
				description:
					"Blur on panels past the halfway point. Applied to an inner wrapper rather than the panel itself: a filter on a child of a preserve-3d parent establishes a containing block and flattens the entire ring into a stack.",
			},
			{
				name: "faceCamera",
				kind: "boolean",
				default: false,
				description:
					"Keep every panel square to the viewer rather than tangent to the ring. This turns the carousel into a card rack, and it is the right choice the moment the panels carry real copy you expect anyone to read off-centre.",
			},
			{
				name: "dragSensitivity",
				kind: "number",
				default: 0.35,
				min: 0.05,
				max: 1.5,
				step: 0.05,
				unit: "°/px",
				description:
					"Degrees of rotation per pixel of drag. The honest test is whether the panel under your finger stays under your finger — too low and the ring feels geared down, too high and a small gesture spins it past the panel you were reaching for.",
			},
		],
	},
	{
		slug: "ascii-engine",
		name: "AsciiEngine",
		category: "Power-User Systems",
		addedAt: "2026-08-07",
		description:
			"A lit, raymarched 3D solid rendered at exactly one pixel per character cell, then quantised into a glyph ramp drawn once with fillText. Drag to orbit it through a full three-sixty. Real geometry underneath, terminal on top, with no scene graph, no mesh, and no second library to get there.",
		dependencies: ["ogl"],
		cookbook: [
			"Loop",
			"Rotate",
			"Drag",
			"Momentum",
			"Stepped animation",
			"Idle animation",
			"Compositing",
		],
		pausable: true,
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/ascii-engine/ascii-engine.tsx",
			},
			{
				lang: "ts",
				style: "tailwind",
				file: "hooks/use-animation-loop.ts",
				role: "hook",
				label: "use-animation-loop.ts",
			},
		],
		props: [
			{
				name: "solid",
				kind: "enum",
				default: "torus-knot",
				options: ["torus-knot", "cube", "sphere", "gyroid", "column"],
				description:
					"Which distance field is raymarched into the first pass. A field rather than a mesh: the silhouette stays exact at any cell size because it is evaluated instead of rasterised, which is why this needs no scene graph and no geometry upload.",
			},
			{
				name: "charset",
				kind: "enum",
				default: "classic",
				options: ["classic", "blocks", "minimal", "binary", "dots"],
				description:
					"The glyph ramp, darkest to lightest. The atlas is drawn once with fillText into an offscreen canvas and uploaded as a single texture, so the shader just indexes it and a longer ramp costs nothing per frame.",
			},
			{
				name: "cellSize",
				kind: "number",
				default: 10,
				min: 4,
				max: 28,
				step: 1,
				unit: "px",
				description:
					"Width of one character cell, and the real resolution control. The first pass renders at exactly one texel per cell, so halving this quadruples the raymarch and changes nothing else — which makes it the honest performance dial rather than a cosmetic one.",
			},
			{
				name: "spinSpeed",
				kind: "number",
				default: 0.35,
				min: 0,
				max: 2,
				step: 0.05,
				unit: "×",
				description:
					"Rotation speed of the solid. At zero it parks, which is the only way to judge whether the ramp is actually resolving the form or just flickering convincingly.",
			},
			{
				name: "tilt",
				kind: "number",
				default: 0.4,
				min: -1,
				max: 1,
				step: 0.05,
				description:
					"Resting camera elevation. Dragging orbits from here rather than replacing it, so this control still means something after you have spun the solid around — and the pitch is clamped short of the poles, because a camera that rolls over the top reads as a bug rather than as a rotation you asked for.",
			},
			{
				name: "zoom",
				kind: "number",
				default: 1,
				min: 0.4,
				max: 2.5,
				step: 0.05,
				unit: "×",
				description:
					"How much of the frame the solid fills. It narrows the field of view rather than moving the camera in — dollying would clip the near face of the solid long before its silhouette filled the frame, which looks like a broken near plane rather than a close-up.",
			},
			{
				name: "contrast",
				kind: "number",
				default: 1.1,
				min: 0.2,
				max: 3,
				step: 0.05,
				description:
					"Gamma on the luminance before it picks a glyph, and what decides whether the solid reads as a form or as noise. The ramp has ten steps at most and the lighting has to spread across all of them — too little and the shape collapses into two characters.",
			},
			{
				name: "edgeBoost",
				kind: "number",
				default: 0.5,
				min: 0,
				max: 1.5,
				step: 0.05,
				description:
					"How much of the silhouette is added back before quantising. Pure luminance loses the outline — a ten-step ramp cannot carry both the shading and the contour, so without this the form dissolves into its own gradient.",
			},
			{
				name: "glow",
				kind: "number",
				default: 0.3,
				min: 0,
				max: 1.5,
				step: 0.05,
				description:
					"Bloom bleeding off the lit glyphs, driven by the cell's luminance rather than by the glyph's own coverage — so a bright cell glows whether it landed on a full block or a full stop.",
			},
			{
				name: "inkColor",
				kind: "color",
				default: "#7ef0c0",
				description: "The phosphor the glyphs are printed in.",
			},
			{
				name: "backgroundColor",
				kind: "color",
				default: "#04060a",
				description: "The dead terminal behind them.",
			},
		],
	},
	{
		slug: "swarm",
		name: "Swarm",
		category: "Power-User Systems",
		addedAt: "2026-08-07",
		description:
			"Up to a quarter of a million particles integrated entirely on the GPU, morphing between words and solids, with a drag-orbit camera. Position and velocity live in floating-point textures and never come back to the CPU. Text targets are sampled once out of an offscreen canvas, so the shape can be any string with no font atlas.",
		dependencies: ["ogl"],
		cookbook: [
			"Loop",
			"Morph",
			"Stagger",
			"Interpolation / Tween",
			"Idle animation",
			"Hover effect",
		],
		pausable: true,
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/swarm/swarm.tsx",
			},
			{
				lang: "ts",
				style: "tailwind",
				file: "hooks/use-animation-loop.ts",
				role: "hook",
				label: "use-animation-loop.ts",
			},
		],
		props: [
			{
				name: "density",
				kind: "enum",
				default: "65k",
				options: ["16k", "65k", "131k", "262k"],
				description:
					"Particle count, as discrete steps rather than a slider. Each value reallocates four floating-point targets and rebuilds the geometry, and a slider would do that on every pixel of a drag. Sixty-five thousand is where letterforms close up. The simulation is nearly free above that — the cost is all fill rate — so the top step is for a machine you already know the answer about.",
			},
			{
				name: "shape",
				kind: "enum",
				default: "auto",
				options: ["auto", "text", "sphere", "torus", "grid", "disperse"],
				description:
					"What the cloud is heading for. Auto walks every form in turn — text, sphere, torus, grid — before repeating, and advances the word list one entry each time it comes back around to text; the rest hold. Disperse is the exception auto never lands on: its targets are uniformly random, so it is a state to send the cloud into rather than a form to morph between. Targets are sampled out of an offscreen 2D canvas, so the text form is whatever string you pass — the GPU never sees a glyph, only a texture of positions.",
			},
			{
				name: "swapDuration",
				kind: "number",
				default: 3.2,
				min: 0.5,
				max: 12,
				step: 0.1,
				unit: "s",
				disabledWhen: { prop: "shape", notEquals: "auto" },
				description:
					"How long a shape holds before auto moves to the next one. This is the hold, not the travel — the morph itself is paced by morphSpeed, so a short duration with a slow morph gives a cloud that never quite arrives anywhere, which is a look rather than a mistake.",
			},
			{
				name: "morphSpeed",
				kind: "number",
				default: 1.1,
				min: 0.05,
				max: 10,
				step: 0.05,
				unit: "×",
				disabledWhen: { prop: "shape", equals: "disperse" },
				description:
					"How hard each particle is pulled toward its target. This is an acceleration, not a duration — the cloud arrives when the pull and the damping agree, which is why it never snaps. It also has to win against the turbulence: too low against a high curl and the letterforms never resolve, they just hover.",
			},
			{
				name: "stagger",
				kind: "number",
				default: 0.45,
				min: 0,
				max: 1,
				step: 0.05,
				disabledWhen: { prop: "shape", equals: "disperse" },
				description:
					"How much of the morph is spread across the cloud instead of happening at once. At zero every particle leaves and arrives together and it reads as a slide; near one the shape assembles over time and you can watch it build. The phase comes from each particle's own texel, so it does not reshuffle between shapes.",
			},
			{
				name: "curl",
				kind: "number",
				default: 0.3,
				min: 0,
				max: 2,
				step: 0.05,
				description:
					"Curl-noise turbulence applied on the way. Curl of a vector field is divergence-free by construction, so it stirs the cloud without ever thinning it or piling it up — which is the entire reason to use curl noise rather than plain noise on a velocity field, where the cloud slowly develops holes.",
			},
			{
				name: "damping",
				kind: "number",
				default: 0.9,
				min: 0.5,
				max: 0.995,
				step: 0.005,
				description:
					"How much velocity survives each step, applied per second rather than per frame. Below about 0.8 particles arrive dead and the shape has no life in it; above 0.97 they orbit their targets forever and never settle.",
			},
			{
				name: "repel",
				kind: "number",
				default: 1,
				min: 0,
				max: 3,
				step: 0.05,
				unit: "×",
				description:
					"How hard the pointer pushes particles away on hover. Dragging orbits the camera instead — sharing one gesture between the two would mean every attempt to look around also blew a hole in what you were looking at. The falloff is exponential in squared distance, so the hole has a soft edge and the cloud closes behind your cursor rather than leaving a permanent scar.",
			},
			{
				name: "pointSize",
				kind: "number",
				default: 1.6,
				min: 0.5,
				max: 5,
				step: 0.1,
				unit: "px",
				description:
					"Point sprite width, and the real performance control. Doubling it costs four times the shading at any density — at a quarter of a million particles the simulation is trivial and the fill rate is what falls over, which is the opposite of where most people expect the cost to be.",
			},
			{
				name: "zoom",
				kind: "number",
				default: 1,
				min: 0.4,
				max: 2.5,
				step: 0.05,
				unit: "×",
				description:
					"How close the camera sits to the cloud. Sprite size scales with it: leaving the points fixed makes a zoomed-in cloud read as sparser rather than nearer, which is the tell that a zoom is really a viewport crop.",
			},
			{
				name: "autoSpin",
				kind: "boolean",
				default: true,
				description:
					"Idle rotation while nothing is being dragged. Off holds the cloud still and hands the camera entirely to the pointer — a flung orbit still coasts to rest, since that motion was asked for. The drift exists to show the form is solid rather than a flat sprite, so turning it off is a choice about a still image, not a performance one.",
			},
			{
				name: "particleColor",
				kind: "color",
				default: "#a855f7",
				description: "The colour of a settled particle.",
			},
			{
				name: "accentColor",
				kind: "color",
				default: "#67e8f9",
				description:
					"The colour of a moving one. Particles are blended between the two by their own speed, so the palette is a readout of the simulation rather than decoration laid over it.",
			},
			{
				name: "backgroundColor",
				kind: "color",
				default: "#04040a",
				description:
					"The void behind the cloud. Points blend additively, so this wants to stay genuinely dark — anything lighter and the dense core clips to white before the count is visible.",
			},
		],
	},
	{
		slug: "mirage",
		name: "Mirage",
		category: "Power-User Systems",
		addedAt: "2026-08-07",
		description:
			"Live, fully interactive HTML seen through moving air. An animated turbulence field displaces the real DOM subtree per pixel, with no snapshot and no canvas replica, so the text stays selectable, the button still takes focus and the link is still a link while the whole panel shimmers.",
		dependencies: [],
		cookbook: [
			"Hover effect",
			"Blur",
			"Mask",
			"Idle animation",
			"Compositing",
			"Hardware acceleration",
		],
		pausable: true,
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/mirage/mirage.tsx",
			},
			{
				lang: "ts",
				style: "tailwind",
				file: "hooks/use-animation-loop.ts",
				role: "hook",
				label: "use-animation-loop.ts",
			},
		],
		props: [
			{
				name: "mode",
				kind: "enum",
				default: "haze",
				options: ["haze", "liquify", "shatter", "tear"],
				description:
					"How the air moves. The four differ by the anisotropy of the noise rather than by strength: equal frequencies on both axes give soup, and a strongly biased axis is what makes a tear read as a tear instead of as more haze.",
			},
			{
				name: "intensity",
				kind: "number",
				default: 0.4,
				min: 0,
				max: 2,
				step: 0.05,
				description:
					"How far the content is pushed. This is genuine per-pixel displacement rather than a transform — a transform can only move the whole box, which is why skew-based heat haze never convinces. Past about one the text stops being readable, which is a legitimate look and a terrible default.",
			},
			{
				name: "speed",
				kind: "number",
				default: 0.35,
				min: 0,
				max: 2,
				step: 0.05,
				unit: "×",
				description:
					"Rate the field drifts. The noise is rasterised once as a seamless tile and scrolled, never re-seeded — stepping a turbulence seed swaps in an entirely unrelated field each time, which reads as a component tearing itself apart rather than as air moving. The wrap at one tile is invisible because the tile is seamless.",
			},
			{
				name: "scale",
				kind: "number",
				default: 2.2,
				min: 0.3,
				max: 4,
				step: 0.1,
				description:
					"Size of the turbulence cells, measured against a scrolling tile rather than against the element — so the same setting is the same air whether the panel is a card or a page. This sizes the tile itself, because a tile can hold no feature larger than its own period and the noise lattice only wraps on a whole number of cells; free the cell count instead and the field stops tiling, which shows up as the whole panel jumping to a different distortion once a wrap. Small cells shred the glyphs and large ones move the whole block as a unit; the interesting band is where a cell is roughly the height of a line of text.",
			},
			{
				name: "chroma",
				kind: "number",
				default: 0.25,
				min: 0,
				max: 1,
				step: 0.05,
				description:
					"Strength of the colour cast the shimmer carries, gathered where the pointer is. Hot air refracts, so a little colour separation is the cue that sells it as air rather than as a wobbling image.",
			},
			{
				name: "trigger",
				kind: "enum",
				default: "always",
				options: ["always", "hover"],
				description:
					"What turns the effect on. Whichever you pick it eases rather than switches — a displacement that snaps on reads as the element being swapped out, one that rises reads as air beginning to move.",
			},
			{
				name: "edgeHold",
				kind: "number",
				default: 0.35,
				min: 0,
				max: 1,
				step: 0.05,
				description:
					"How much of the element's own silhouette is protected. Displacing evenly moves the border too, so a rounded card dissolves into an amoeba and the one edge a reader uses to locate it is the first thing destroyed. This tapers the push toward neutral near the boundary — at zero the outline shreds, and past about half the shimmer is confined to the middle of the panel.",
			},
			{
				name: "tintColor",
				kind: "color",
				default: "#a855f7",
				description: "The colour the shimmer carries.",
			},
		],
	},
	{
		slug: "submerge",
		name: "Submerge",
		category: "Power-User Systems",
		addedAt: "2026-08-07",
		description:
			"Live content held under water. A slow current bends it continuously, a press drops a stone and a drag leaves a wake that trails behind the cursor. The text underneath stays selectable, the button still answers and the link is still a link, because the water bends the real tree rather than a picture of it.",
		dependencies: [],
		cookbook: [
			"Ripple",
			"Hover effect",
			"Damping",
			"Idle animation",
			"Compositing",
			"Hardware acceleration",
		],
		pausable: true,
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/submerge/submerge.tsx",
			},
			{
				lang: "ts",
				style: "tailwind",
				file: "hooks/use-animation-loop.ts",
				role: "hook",
				label: "use-animation-loop.ts",
			},
		],
		props: [
			{
				name: "depth",
				kind: "number",
				default: 0.45,
				min: 0,
				max: 1,
				step: 0.05,
				description:
					"How deep the content sits. It drives the colour wash and adds to the bend, because the further under a surface something lies the further the same slope carries the light across it. Past about 0.8 the water starts winning and the content stops being the subject.",
			},
			{
				name: "flow",
				kind: "number",
				default: 1.25,
				min: 0,
				max: 2,
				step: 0.05,
				unit: "×",
				description:
					"Speed of the ambient current. The field is rasterised once as a seamless tile and scrolled rather than regenerated — regenerating costs a PNG encode per frame, which is why so many browser water effects settle for a static distortion instead.",
			},
			{
				name: "turbulence",
				kind: "number",
				default: 0.5,
				min: 0,
				max: 2,
				step: 0.05,
				description:
					"How hard the current bends the content. This is genuine per-pixel displacement of the live tree, not a transform — a transform can only move the whole box, which is the reason skewed 'underwater' text never convinces.",
			},
			{
				name: "rippleForce",
				kind: "number",
				default: 0.8,
				min: 0,
				max: 2,
				step: 0.05,
				unit: "×",
				description:
					"Strength of the disturbance the pointer leaves. A press radiates an isotropic ring; a drag leaves a wake — the same wave packet stretched along travel and weighted to the rear, so the water is disturbed where the pointer has been rather than around where it is. Sources are spaced by distance travelled rather than by pointer event, so the same gesture leaves the same wake at 60Hz or 120Hz.",
			},
			{
				name: "rippleSpread",
				kind: "number",
				default: 1,
				min: 0.3,
				max: 3,
				step: 0.05,
				unit: "×",
				description:
					"How far a disturbance travels before it dies. Growth is an exponential approach rather than a square root: both decelerate, but a square root has infinite slope at zero, so every ring is born already moving and the birth itself snaps. A drag wake spreads slower than a press ring, because a trail lingers where it was left.",
			},
			{
				name: "settle",
				kind: "number",
				default: 1.6,
				min: 0.4,
				max: 5,
				step: 0.1,
				unit: "s",
				description:
					"Seconds a disturbance takes to die away. Twelve run at once and a thirteenth reuses the oldest slot, so a fast drag always shows its newest wake rather than queueing behind stale ones — and twelve is enough that eviction rarely cuts one off mid-life, which is the pop that reads as jumpy.",
			},
			{
				name: "edgeHold",
				kind: "number",
				default: 0.35,
				min: 0,
				max: 1,
				step: 0.05,
				description:
					"How much of the element's own silhouette is protected. Displacing evenly moves the border too, so a rounded card dissolves into an amoeba and the one edge a reader uses to locate it is the first thing destroyed. At zero the outline shreds; past about half the water is confined to the middle.",
			},
			{
				name: "waterColor",
				kind: "color",
				default: "#bacffe",
				description: "Shallow water — the colour every ring crest carries.",
			},
			{
				name: "deepColor",
				kind: "color",
				default: "#d9e7f3",
				description:
					"Deep water. Applied as a multiply rather than an overlay, so the content keeps its own contrast instead of flattening behind a sheet of colour.",
			},
		],
	},
	{
		slug: "weave",
		name: "Weave",
		category: "Power-User Systems",
		addedAt: "2026-08-13",
		pausable: true,
		description:
			"A sheet of cloth on a position-based solver. Particles and distance constraints relaxed to convergence every fixed step, with no forces, no rotations and no contacts. Drag it, load it, and pull until the constraints fail and the tear runs. Every quad is shaded by its own extension against the tear threshold, so the load path through the sheet is visible long before anything breaks.",
		dependencies: [],
		cookbook: [
			"Drag",
			"Stiffness / Tension",
			"Damping",
			"Velocity",
			"Momentum",
			"Frame rate (FPS)",
		],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/weave/weave.tsx",
			},
			{
				lang: "ts",
				style: "tailwind",
				file: "hooks/use-animation-loop.ts",
				role: "hook",
				label: "use-animation-loop.ts",
			},
		],
		props: [
			{
				name: "cols",
				kind: "number",
				default: 26,
				min: 8,
				max: 48,
				step: 1,
				description:
					"Particles across the sheet. Constraint count grows as roughly twice cols times rows and every one is visited on every relaxation pass, so this and rows together are the honest cost dial.",
			},
			{
				name: "rows",
				kind: "number",
				default: 18,
				min: 6,
				max: 36,
				step: 1,
				description:
					"Particles down the sheet. Taller than it is wide is what makes the drape read as fabric; a square grid hangs like a banner and never folds.",
			},
			{
				name: "iterations",
				kind: "number",
				default: 6,
				min: 1,
				max: 16,
				step: 1,
				description:
					"Relaxation passes over the constraint list per fixed step. Position-based dynamics has no exact solve — it converges, and this is how far it gets. One pass is rubber, six is linen, and past ten you are paying for a stiffness you cannot see.",
			},
			{
				name: "gravity",
				kind: "number",
				default: 9.8,
				min: 0,
				max: 30,
				step: 0.2,
				unit: "m/s²",
				description:
					"Uniform downward acceleration. Zero leaves the sheet floating so wind alone drives it, which is the clearest way to watch a strain wave cross the mesh.",
			},
			{
				name: "wind",
				kind: "number",
				default: 4.2,
				min: 0,
				max: 20,
				step: 0.2,
				unit: "m/s²",
				description:
					"Lateral forcing, applied with a travelling phase rather than uniformly — a uniform push only translates the sheet and never ripples it.",
			},
			{
				name: "stiffness",
				kind: "number",
				default: 0.9,
				min: 0.1,
				max: 1,
				step: 0.05,
				description:
					"Fraction of each constraint's length error corrected per pass. One with enough passes is inextensible canvas; low values are jersey that stretches under its own weight. It trades against iterations almost multiplicatively — halving one and doubling the other lands in nearly the same place.",
			},
			{
				name: "damping",
				kind: "number",
				default: 0.02,
				min: 0,
				max: 0.2,
				step: 0.005,
				description:
					"Velocity bled off per step. Verlet carries velocity implicitly in the gap between the current and previous position, so this scales that gap rather than a stored vector — which is why it reads as air resistance and not as friction.",
			},
			{
				name: "tearThreshold",
				kind: "number",
				default: 1.9,
				min: 1.05,
				max: 6,
				step: 0.05,
				unit: "×",
				description:
					"Extension at which a constraint fails, as a multiple of its rest length. Evaluated after all relaxation passes, never during them: strain measured mid-solve is an artefact of the sweep order, and tearing on it produces failures that follow the constraint list rather than the load. Above about four nothing tears at any wind you can set.",
			},
			{
				name: "pinMode",
				kind: "enum",
				default: "corners",
				options: ["top-row", "corners", "top-and-bottom", "free"],
				description:
					"Which particles are held. Corners is the one worth pulling on — the load concentrates into two diagonals you can see in the strain field long before anything tears. Free drops the whole sheet, and is the honest demonstration that none of this is keyframed.",
			},
			{
				name: "shading",
				kind: "enum",
				default: "strain",
				options: ["strain", "wireframe", "solid"],
				description:
					"How each quad is filled. Strain shades it by the extension of its own four edges, which is the point of the component: the load path through a hanging sheet is invisible in a wireframe and obvious the moment it is coloured.",
			},
			{
				name: "tint",
				kind: "color",
				default: "#a855f7",
				description:
					"The cloth at rest — zero strain. Also the anchors and the ring on a held particle.",
			},
			{
				name: "strainColor",
				kind: "color",
				default: "#f87171",
				disabledWhen: { prop: "shading", notEquals: "strain" },
				description:
					"The far end of the strain ramp, reached exactly at the tear threshold — so a quad going fully hot is a prediction rather than a decoration.",
			},
		],
	},
	{
		slug: "telemetry",
		name: "Telemetry",
		category: "Power-User Systems",
		addedAt: "2026-08-13",
		pausable: true,
		description:
			"A metric board that behaves as one instrument instead of eight sparklines. Hovering any tile broadcasts a single timestamp and every other tile resolves its own value at that same instant, so a latency spike and a queue backing up are visibly the same event rather than two coincidences. Threshold breaches are recorded on the sample rather than on a pixel, so the scar travels with its data and is still there forty seconds after the value recovered.",
		dependencies: [],
		cookbook: [
			"Loop",
			"Idle animation",
			"Hover effect",
			"Tabular numbers",
			"Reduced motion",
			"Frame rate (FPS)",
		],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/telemetry/telemetry.tsx",
			},
			{
				lang: "ts",
				style: "tailwind",
				file: "hooks/use-animation-loop.ts",
				role: "hook",
				label: "use-animation-loop.ts",
			},
		],
		props: [
			{
				name: "tiles",
				kind: "number",
				default: 8,
				min: 3,
				max: 12,
				step: 1,
				description:
					"Metrics on the board. Every tile shares one clock and one cursor, so this is also how many traces a single hover has to answer at once — the coordination is the component, and it only becomes legible above about six.",
			},
			{
				name: "columns",
				kind: "enum",
				default: "4",
				options: ["2", "3", "4"],
				description:
					"Grid width. Narrow columns make each trace taller relative to its width and exaggerate every wobble; wide ones flatten them into something you can actually compare across rows.",
			},
			{
				name: "sampleRate",
				kind: "number",
				default: 8,
				min: 1,
				max: 30,
				step: 1,
				unit: "Hz",
				description:
					"How often each ring buffer takes a sample, held independent of the frame rate on purpose. The buffer advances on its own accumulator, so a machine dropping to 30fps shows the same history as one at 120 — a chart whose past depends on the viewer's GPU is lying about the data.",
			},
			{
				name: "history",
				kind: "number",
				default: 45,
				min: 10,
				max: 180,
				step: 5,
				unit: "s",
				description:
					"How much past each trace shows. Ring capacity is this times the sample rate and is allocated once, so raising either reallocates rather than grows and the memory stays bounded.",
			},
			{
				name: "smoothing",
				kind: "number",
				default: 0.25,
				min: 0,
				max: 0.95,
				step: 0.05,
				description:
					"Exponential moving average applied on the way into the buffer. It smooths the stored series rather than the drawing, so the cursor reads exactly the numbers you can see — a readout that disagrees with its own trace is worse than a noisy one.",
			},
			{
				name: "threshold",
				kind: "number",
				default: 0.82,
				min: 0.5,
				max: 0.99,
				step: 0.01,
				description:
					"Normalised level a metric has to cross to count as a breach. Normalised because the tiles do not share units — a percentage and a megabyte have to be comparable for one cursor and one rule to mean anything across the board.",
			},
			{
				name: "scars",
				kind: "boolean",
				default: true,
				description:
					"Keep a permanent mark on the trace where a breach happened. A flash you missed is a flash that did not happen; the scar is what makes an unattended board worth glancing at.",
			},
			{
				name: "cursor",
				kind: "boolean",
				default: true,
				description:
					"The shared time cursor. Turning it off leaves eight ordinary sparklines, which is the clearest way to see what it was doing.",
			},
			{
				name: "fill",
				kind: "enum",
				default: "gradient",
				options: ["none", "gradient", "solid"],
				description:
					"Area under the trace. Gradient reads as volume without competing with the line; solid is denser and better at small tile sizes; none is the honest choice when several traces would otherwise imply a stack that does not exist.",
			},
			{
				name: "traceColor",
				kind: "color",
				default: "#a855f7",
				description: "The line, the fill ramp, and the cursor rule.",
			},
			{
				name: "breachColor",
				kind: "color",
				default: "#f87171",
				description:
					"The threshold rule, the scar, and the readout while the cursor sits on a breached sample. One colour across all three, so a scar is visibly the same event as the reading that produced it.",
			},
		],
	},
	{
		slug: "rewind",
		name: "Rewind",
		category: "Power-User Systems",
		addedAt: "2026-08-13",
		description:
			"An undo history you can scrub, and that refuses to throw the future away. Drag the head and the interface reverts live under your finger rather than on release. Act from a past point and the abandoned future stays drawn on the rail as a branch you can walk back onto, instead of being silently destroyed the way every real undo stack destroys it. Controlled in the same shape as Ledger: it owns the rail, the gesture and the branch graph, and your reducer owns the states.",
		dependencies: ["motion", "clsx", "tailwind-merge"],
		cookbook: [
			"Drag",
			"Interruptible animation",
			"Spatial consistency",
			"Continuity transition",
			"Stepped animation",
			"Spring",
		],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/rewind/rewind.tsx",
			},
			UTILS_VARIANT,
		],
		props: [
			{
				name: "orientation",
				kind: "enum",
				default: "horizontal",
				options: ["horizontal", "vertical"],
				description:
					"Which axis the rail runs on. Horizontal reads as a scrubber; vertical reads as a commit log and stacks better beside a form. The gesture is written against one axis abstraction rather than two handlers, so the modes cannot drift apart.",
			},
			{
				name: "scrubSnap",
				kind: "boolean",
				default: true,
				description:
					"Lock the head to the nearest recorded state while dragging. Off, it moves continuously and the surface shows the state at or before it, which makes the density of the history visible — you can feel where you were working fast.",
			},
			{
				name: "branching",
				kind: "boolean",
				default: true,
				description:
					"Draw the futures you abandoned instead of discarding them. Off is the familiar destructive undo; on is the honest model, and the difference between the two is the whole component.",
			},
			{
				name: "branchDepth",
				kind: "number",
				default: 3,
				min: 1,
				max: 8,
				step: 1,
				disabledWhen: { prop: "branching", equals: false },
				description:
					"How many abandoned branches stay drawn beside the trunk before the oldest is folded away. Past about four the rail stops being a timeline and becomes a graph, which is a different component.",
			},
			{
				name: "stiffness",
				kind: "number",
				default: 420,
				min: 120,
				max: 900,
				step: 10,
				description:
					"Spring tension on the head. The marker and the reported index come off the same drag, so the surface can never show a state the head has not reached — a readout running ahead of its own scrubber is the single thing that makes time travel feel fake.",
			},
			{
				name: "damping",
				kind: "number",
				default: 34,
				min: 8,
				max: 60,
				step: 1,
				description:
					"Spring friction. Low lets the head ring past a state and come back, which is charming on a scrubber and disastrous on the fields it drives — this is the control that decides which of those you get.",
			},
			{
				name: "tickDensity",
				kind: "enum",
				default: "even",
				options: ["sparse", "even", "all"],
				description:
					"How many states the rail actually draws. All is truthful and unreadable past about sixty entries; even samples at a fixed pitch and leaves the true count in the label instead.",
			},
			{
				name: "showLabels",
				kind: "boolean",
				default: true,
				description:
					"The action name and position under the rail. Without it a scrub is a position; with it, it is a history you can read while dragging.",
			},
			{
				name: "railHeight",
				kind: "number",
				default: 4,
				min: 2,
				max: 14,
				step: 1,
				unit: "px",
				description:
					"Thickness of the rail, and of every branch beside it. Thin reads as a scrubber under a document; thick reads as the primary control on the screen.",
			},
			{
				name: "accentColor",
				kind: "color",
				default: "#a855f7",
				description: "The trunk, the head, and the travelled portion.",
			},
			{
				name: "branchColor",
				kind: "color",
				default: "#f0a830",
				disabledWhen: { prop: "branching", equals: false },
				description:
					"Abandoned futures. Deliberately a warm off-accent rather than a dimmed trunk — a discarded future is a different kind of thing from a quiet one, not a fainter version of the same thing.",
			},
		],
	},
	{
		slug: "stream",
		name: "Stream",
		category: "Power-User Systems",
		addedAt: "2026-08-21",
		pausable: true,
		description:
			"An AI response surface that streams the way live chat UIs stream. A shimmer while the model thinks, tokens arriving on an irregular clock and blurring into place, a generation caret riding the last word, and stop and regenerate controls that actually interrupt. The cadence rides the animation clock rather than timer chains, so pausing the bench freezes generation mid-word. Only the trailing window of tokens are live animated elements, and everything older folds into one static text node, so a long answer never accumulates a thousand springs. An invisible ghost of the full answer holds the final height, so neither the thinking-to-streaming swap nor the stream itself ever moves layout.",
		dependencies: ["motion", "lucide-react", "clsx", "tailwind-merge"],
		cookbook: ["Typewriter", "Skeleton / Shimmer", "Blur", "Stagger"],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/stream/stream.tsx",
			},
			{
				lang: "ts",
				style: "tailwind",
				file: "hooks/use-animation-loop.ts",
				role: "hook",
				label: "use-animation-loop.ts",
			},
			UTILS_VARIANT,
		],
		props: [
			{
				name: "tokensPerSecond",
				kind: "number",
				default: 18,
				min: 2,
				max: 60,
				step: 1,
				description: "Average emission rate.",
			},
			{
				name: "jitter",
				kind: "number",
				default: 0.35,
				min: 0,
				max: 1,
				step: 0.05,
				description:
					"Cadence irregularity — bursts and occasional stalls that make it read as a live model rather than a metronome.",
			},
			{
				name: "chunking",
				kind: "enum",
				default: "word",
				options: ["word", "character"],
				description:
					"Emission granularity. Words read like a model; characters read like a terminal.",
			},
			{
				name: "blurAmount",
				kind: "number",
				default: 6,
				min: 0,
				max: 16,
				step: 0.5,
				unit: "px",
				description: "Blur each token arrives from.",
			},
			{
				name: "thinkingMs",
				kind: "number",
				default: 1200,
				min: 0,
				max: 4000,
				step: 100,
				unit: "ms",
				description: "Shimmer skeleton phase before the first token.",
			},
			{
				name: "caret",
				kind: "enum",
				default: "bar",
				options: ["bar", "block", "none"],
				description: "Generation caret riding the last token.",
			},
			{
				name: "caretColor",
				kind: "color",
				default: "#a78bfa",
				disabledWhen: { prop: "caret", equals: "none" },
				description: "Caret tint.",
			},
			{
				name: "autoReplay",
				kind: "boolean",
				default: true,
				description:
					"Regenerate automatically after settling, so the demo loops hands-free.",
			},
		],
	},
	{
		slug: "infinite-canvas",
		name: "InfiniteCanvas",
		category: "Power-User Systems",
		addedAt: "2026-08-21",
		description:
			"A pannable, zoomable infinite board holding real DOM cards. One world element under a single translate-and-scale, so focus survives and nothing ever remounts when the camera moves. Drag the background to pan with inertia. The wheel zooms to the cursor by holding the world point under it fixed, cards drag independently and glide onto the grid on release, and the corner minimap mirrors the extent and jumps the camera where you click. Camera state lives in one ref written by handlers and the loop, and every consumer, from the world transform to the backdrop plane to the minimap, derives from it in a single write pass per frame, so React never renders a camera frame. Arrow keys pan and plus and minus zoom when the board holds focus.",
		dependencies: ["clsx", "tailwind-merge"],
		cookbook: ["Drag", "Momentum", "Velocity", "Hardware acceleration"],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/infinite-canvas/infinite-canvas.tsx",
			},
			{
				lang: "ts",
				style: "tailwind",
				file: "hooks/use-animation-loop.ts",
				role: "hook",
				label: "use-animation-loop.ts",
			},
			UTILS_VARIANT,
		],
		props: [
			{
				name: "friction",
				kind: "number",
				default: 0.92,
				min: 0.8,
				max: 0.99,
				step: 0.005,
				description:
					"Glide decay after a thrown pan — low stops dead, high coasts.",
			},
			{
				name: "zoomSpeed",
				kind: "number",
				default: 1,
				min: 0.2,
				max: 3,
				step: 0.1,
				unit: "×",
				description: "Wheel-to-zoom gearing.",
			},
			{
				name: "minZoom",
				kind: "number",
				default: 0.25,
				min: 0.05,
				max: 1,
				step: 0.05,
				unit: "×",
				description: "How far out the camera may pull.",
			},
			{
				name: "maxZoom",
				kind: "number",
				default: 3,
				min: 1,
				max: 8,
				step: 0.5,
				unit: "×",
				description: "How far in the camera may push.",
			},
			{
				name: "gridSnap",
				kind: "boolean",
				default: true,
				description: "Dropped cards glide onto the nearest grid point.",
			},
			{
				name: "gridSize",
				kind: "number",
				default: 24,
				min: 8,
				max: 64,
				step: 4,
				unit: "px",
				description:
					"World-space grid pitch — the snap target and the backdrop's cell size both.",
			},
			{
				name: "minimap",
				kind: "boolean",
				default: true,
				description: "Corner map of the extent; click it to jump the camera.",
			},
			{
				name: "backdrop",
				kind: "enum",
				default: "dots",
				options: ["dots", "lines", "none"],
				description:
					"The plane texture that moves with the camera — it is what makes the pan legible.",
			},
		],
	},
	{
		slug: "patchbay",
		name: "Patchbay",
		category: "Power-User Systems",
		addedAt: "2026-08-27",
		pausable: true,
		description:
			"A modular-synth patch bay. The jacks are real DOM buttons, focusable, labelled and keyboard-patchable, and only the cables live on a canvas underneath the pointer's reach, because a cable is pure paint: a quadratic Bézier whose control point hangs below the midpoint by a sprung sag. Drag from any jack and a live cable follows the hand. Release near a jack on the opposite bank and it seats with an overshoot-and-settle wobble, elsewhere it retracts. Seated cables carry signal pulses on a bounded phase, grabbing an occupied input picks its cable up to repatch, and resizing the bay shakes every cable, which is follow-through, cheaply.",
		dependencies: [],
		cookbook: ["Drag", "Spring", "Follow-through", "Loop"],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/patchbay/patchbay.tsx",
			},
			{
				lang: "ts",
				style: "tailwind",
				file: "hooks/use-animation-loop.ts",
				role: "hook",
				label: "use-animation-loop.ts",
			},
		],
		props: [
			{
				name: "droop",
				kind: "number",
				default: 46,
				min: 0,
				max: 120,
				step: 2,
				unit: "px",
				description: "Cable slack at rest — how far the middle hangs.",
			},
			{
				name: "wobble",
				kind: "number",
				default: 0.6,
				min: 0,
				max: 1,
				step: 0.05,
				description: "Spring in the sag when a cable seats or the bay resizes.",
			},
			{
				name: "pulseSpeed",
				kind: "number",
				default: 1,
				min: 0,
				max: 3,
				step: 0.05,
				unit: "×",
				description: "Signal travel rate along a connected cable.",
			},
			{
				name: "pulseCount",
				kind: "number",
				default: 3,
				min: 0,
				max: 8,
				step: 1,
				description: "Pulses in flight per cable; 0 runs the bay dark.",
			},
			{
				name: "cableWidth",
				kind: "number",
				default: 2.5,
				min: 1,
				max: 5,
				step: 0.25,
				unit: "px",
				description: "Cable gauge.",
			},
			{
				name: "showLabels",
				kind: "boolean",
				default: true,
				description: "Module names under the jacks.",
			},
			{
				name: "cableColor",
				kind: "color",
				default: "#a78bfa",
				description: "The patch cables.",
			},
			{
				name: "pulseColor",
				kind: "color",
				default: "#e9e6ff",
				description: "The signal riding them.",
			},
		],
	},
	{
		slug: "keycast",
		name: "Keycast",
		category: "Power-User Systems",
		addedAt: "2026-08-27",
		pausable: true,
		description:
			"A streamer-style keyboard HUD: every chord you press appears as a row of keycaps and ages away, with a hammered key folding into one cap wearing a ×n badge. The listener is display-only by contract. It never prevents or stops an event, bails inside editable targets and mid-IME composition, and ignores lone modifiers, so the page underneath keeps every shortcut it had and the HUD merely reports what the hands did. Entry timestamps ride the loop clock rather than the wall clock, so pausing the bench freezes the stack mid-fade instead of evicting it all on resume, and a scripted demo reel keeps the pane alive whenever the real keyboard goes quiet.",
		dependencies: [],
		cookbook: ["Pop in", "Enter / Exit", "Fade in / Fade out"],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/keycast/keycast.tsx",
			},
			{
				lang: "ts",
				style: "tailwind",
				file: "hooks/use-animation-loop.ts",
				role: "hook",
				label: "use-animation-loop.ts",
			},
		],
		props: [
			{
				name: "lifetime",
				kind: "number",
				default: 2.4,
				min: 0.8,
				max: 6,
				step: 0.1,
				unit: "s",
				description: "How long a chord stays on the HUD before it fades out.",
			},
			{
				name: "maxVisible",
				kind: "number",
				default: 5,
				min: 1,
				max: 10,
				step: 1,
				description: "History depth; older entries are evicted early.",
			},
			{
				name: "corner",
				kind: "enum",
				default: "bottom-center",
				options: ["bottom-left", "bottom-center", "bottom-right"],
				description: "Where the stack anchors in its pane.",
			},
			{
				name: "combineRepeats",
				kind: "boolean",
				default: true,
				description: "Fold a hammered key into one cap with a ×n badge.",
			},
			{
				name: "platform",
				kind: "enum",
				default: "mac",
				options: ["mac", "pc"],
				description: "⌘⌥⇧⌃ glyphs or Ctrl / Alt / Shift words.",
			},
			{
				name: "demo",
				kind: "boolean",
				default: true,
				description:
					"Replay a scripted set of chords whenever the keyboard goes quiet.",
			},
			{
				name: "capSize",
				kind: "number",
				default: 34,
				min: 24,
				max: 56,
				step: 2,
				unit: "px",
				description: "Keycap height; legends scale with it.",
			},
			{
				name: "accent",
				kind: "color",
				default: "#c4b5fd",
				description: "Modifier caps and the ring on the newest chord.",
			},
		],
	},
	{
		slug: "file-explorer",
		name: "FileExplorer",
		category: "Power-User Systems",
		addedAt: "2026-09-18",
		description:
			"A persistent three-pane file manager that stores real image, video, and blob uploads 100% client-side — OPFS when available, IndexedDB everywhere else — with nested folders, search, sort, drag-and-drop upload, move, and a live preview panel.",
		dependencies: ["lucide-react", "motion", "react-resizable-panels"],
		cookbook: ["Drag", "Layout animation"],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/file-explorer/file-explorer.tsx",
			},
			...FILE_EXPLORER_PEERS,
		],
		props: [
			{
				name: "defaultView",
				kind: "enum",
				default: "grid",
				options: ["grid", "list"],
				description:
					"Initial content layout. The toolbar toggle overrides it live.",
			},
			{
				name: "thumbnailSize",
				kind: "number",
				default: 112,
				min: 72,
				max: 220,
				step: 4,
				unit: "px",
				description: "Grid tile edge length. Larger tiles, fewer columns.",
			},
			{
				name: "density",
				kind: "enum",
				default: "comfortable",
				options: ["comfortable", "compact"],
				description:
					"Row height and padding for the list view and folder rail.",
			},
			{
				name: "sortBy",
				kind: "enum",
				default: "name",
				options: ["name", "date", "size", "type"],
				description:
					"Initial sort field. The toolbar sort menu overrides it live.",
			},
			{
				name: "sortDir",
				kind: "enum",
				default: "asc",
				options: ["asc", "desc"],
				description: "Initial sort direction.",
			},
			{
				name: "showFolderRail",
				kind: "boolean",
				default: true,
				description: "Show the left folder-tree rail.",
			},
			{
				name: "showDetails",
				kind: "boolean",
				default: true,
				description: "Open the detail panel when a single file is selected.",
			},
			{
				name: "showHidden",
				kind: "boolean",
				default: false,
				description: "Reveal entries whose name starts with a dot.",
			},
			{
				name: "allowUpload",
				kind: "boolean",
				default: true,
				description:
					"Enable drag-and-drop and the Add button. Off makes the explorer read-only for new files.",
			},
			{
				name: "allowDelete",
				kind: "boolean",
				default: true,
				description:
					"Enable delete, rename, and move. Off locks the store's contents.",
			},
			{
				name: "undoWindowMs",
				kind: "number",
				default: 5000,
				min: 0,
				max: 15000,
				step: 500,
				unit: "ms",
				description: "Grace period to undo a delete. 0 deletes immediately.",
				disabledWhen: { prop: "allowDelete", equals: false },
			},
			{
				name: "accent",
				kind: "color",
				default: "#a855f7",
				description: "Selection highlight, active folder, and focus accent.",
			},
		],
	},
	{
		slug: "elastic",
		name: "Elastic",
		category: "Power-User Systems",
		addedAt: "2026-09-18",
		description:
			"Throw the top card and the speed you released it at carries into the spring — throw it far enough and it cycles to the back of the deck instead of coming home.",
		dependencies: ["motion", "clsx", "tailwind-merge"],
		cookbook: [
			"Spring",
			"Swipe to dismiss",
			"Stiffness / Tension",
			"Damping",
			"Mass",
			"Momentum",
			"Velocity",
			"Interruptible animation",
			"Rubber-banding",
			"Drag",
			"Bounce",
			"Follow-through",
		],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/elastic/elastic.tsx",
			},
			UTILS_VARIANT,
		],
		props: [
			{
				name: "stiffness",
				kind: "number",
				default: 320,
				min: 60,
				max: 800,
				step: 20,
				description: "How strongly the spring pulls home. Higher is snappier.",
			},
			{
				name: "damping",
				kind: "number",
				default: 22,
				min: 5,
				max: 60,
				step: 1,
				description: "How fast it settles. Lower overshoots and oscillates.",
			},
			{
				name: "mass",
				kind: "number",
				default: 1,
				min: 0.2,
				max: 4,
				step: 0.1,
				description: "How heavy the card feels. More mass is more sluggish.",
			},
			{
				name: "bounds",
				kind: "number",
				default: 140,
				min: 40,
				max: 400,
				step: 10,
				unit: "px",
				description: "How far the card may travel from home.",
			},
			{
				name: "rubberBand",
				kind: "number",
				default: 0.45,
				min: 0,
				max: 1,
				step: 0.05,
				description: "Give past the bounds, hard wall → loose.",
			},
			{
				name: "flickPower",
				kind: "number",
				default: 1,
				min: 0.2,
				max: 3,
				step: 0.1,
				unit: "×",
				description: "Multiplier on the release velocity handed to the spring.",
			},
			{
				name: "cards",
				kind: "number",
				default: 3,
				min: 1,
				max: 5,
				step: 1,
				description: "How many cards in the stack.",
			},
			{
				name: "throwThreshold",
				kind: "number",
				default: 90,
				min: 20,
				max: 260,
				step: 10,
				unit: "px",
				description:
					"Throw distance past which the card cycles to the back instead of springing home. Capped at 90% of bounds so it stays reachable.",
			},
		],
	},
	{
		slug: "masonry",
		name: "Masonry",
		category: "Power-User Systems",
		addedAt: "2026-09-18",
		description:
			"A Pinterest-style grid where every item drops into the shortest column, packed by measurement rather than by a shared row baseline.",
		dependencies: ["clsx", "tailwind-merge"],
		cookbook: [
			"Layout animation",
			"Stagger",
			"Scroll reveal",
			"Spatial consistency",
			"Layout thrashing",
			"will-change",
			"Compositing",
		],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/masonry/masonry.tsx",
			},
			UTILS_VARIANT,
		],
		props: [
			{
				name: "minColumnWidth",
				kind: "number",
				default: 240,
				min: 120,
				max: 480,
				step: 10,
				unit: "px",
				description:
					"Target column width. The column count is derived from the container, not the viewport.",
			},
			{
				name: "maxColumns",
				kind: "number",
				default: 4,
				min: 1,
				max: 8,
				step: 1,
				description:
					"Ceiling on the derived column count, however wide the container gets.",
			},
			{
				name: "gap",
				kind: "number",
				default: 16,
				min: 0,
				max: 48,
				step: 2,
				unit: "px",
				description: "Space between columns and between stacked items.",
			},
			{
				name: "packing",
				kind: "enum",
				default: "balanced",
				options: ["balanced", "sequential"],
				description:
					"Balanced packs into the shortest column; sequential keeps strict left-to-right order.",
			},
			{
				name: "transition",
				kind: "number",
				default: 320,
				min: 0,
				max: 800,
				step: 20,
				unit: "ms",
				description: "How long an item takes to glide to a new slot. 0 snaps.",
			},
			{
				name: "stagger",
				kind: "number",
				default: 45,
				min: 0,
				max: 120,
				step: 5,
				unit: "ms",
				description: "Delay added per item as a batch reveals.",
				disabledWhen: { prop: "revealOnScroll", equals: false },
			},
			{
				name: "revealOnScroll",
				kind: "boolean",
				default: true,
				description: "Fade and rise each item in as it enters the viewport.",
			},
			{
				name: "revealDistance",
				kind: "number",
				default: 16,
				min: 0,
				max: 64,
				step: 4,
				unit: "px",
				description: "How far an item rises on reveal.",
				disabledWhen: { prop: "revealOnScroll", equals: false },
			},
		],
	},
	{
		slug: "rubiks-cube",
		name: "RubiksCube",
		category: "Power-User Systems",
		addedAt: "2026-09-18",
		pausable: true,
		description:
			"A Rubik's cube that scrambles and solves itself on an endless loop while spinning like a planet. Two independent rotation layers, and every quarter-turn is quantised back to exact integers, so an hour of turns drifts by nothing at all.",
		dependencies: ["three", "@react-three/fiber", "clsx", "tailwind-merge"],
		cookbook: ["Rotate", "Orbit", "Loop", "Drag", "Easing", "Idle animation"],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/rubiks-cube/rubiks-cube.tsx",
			},
			UTILS_VARIANT,
		],
		props: [
			{
				name: "autoRotate",
				kind: "boolean",
				default: true,
				description:
					"Spin the whole cube on its own axis, independently of the solve loop. Off leaves the cube still while it keeps scrambling and solving.",
			},
			{
				name: "rotationSpeed",
				kind: "number",
				default: 1,
				min: 0,
				max: 3,
				step: 0.05,
				unit: "×",
				description:
					"Multiplier on the ambient spin rate. A drag re-aims the spin axis but never changes this — direction is yours, speed is the component's.",
				disabledWhen: { prop: "autoRotate", equals: false },
			},
			{
				name: "moveDuration",
				kind: "number",
				default: 380,
				min: 120,
				max: 1200,
				step: 10,
				unit: "ms",
				description:
					"How long one quarter-turn takes. The ease overshoots slightly and settles back, which is the mechanical click a real cube makes.",
			},
			{
				name: "scrambleMoveCount",
				kind: "number",
				default: 12,
				min: 1,
				max: 30,
				step: 1,
				description:
					"Quarter-turns per scramble. The solve is this sequence replayed backwards and negated, so a longer scramble buys a longer solve for free.",
			},
			{
				name: "pauseBetweenCycles",
				kind: "number",
				default: 700,
				min: 0,
				max: 3000,
				step: 50,
				unit: "ms",
				description:
					"Beat of stillness between scramble and solve. Zero runs the two together into one continuous churn.",
			},
			{
				name: "cameraDistance",
				kind: "number",
				default: 11,
				min: 6,
				max: 22,
				step: 0.5,
				description:
					"Orbit radius, which is what sets the cube's apparent size. Drag anywhere to orbit; elevation stops short of the poles so the cube never tumbles sideways.",
			},
			{
				name: "gap",
				kind: "number",
				default: 0.06,
				min: 0,
				max: 0.3,
				step: 0.01,
				description:
					"Space between cubies, in cubie widths. Widen it and the black core shows through the seams, exactly as a real cube's does.",
			},
			{
				name: "palette",
				kind: "enum",
				default: "classic",
				options: ["classic", "amethyst", "mono", "neon"],
				description:
					"Named sticker scheme. The component also takes a `colors` record to override any individual face.",
			},
			{
				name: "bodyColor",
				kind: "color",
				default: "#16161c",
				description:
					"Plastic behind the stickers, and the core seen through the seams.",
			},
			{
				name: "background",
				kind: "color",
				default: "#0b0d14",
				description: "The dark field the cube turns in.",
			},
			{
				name: "glossy",
				kind: "boolean",
				default: true,
				description:
					"Wet-lacquer clearcoat plus a faint oil-slick sheen, lit by a small studio environment. Off leaves flat matte plastic.",
			},
			{
				name: "glow",
				kind: "boolean",
				default: false,
				description:
					"Emissive stickers plus an additive amethyst halo at the silhouette. Off by default: it is a flourish, not the point.",
			},
		],
	},
	{
		slug: "timeline-scrubber",
		name: "TimelineScrubber",
		category: "Power-User Systems",
		addedAt: "2026-09-18",
		pausable: true,
		description:
			"Drag the head, snap it to markers, zoom into the track and let the viewport follow playback. One derived number — pixels per second — places the ticks, the pips, the head, the drag target and the follow scroll, so nothing on screen can disagree about where a time actually is.",
		dependencies: ["lucide-react", "clsx", "tailwind-merge"],
		cookbook: [
			"Drag",
			"Tabular numbers",
			"Interruptible animation",
			"Frame rate (FPS)",
			"Spatial consistency",
		],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/timeline-scrubber/timeline-scrubber.tsx",
			},
			...TIMELINE_PEERS,
			UTILS_VARIANT,
			LOOP_HOST_VARIANT,
		],
		props: [
			{
				name: "duration",
				kind: "number",
				default: 24,
				min: 4,
				max: 600,
				step: 1,
				unit: "s",
				description:
					"Total length of the timeline. Everything on screen is a fraction of it, so shortening it zooms the whole track in rather than trimming the right-hand end off.",
			},
			{
				name: "fps",
				kind: "number",
				default: 30,
				min: 8,
				max: 120,
				step: 1,
				description:
					"Frames per second. Sets the last field of the timecode and the size of an arrow-key step — one frame, because a finer step would move the head without moving the readout, which reads as the control being broken.",
			},
			{
				name: "zoom",
				kind: "number",
				default: 1,
				min: 1,
				max: 40,
				step: 0.5,
				unit: "×",
				description:
					"Initial horizontal zoom; Ctrl/Cmd + wheel overrides it live and holds the time under the cursor fixed while it does. 1 fits the whole duration in the viewport, which is the only zoom at which the scrollbar is guaranteed absent.",
			},
			{
				name: "snapThreshold",
				kind: "number",
				default: 10,
				min: 0,
				max: 40,
				step: 1,
				unit: "px",
				description:
					"How close the pointer has to be to a marker to snap onto it. Specified in pixels and converted through the current zoom, because what makes a snap feel right is the distance on screen — a tolerance in seconds is generous zoomed out, unusable zoomed in, and needs re-tuning at every zoom. Hold Alt while dragging to bypass it.",
			},
			{
				name: "showRuler",
				kind: "boolean",
				default: true,
				description:
					"Show the tick ruler above the lane. Its divisions come off a fixed 1-2-5 ladder rather than being computed, so zooming walks through the same handful of intervals instead of inventing a new one at every step.",
			},
			{
				name: "showMarkers",
				kind: "boolean",
				default: true,
				description:
					"Show the marker pips. Off also disables snapping — there is nothing to snap to, and leaving invisible snap targets on the track is how a scrubber earns a reputation for fighting you.",
			},
			{
				name: "loop",
				kind: "boolean",
				default: true,
				description:
					"Wrap to the start on reaching the end. The overshoot carries across the wrap rather than being discarded, so a looping timeline does not run gradually slow at high playback rates.",
			},
			{
				name: "playbackRate",
				kind: "number",
				default: 1,
				min: 0.1,
				max: 8,
				step: 0.1,
				unit: "×",
				description:
					"Playback speed. The clock advances by real elapsed time from the runtime host, not by a fixed increment per frame, so a dropped frame costs a frame of smoothness and never a frame of time.",
			},
			{
				name: "follow",
				kind: "enum",
				default: "page",
				options: ["off", "page", "center"],
				description:
					"What the viewport does when the head runs past its edge while playing. Page jumps a whole viewport and leaves the ruler still most of the time, which is what makes it readable; center pins the head and moves the world instead, which never loses it but never lets the ruler rest.",
			},
			{
				name: "trackHeight",
				kind: "number",
				default: 72,
				min: 40,
				max: 180,
				step: 4,
				unit: "px",
				description:
					"Height of the lane under the ruler. The playhead spans ruler and lane together, so this changes how much of the track the head has to cross rather than how tall the component's chrome is.",
			},
			{
				name: "accent",
				kind: "color",
				default: "#a855f7",
				description:
					"Playhead, the active transport button, and any marker that does not carry its own colour.",
			},
		],
	},
	{
		slug: "data-grid",
		name: "DataGrid",
		category: "Power-User Systems",
		addedAt: "2026-09-18",
		description:
			"A virtualised grid over thousands of rows: resizable columns, multi-key sorting, range selection and keyboard navigation. Header and body share one scroller so they can never desync, selection is keyed by row id so it survives a re-sort, and focus stays on the viewport so a recycled row can never take the arrow keys down with it. Give it a parent with a bounded height — like every windowing implementation, in an auto-height parent it quietly stops windowing and renders every row.",
		dependencies: ["lucide-react", "clsx", "tailwind-merge"],
		cookbook: [
			"Skeleton / Shimmer",
			"Layout thrashing",
			"Frame rate (FPS)",
			"Spatial consistency",
			"Frequency of use",
		],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/data-grid/data-grid.tsx",
			},
			...DATA_GRID_PEERS,
			UTILS_VARIANT,
			LOOP_HOST_VARIANT,
		],
		props: [
			{
				name: "rowHeight",
				kind: "number",
				default: 34,
				min: 22,
				max: 72,
				step: 2,
				unit: "px",
				description:
					"Height of one row. Fixed rather than measured, and that is the whole performance story — a constant height makes the first visible row a division instead of a search, so scrolling to row 90,000 costs exactly what scrolling to row 3 costs.",
			},
			{
				name: "headerHeight",
				kind: "number",
				default: 34,
				min: 24,
				max: 64,
				step: 2,
				unit: "px",
				description:
					"Height of the header. It shares the body's scroller, so this is also the offset the window calculation has to subtract from `scrollTop` — get it wrong and the rendered slice lags the scroll by exactly one header.",
			},
			{
				name: "overscan",
				kind: "number",
				default: 6,
				min: 0,
				max: 30,
				step: 1,
				description:
					"Extra rows rendered above and below the fold. At 0 you can out-scroll the renderer and see white bands at the leading edge; past about fifteen you are paying for rows nobody will reach before they are recycled.",
			},
			{
				name: "minColumnWidth",
				kind: "number",
				default: 80,
				min: 40,
				max: 240,
				step: 4,
				unit: "px",
				description:
					"Floor a column can be dragged to. Without one a column can be collapsed to nothing and then cannot be grabbed again, because the handle it would be grabbed by has no width either.",
			},
			{
				name: "stickyHeader",
				kind: "boolean",
				default: true,
				description:
					"Pin the header while the body scrolls. It sits inside the same scroller rather than in a second one kept in sync by hand — that synchronisation is never actually synchronous, and the header lagging the body on a fast horizontal flick is its signature.",
			},
			{
				name: "resizableColumns",
				kind: "boolean",
				default: true,
				description:
					"Allow dragging column edges. The handle is a sibling of the sort button, not a child: nested, every resize would end by firing a click on the header and re-sorting the grid you were only trying to widen.",
			},
			{
				name: "sortable",
				kind: "boolean",
				default: true,
				description:
					"Allow clicking a header to sort. The cycle has three states — ascending, descending, unsorted — because without the third there is no way back to the order the data arrived in, and for a feed that is most-recent-first one click destroys it permanently.",
			},
			{
				name: "multiSort",
				kind: "boolean",
				default: true,
				description:
					"Shift-click a second header to sort by it as a tiebreak. The rank is printed beside each arrow: two arrows with no numbers do not say which key is primary, and that is the entire difference between two different orderings.",
			},
			{
				name: "selectionMode",
				kind: "enum",
				default: "range",
				options: ["none", "single", "range"],
				description:
					"How rows may be selected. Range adds Shift-click for a span and Ctrl/Cmd-click for a toggle, both anchored the same way the keyboard's Shift+Arrow is — one code path, so the two can never disagree about what is selected.",
			},
			{
				name: "zebra",
				kind: "boolean",
				default: true,
				description:
					"Band alternate rows. Computed from the absolute row index rather than from the position inside the rendered window, which is what stops the stripes from crawling as you scroll.",
			},
			{
				name: "showSkeleton",
				kind: "boolean",
				default: false,
				description:
					"Render placeholder rows instead of data. They hold the exact row height and column widths the real rows will, so nothing moves when the data lands — a spinner in an empty box only promises a wait, and then rearranges the page at the end of it.",
			},
			{
				name: "accent",
				kind: "color",
				default: "#a855f7",
				description:
					"Selection wash, the active-row marker down the left edge, and the colour a sorted header takes.",
			},
		],
	},
	{
		slug: "visualizer",
		name: "Visualizer",
		category: "Power-User Systems",
		addedAt: "2026-09-28",
		pausable: true,
		description:
			"A live map of a multi-agent system: the orchestrator burns at the centre with a tick ring of its own daily load, agent pools sit on the inner ring with beams sized by their share, and every agent and tool orbits its pool. Sparks ride the beams home, faster where the work is fresher. Hover for a readout, filter to a week, or pick an agent and it glides out of the constellation into a drilldown of its latest runs, blocked work and timing. All geometry is pure and deterministic: labels are placed against collision boxes rather than measured, and orbs shrink until nothing touches. The keyboard walks the ring clockwise, and below 640px it becomes a ranked list.",
		dependencies: ["lucide-react", "clsx", "tailwind-merge"],
		cookbook: ["Orbit", "Line drawing", "Stagger", "Hover effect", "Idle animation"],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/visualizer/visualizer.tsx",
			},
			...VISUALIZER_PEERS,
			UTILS_VARIANT,
			LOOP_HOST_VARIANT,
		],
		props: [
			{
				name: "defaultView",
				kind: "enum",
				default: "constellation",
				options: ["constellation", "list"],
				description:
					"What a wide stage opens on. Below 640px the list always wins, because ring 2 has nowhere to put its labels at that width and a constellation without names is decoration.",
			},
			{
				name: "showPeriods",
				kind: "boolean",
				default: true,
				description:
					"Show the W1–W4 toggle. Picking a week resizes every orb and beam to that week's volume, but the layout keeps its slots, since each orb reserved room for its largest week up front, and so nothing jumps around.",
			},
			{
				name: "maxNodes",
				kind: "number",
				default: 24,
				min: 3,
				max: 24,
				step: 1,
				description:
					"How many of the busiest nodes take a seat on ring 2. The pools keep their full totals, so a trimmed ring still reports true shares.",
			},
			{
				name: "ambient",
				kind: "boolean",
				default: true,
				description:
					"Sparks on the beams, twinkling stars and a breathing sun. It only runs once the entrance has settled, while the widget is on screen and the tab is visible, and never inside a drilldown.",
			},
			{
				name: "sparkSpeed",
				kind: "number",
				default: 1,
				min: 0.25,
				max: 3,
				step: 0.05,
				unit: "×",
				description:
					"Multiplier on how fast sparks travel. The base speed is already tied to recency, so a pool that went quiet days ago drifts while a busy one streams.",
			},
			{
				name: "ignition",
				kind: "boolean",
				default: true,
				description:
					"Play the staggered entrance: the sun blooms, beams draw, then pools, agents and labels follow. It waits until the widget is first on screen and never replays on a week switch.",
			},
			{
				name: "showLegend",
				kind: "boolean",
				default: true,
				description: "Legend and keyboard hint under the stage.",
			},
			{
				name: "showSunLabel",
				kind: "boolean",
				default: true,
				description:
					"Name the sun. Its size is fitted to the sun's diameter rather than fixed, so a longer name shrinks instead of spilling across the tick ring.",
			},
			{
				name: "sunLabelColor",
				kind: "color",
				default: "#1a1408",
				disabledWhen: { prop: "showSunLabel", equals: false },
				description: "Colour of the sun's name. The sun is lightest at its centre, so a dark ink reads best.",
			},
			{
				name: "accent",
				kind: "color",
				default: "#e6c27a",
				description: "The sun, the beams, the tick rings and the blocked chip.",
			},
			{
				name: "filament",
				kind: "color",
				default: "#5ee1d9",
				description: "The thin filament beside each beam, the dotted links, focus rings and the flag dot.",
			},
			{
				name: "agentColor",
				kind: "color",
				default: "#5fd3a6",
				description: "Orbs for agents.",
			},
			{
				name: "toolColor",
				kind: "color",
				default: "#e6c27a",
				description: "Orbs for tools and services.",
			},
			{
				name: "groupColorA",
				kind: "color",
				default: "#f08bb0",
				description: "Pools alternate between this and groupColorB around the inner ring.",
			},
			{
				name: "groupColorB",
				kind: "color",
				default: "#a99bff",
				description: "The second pool colour.",
			},
		],
	},
	{
		slug: "pathfinder",
		name: "Pathfinder",
		category: "Power-User Systems",
		addedAt: "2026-10-21",
		pausable: true,
		description:
			"A pathfinding visualizer on a grid. Watch A*, Dijkstra, breadth-first or greedy search spread through a maze, then draw the path it found. Drag to draw or erase walls, or drag the start and the goal to move them. The path updates while you draw. Left alone, it builds a new maze, solves it and starts over.",
		dependencies: [],
		cookbook: ["Loop", "Idle animation", "Line drawing", "Orchestration"],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/pathfinder/pathfinder.tsx",
			},
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/pathfinder/pathfinder-engine.ts",
				role: "peer",
				label: "pathfinder-engine.ts",
			},
			LOOP_HOST_VARIANT,
		],
		props: [
			{
				name: "algorithm",
				kind: "enum",
				default: "astar",
				options: ["astar", "dijkstra", "bfs", "greedy"],
				description: "Which search runs.",
			},
			{
				name: "maze",
				kind: "enum",
				default: "backtracker",
				options: ["backtracker", "prim", "scatter"],
				description: "How new walls are laid out.",
			},
			{
				name: "diagonal",
				kind: "boolean",
				default: false,
				description: "Allow diagonal steps. A diagonal can't cut across a wall's corner.",
			},
			{
				name: "speed",
				kind: "number",
				default: 1,
				min: 0.25,
				max: 4,
				step: 0.25,
				unit: "×",
				description: "How fast the search spreads.",
			},
			{
				name: "cellSize",
				kind: "number",
				default: 18,
				min: 10,
				max: 36,
				step: 1,
				unit: "px",
				description: "Size of one grid cell.",
			},
			{
				name: "autoplay",
				kind: "boolean",
				default: true,
				description: "Build a maze, solve it and start over while you are not editing.",
			},
			{
				name: "searchColor",
				kind: "color",
				default: "#a855f7",
				description: "Cells the search has explored.",
			},
			{
				name: "pathColor",
				kind: "color",
				default: "#f0abfc",
				description: "The path it found.",
			},
			{
				name: "boardColor",
				kind: "color",
				default: "#0d0b12",
				description: "The grid. Walls are drawn a shade off it.",
			},
		],
	},
	{
		slug: "kanban",
		name: "Kanban",
		category: "Power-User Systems",
		addedAt: "2026-10-21",
		description:
			"A kanban board with drag and drop. Drag a card within a column or over to another one, and the other cards slide out of the way. Work-in-progress columns have a limit. When one is full, the board warns you or keeps the card out. Columns fold down to a narrow rail. With a keyboard, press Space to pick up a card, move it with the arrow keys, and press Space again to drop it.",
		dependencies: ["motion", "clsx", "tailwind-merge"],
		cookbook: [
			"Drag to reorder",
			"Drag",
			"Layout animation",
			"Shared element transition",
			"Spring",
			"Accordion / Collapse",
		],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/kanban/kanban.tsx",
			},
			LOOP_HOST_VARIANT,
			UTILS_VARIANT,
		],
		props: [
			{
				name: "wipLimit",
				kind: "number",
				default: 3,
				min: 0,
				max: 8,
				step: 1,
				description:
					"The most cards a work-in-progress column should hold. 0 means no limit.",
			},
			{
				name: "wipMode",
				kind: "enum",
				default: "warn",
				options: ["warn", "block"],
				disabledWhen: { prop: "wipLimit", equals: 0 },
				description:
					"What happens past the limit. Warn lets the card in and flags the column. Block keeps it out.",
			},
			{
				name: "stiffness",
				kind: "number",
				default: 520,
				min: 100,
				max: 1000,
				step: 20,
				description: "How hard cards spring into their new places.",
			},
			{
				name: "damping",
				kind: "number",
				default: 40,
				min: 10,
				max: 80,
				step: 1,
				description: "How fast that spring settles.",
			},
			{
				name: "lift",
				kind: "number",
				default: 1.04,
				min: 1,
				max: 1.12,
				step: 0.01,
				unit: "×",
				description: "How much a picked-up card grows.",
			},
			{
				name: "tilt",
				kind: "number",
				default: 4,
				min: 0,
				max: 12,
				step: 0.5,
				unit: "°",
				description: "How far a carried card leans into the drag.",
			},
			{
				name: "collapsible",
				kind: "boolean",
				default: true,
				description: "Let columns fold down to a narrow rail.",
			},
			{
				name: "accentColor",
				kind: "color",
				default: "#a855f7",
				description: "The focus ring, the outline on a lifted card, and the drop slot.",
			},
		],
	},
	{
		slug: "treemap",
		name: "Treemap",
		category: "Power-User Systems",
		addedAt: "2026-11-11",
		pausable: true,
		description:
			"A treemap you can walk into. Every box is a share of the whole, and a box with children is a frame with its children packed inside. Click a frame and it grows to fill the view. The cells that stay on screen slide to their new place, the new ones arrive from where they would have been, and a path at the top takes you back out. Arrow keys move between cells by where they are on screen. With live on, the values wander and the map keeps reflowing.",
		dependencies: [],
		cookbook: [
			"Layout animation",
			"Continuity transition",
			"Spatial consistency",
			"Hover effect",
			"Idle animation",
		],
		variants: [
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/treemap/treemap.tsx",
			},
			{
				lang: "ts",
				style: "tailwind",
				file: "components/registry/treemap/treemap-layout.ts",
				role: "peer",
				label: "treemap-layout.ts",
			},
			LOOP_HOST_VARIANT,
		],
		props: [
			{
				name: "gap",
				kind: "number",
				default: 3,
				min: 0,
				max: 10,
				step: 1,
				unit: "px",
				description: "Space between cells.",
			},
			{
				name: "depth",
				kind: "number",
				default: 2,
				min: 1,
				max: 3,
				step: 1,
				description:
					"How many levels are drawn below the one you are in. At 1 each division is a single box.",
			},
			{
				name: "live",
				kind: "boolean",
				default: true,
				description:
					"The values wander and the map is laid out again as they change.",
			},
			{
				name: "speed",
				kind: "number",
				default: 1,
				min: 0.25,
				max: 3,
				step: 0.25,
				unit: "×",
				disabledWhen: { prop: "live", equals: false },
				description: "How often the live values change.",
			},
			{
				name: "labels",
				kind: "boolean",
				default: true,
				description: "Print a name and a value in every cell that has room.",
			},
			{
				name: "colorBy",
				kind: "enum",
				default: "branch",
				options: ["branch", "size", "depth"],
				description:
					"What a cell's shade means: which branch it is in, how big it is, or how deep it sits.",
			},
			{
				name: "duration",
				kind: "number",
				default: 520,
				min: 0,
				max: 1200,
				step: 20,
				unit: "ms",
				description: "How long a zoom or a reflow takes. 0 cuts.",
			},
			{
				name: "radius",
				kind: "number",
				default: 4,
				min: 0,
				max: 12,
				step: 1,
				unit: "px",
				description: "Corner radius of a cell.",
			},
			{
				name: "accentColor",
				kind: "color",
				default: "#a855f7",
				description: "The strong end of the color ramp.",
			},
			{
				name: "baseColor",
				kind: "color",
				default: "#16121f",
				description: "The weak end of the ramp, and the ground under the cells.",
			},
		],
	},
];
