import type { PropKind } from "@/lib/registry/kinds";

// The workspace's sizes, shared by the real thing (LiveWorkspace, ControlsPanel)
// and the skeleton that stands in for it (WorkspaceSkeleton). The component page
// is served as a prebuilt file, so the skeleton is on screen until the page's
// script runs, and then the workspace takes its place. If the two differ in
// height, everything below jumps: measured at 0.09 to 0.37 layout shift with the
// old 220px placeholder. Change a size here, never in one of the three files.

/** The preview stage's minimum height, per breakpoint. */
export const STAGE_SIZE = {
	component: "min-h-90 md:min-h-120 xl:min-h-150",
	// A template is a page, not an effect. A 360px stage shows the hero and
	// nothing after it, the half of a landing page nobody needs convincing about.
	template: "min-h-140 md:min-h-160 xl:min-h-[78vh]",
} as const;

/** The Controls panel's grid: one cell per prop, flowing in columns. */
export const CONTROLS_GRID =
	"grid grid-cols-1 items-start gap-x-8 gap-y-5 p-4 sm:grid-cols-2 lg:grid-cols-3";

/** The Controls panel's header padding. */
export const CONTROLS_HEADER = "flex items-center justify-between bg-raised/30 px-4 py-2.5";

// Rendered height of one control cell, by kind, in px. Measured in the browser
// at 390, 820 and 1400px wide; the cells do not change height with the width.
// A control whose markup changes height needs its number updated here.
export const CONTROL_HEIGHT = {
	number: 46,
	enum: 52,
	boolean: 20,
	color: 20,
} as const satisfies Record<PropKind, number>;
