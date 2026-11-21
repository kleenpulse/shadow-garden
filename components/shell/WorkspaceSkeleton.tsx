import type { ComponentEntry } from "@/lib/registry/types";
import {
	CONTROL_HEIGHT,
	CONTROLS_GRID,
	CONTROLS_HEADER,
	STAGE_SIZE,
} from "./workspace-layout";

// Stands in for LiveWorkspace until the page's script runs. It mirrors the
// workspace part by part (tab row, stage, controls) with the same sizes, so the
// swap moves nothing on the page. See workspace-layout.ts.
export default function WorkspaceSkeleton({ entry }: { entry: ComponentEntry }) {
	return (
		<div className="space-y-4" aria-hidden>
			<div>
				{/* The tab row: the pill tabs on one side, Copy for Agent on the other. */}
				<div className="mb-4 flex h-8.5 w-full items-center justify-between gap-3">
					<div className="h-8 w-38 animate-pulse rounded-full bg-panel" />
					<div className="h-8 w-38 shrink-0 animate-pulse rounded-md bg-panel" />
				</div>
				<div
					className={`${
						entry.kind === "template" ? STAGE_SIZE.template : STAGE_SIZE.component
					} animate-pulse rounded-lg bg-panel`}
				/>
			</div>
			{entry.props.length > 0 && (
				<div className="overflow-hidden rounded-lg bg-panel">
					{/* Same padding as the real header, around a line as tall as its text. */}
					<div className={CONTROLS_HEADER}>
						<div className="h-[16.5px] w-20 animate-pulse rounded bg-raised" />
					</div>
					<div className={CONTROLS_GRID}>
						{entry.props.map((schema) => (
							<div
								key={schema.name}
								style={{ height: CONTROL_HEIGHT[schema.kind] }}
								className="animate-pulse rounded bg-raised/60"
							/>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
