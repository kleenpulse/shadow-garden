"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Pathfinder from "./pathfinder";

export default function PathfinderPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	return (
		<div className="relative h-full w-full">
			<Pathfinder
				algorithm={values.algorithm as "astar" | "dijkstra" | "bfs" | "greedy"}
				maze={values.maze as "backtracker" | "prim" | "scatter"}
				diagonal={values.diagonal as boolean}
				speed={values.speed as number}
				cellSize={values.cellSize as number}
				autoplay={values.autoplay as boolean}
				searchColor={values.searchColor as string}
				pathColor={values.pathColor as string}
				boardColor={values.boardColor as string}
				paused={paused}
				reducedMotion={reducedMotion}
			/>
		</div>
	);
}
