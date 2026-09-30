export type OrbitRunStatus = "ok" | "failed" | "running" | "blocked";

/** One recent unit of work by a node — a run, a task, a job. */
export type OrbitRun = {
	id: string;
	title: string;
	status: OrbitRunStatus;
	/** ISO */
	at: string;
	durationMs: number | null;
	/** Rows render as links only when this is set. */
	href?: string;
};

/** One node on the outer ring. */
export type OrbitNodeData = {
	/** Stable, unique. */
	id: string;
	name: string;
	/** Secondary line: a model, an endpoint, an address. */
	detail: string;
	/** Id of the group it orbits. Unknown ids fall into the last group. */
	group: string;
	/** Colours the orb and sets the legend role. */
	kind: "agent" | "tool";
	/** Volume across the whole window. */
	count: number;
	/** Items needing attention; draws the flag dot. */
	flagged: number;
	/** ISO — drives particle speed and recency copy. */
	lastAt: string;
	/** Per day across the window, oldest → newest. */
	daily: number[];
	/** Four most recent 7-day buckets, oldest → newest (W1…W4). */
	weekly: number[];
	medianMs: number | null;
	/** Newest first. */
	recent: OrbitRun[];
};

/** Ring-1 node. Array order is ring order; `count` may exceed the sum of visible nodes. */
export type OrbitGroup = { id: string; label: string; count: number };
