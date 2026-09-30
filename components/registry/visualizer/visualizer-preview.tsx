"use client";

import { useMemo } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import Visualizer from "./visualizer";
import { orbitFixtures } from "./fixtures";

export default function VisualizerPreview({ values, reducedMotion, paused }: PreviewProps) {
	// Runs are placed relative to now, so the tooltip's "last run" reads live.
	const { nodes, groups } = useMemo(() => orbitFixtures(), []);
	return (
		// A tall, wide pane (the fullscreen stage) zooms the card up rather than
		// re-laying it out, so the constellation keeps its geometry at every size.
		// The min-heights grow the workspace stage to the card's measured height
		// (~796px on phones, ~768px from md up — both views share the list's height) so it never scrolls.
		<div className="@container-size flex h-full min-h-200 w-full flex-col overflow-y-auto p-4 md:min-h-194 md:p-6">
			<div className="m-auto w-full [@container(min-height:760px)_and_(min-width:1180px)]:zoom-[1.15] [@container(min-height:920px)_and_(min-width:1400px)]:zoom-[1.3] max-w-[1100px] rounded-[24px] border border-hairline bg-panel p-5 md:p-6">
				<Visualizer
					nodes={nodes}
					groups={groups}
					defaultView={values.defaultView as "constellation" | "list"}
					showPeriods={values.showPeriods as boolean}
					maxNodes={values.maxNodes as number}
					ambient={values.ambient as boolean}
					sparkSpeed={values.sparkSpeed as number}
					ignition={values.ignition as boolean}
					showLegend={values.showLegend as boolean}
					showSunLabel={values.showSunLabel as boolean}
					sunLabelColor={values.sunLabelColor as string}
					accent={values.accent as string}
					filament={values.filament as string}
					agentColor={values.agentColor as string}
					toolColor={values.toolColor as string}
					groupColorA={values.groupColorA as string}
					groupColorB={values.groupColorB as string}
					paused={paused}
					reducedMotion={reducedMotion}
				/>
			</div>
		</div>
	);
}
