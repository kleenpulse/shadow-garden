import type { OrbitGroup, OrbitNodeData, OrbitRun, OrbitRunStatus } from "./types";

/*
 * Preview data: a multi-agent system around an orchestrator. Deterministic for a
 * given `now`: daily sums to count, weekly is derived from daily, and the newest
 * run matches lastAt.
 */

const HOUR = 3_600_000;
const DAYS = 30;

type Pattern = "steady" | "daily" | "weekly" | "burst" | "sparse";
type Run = [title: string, hoursAgo: number, status: OrbitRunStatus, durationMs: number | null];

type Spec = {
	id: string;
	name: string;
	detail: string;
	group: string;
	kind: "agent" | "tool";
	count: number;
	flagged: number;
	pattern: Pattern;
	medianMs: number | null;
	/** Newest first; the first entry defines lastAt. */
	runs: Run[];
};

export const GROUPS: Omit<OrbitGroup, "count">[] = [
	{ id: "planning", label: "Planning" },
	{ id: "code", label: "Code" },
	{ id: "research", label: "Research" },
	{ id: "review", label: "Review" },
	{ id: "ops", label: "Ops" },
	{ id: "data", label: "Data" },
];

/** Work in each pool beyond the visible nodes (the long tail). */
const TAIL: Record<string, number> = { planning: 12, code: 30, research: 14, review: 9, ops: 16, data: 8 };

const SPECS: Spec[] = [
	{ id: "planner", name: "Planner", detail: "agent://planner · 6 tools", group: "planning", kind: "agent", count: 38, flagged: 1, pattern: "steady", medianMs: 42_000, runs: [
		["Break down: checkout redesign epic", 1, "ok", 38_000],
		["Re-plan after failed migration", 6, "blocked", null],
		["Sprint plan for search relevance", 26, "ok", 51_000],
		["Split RFC into 9 tasks", 49, "ok", 44_000],
	] },
	{ id: "architect", name: "Architect", detail: "agent://architect · 4 tools", group: "planning", kind: "agent", count: 21, flagged: 0, pattern: "steady", medianMs: 95_000, runs: [
		["Draft ADR: event bus vs queue", 4, "ok", 112_000],
		["Review service boundaries for billing", 30, "ok", 88_000],
		["Sketch schema for audit log", 77, "ok", 94_000],
	] },
	{ id: "task-router", name: "Task Router", detail: "queue://router", group: "planning", kind: "tool", count: 46, flagged: 0, pattern: "daily", medianMs: 240, runs: [
		["Route 14 tasks to Code pool", 0.4, "ok", 310],
		["Rebalance after Coder backlog", 3, "ok", 220],
		["Route review wave", 20, "ok", 260],
	] },
	{ id: "coder", name: "Coder", detail: "agent://coder · 12 tools", group: "code", kind: "agent", count: 78, flagged: 3, pattern: "daily", medianMs: 184_000, runs: [
		["Implement cart totals with tax rules", 0.6, "running", null],
		["Fix flaky date picker test", 2, "ok", 96_000],
		["Add pagination to /orders", 5, "blocked", null],
		["Migrate auth to session tokens", 22, "failed", 402_000],
		["Wire feature flag for new search", 28, "ok", 171_000],
	] },
	{ id: "test-writer", name: "Test Writer", detail: "agent://test-writer · 5 tools", group: "code", kind: "agent", count: 36, flagged: 1, pattern: "daily", medianMs: 71_000, runs: [
		["Cover refund edge cases", 1.5, "ok", 64_000],
		["Snapshot tests for invoice PDF", 9, "blocked", null],
		["Property tests for price parser", 31, "ok", 83_000],
	] },
	{ id: "refactorer", name: "Refactorer", detail: "agent://refactorer · 7 tools", group: "code", kind: "agent", count: 16, flagged: 0, pattern: "burst", medianMs: 240_000, runs: [
		["Extract money utils from cart", 18, "ok", 233_000],
		["Remove dead feature flags", 41, "ok", 198_000],
		["Collapse duplicate API clients", 70, "ok", 287_000],
	] },
	{ id: "sandbox", name: "Sandbox", detail: "exec://sandbox · node 22", group: "code", kind: "tool", count: 52, flagged: 2, pattern: "daily", medianMs: 9_400, runs: [
		["Run unit suite (1,284 tests)", 0.8, "ok", 41_000],
		["Execute migration dry-run", 4, "failed", 12_300],
		["Typecheck monorepo", 7, "ok", 18_800],
	] },
	{ id: "github-mcp", name: "GitHub MCP", detail: "mcp://github", group: "code", kind: "tool", count: 44, flagged: 0, pattern: "daily", medianMs: 1_800, runs: [
		["Open PR #482: cart totals", 0.9, "ok", 1_400],
		["Fetch review comments on #479", 3.5, "ok", 2_100],
		["Create branch feat/search-flags", 27, "ok", 900],
	] },
	{ id: "researcher", name: "Researcher", detail: "agent://researcher · 6 tools", group: "research", kind: "agent", count: 29, flagged: 0, pattern: "steady", medianMs: 128_000, runs: [
		["Compare vector DB pricing", 2.5, "ok", 141_000],
		["Summarize WCAG 2.2 changes", 29, "ok", 117_000],
		["Survey rate-limit strategies", 54, "ok", 132_000],
	] },
	{ id: "browser", name: "Browser", detail: "mcp://browser · headless", group: "research", kind: "tool", count: 24, flagged: 1, pattern: "daily", medianMs: 6_200, runs: [
		["Capture pricing pages (5 sites)", 2.6, "ok", 22_000],
		["Log in to vendor portal", 11, "blocked", null],
		["Screenshot staging checkout", 32, "ok", 5_100],
	] },
	{ id: "web-search", name: "Web Search", detail: "mcp://search", group: "research", kind: "tool", count: 23, flagged: 0, pattern: "daily", medianMs: 2_100, runs: [
		["\"postgres logical replication lag\"", 2.7, "ok", 1_900],
		["\"stripe tax api rounding\"", 25, "ok", 2_400],
	] },
	{ id: "doc-reader", name: "Doc Reader", detail: "agent://doc-reader · 2 tools", group: "research", kind: "agent", count: 11, flagged: 0, pattern: "sparse", medianMs: 33_000, runs: [
		["Read vendor SLA (42 pages)", 50, "ok", 36_000],
		["Extract API limits from docs", 120, "ok", 29_000],
	] },
	{ id: "reviewer", name: "Reviewer", detail: "agent://reviewer · 5 tools", group: "review", kind: "agent", count: 33, flagged: 4, pattern: "steady", medianMs: 58_000, runs: [
		["Review PR #482: cart totals", 0.7, "running", null],
		["Review PR #479: session tokens", 3, "blocked", null],
		["Review PR #475: search flags", 24, "ok", 61_000],
		["Review PR #471: invoice PDF", 48, "ok", 55_000],
	] },
	{ id: "security-auditor", name: "Security Auditor", detail: "agent://security · 4 tools", group: "review", kind: "agent", count: 12, flagged: 2, pattern: "weekly", medianMs: 310_000, runs: [
		["Audit auth migration diff", 21, "blocked", null],
		["Dependency CVE sweep", 69, "ok", 296_000],
		["Secrets scan on release branch", 170, "failed", 12_000],
	] },
	{ id: "lint-fixer", name: "Lint Fixer", detail: "exec://eslint --fix", group: "review", kind: "tool", count: 8, flagged: 0, pattern: "burst", medianMs: 4_500, runs: [
		["Autofix 37 lint errors", 22, "ok", 4_100],
		["Autofix import order", 90, "ok", 4_900],
	] },
	{ id: "deployer", name: "Deployer", detail: "agent://deployer · 3 tools", group: "ops", kind: "agent", count: 18, flagged: 1, pattern: "burst", medianMs: 140_000, runs: [
		["Promote build 1.42.0 to staging", 8, "ok", 131_000],
		["Canary 1.41.2 to 5%", 30, "blocked", null],
		["Roll back 1.41.1", 75, "ok", 96_000],
	] },
	{ id: "ci-runner", name: "CI Runner", detail: "ci://runner · 8 workers", group: "ops", kind: "tool", count: 41, flagged: 3, pattern: "daily", medianMs: 420_000, runs: [
		["Pipeline #9121 on feat/cart-totals", 1.1, "running", null],
		["Pipeline #9118 on main", 4, "failed", 388_000],
		["Pipeline #9112 on feat/search-flags", 25, "ok", 402_000],
	] },
	{ id: "shell", name: "Shell", detail: "exec://bash", group: "ops", kind: "tool", count: 27, flagged: 0, pattern: "daily", medianMs: 800, runs: [
		["Tail staging logs", 3.2, "ok", 1_200],
		["Rotate preview env secrets", 33, "ok", 640],
	] },
	{ id: "analyst", name: "Analyst", detail: "agent://analyst · 4 tools", group: "data", kind: "agent", count: 14, flagged: 0, pattern: "steady", medianMs: 88_000, runs: [
		["Weekly conversion report", 10, "ok", 92_000],
		["Cohort retention by plan", 58, "ok", 81_000],
	] },
	{ id: "vector-store", name: "Vector Store", detail: "mcp://vectors · 2.1M chunks", group: "data", kind: "tool", count: 36, flagged: 0, pattern: "daily", medianMs: 350, runs: [
		["Upsert 1,204 doc chunks", 2.2, "ok", 2_900],
		["Query: refund policy context", 2.4, "ok", 180],
		["Reindex support articles", 34, "ok", 61_000],
	] },
	{ id: "sql-runner", name: "SQL Runner", detail: "mcp://postgres · read-only", group: "data", kind: "tool", count: 9, flagged: 1, pattern: "sparse", medianMs: 2_700, runs: [
		["Query churn by region", 12, "ok", 3_100],
		["Write access requested: orders", 40, "blocked", null],
	] },
];

function seeded(text: string): () => number {
	let h = 2166136261;
	for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
	let a = h >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function weightFor(pattern: Pattern, day: number, rand: () => number): number {
	const weekday = day % 7 < 5;
	const jitter = 0.55 + rand() * 0.9;
	switch (pattern) {
		case "steady":
			return (weekday ? 1 : 0.12) * (0.6 + day / DAYS) * jitter;
		case "daily":
			return (weekday ? 1 : 0.55) * jitter;
		case "weekly":
			return day % 7 === 2 ? 1 : 0;
		case "burst":
			return day % 9 === 4 || day % 9 === 5 ? 1.6 * jitter : 0.08 * jitter;
		case "sparse":
			return rand() < 0.3 ? jitter : 0;
	}
}

/** Largest-remainder split, so the days sum exactly to `count`. */
function distribute(count: number, weights: number[]): number[] {
	const total = weights.reduce((a, b) => a + b, 0) || 1;
	const raw = weights.map((w) => (count * w) / total);
	const out = raw.map(Math.floor);
	let left = count - out.reduce((a, b) => a + b, 0);
	const order = raw.map((v, i) => ({ i, rem: v - Math.floor(v) })).sort((a, b) => b.rem - a.rem || b.i - a.i);
	for (const { i } of order) {
		if (left <= 0) break;
		out[i]! += 1;
		left -= 1;
	}
	return out;
}

function dailyFor(spec: Spec): number[] {
	const rand = seeded(spec.id);
	const lastIdx = DAYS - 1 - Math.floor(spec.runs[0]![1] / 24);
	const weights = Array.from({ length: DAYS }, (_, day) => (day > lastIdx ? 0 : weightFor(spec.pattern, day, rand)));
	// Every listed run happened on some day; make sure those days carry work.
	for (const [, hoursAgo] of spec.runs) {
		const idx = DAYS - 1 - Math.floor(hoursAgo / 24);
		if (idx >= 0 && idx <= lastIdx) weights[idx] = Math.max(weights[idx]!, 0.9);
	}
	const daily = distribute(spec.count, weights);
	if (daily[lastIdx] === 0) {
		const donor = daily.indexOf(Math.max(...daily));
		daily[donor]! -= 1;
		daily[lastIdx]! += 1;
	}
	return daily;
}

function weeklyFrom(daily: number[]): number[] {
	return [0, 1, 2, 3].map((w) => {
		const start = DAYS - 28 + w * 7;
		return daily.slice(start, start + 7).reduce((a, b) => a + b, 0);
	});
}

export function orbitFixtures(now: number = Date.now()): { nodes: OrbitNodeData[]; groups: OrbitGroup[] } {
	const anchor = Math.floor(now / HOUR) * HOUR;
	const nodes: OrbitNodeData[] = SPECS.map((spec) => {
		const recent: OrbitRun[] = spec.runs.map(([title, hoursAgo, status, durationMs], i) => ({
			id: `${spec.id}-${i}`,
			title,
			status,
			at: new Date(anchor - hoursAgo * HOUR).toISOString(),
			durationMs,
		}));
		const daily = dailyFor(spec);
		return {
			id: spec.id,
			name: spec.name,
			detail: spec.detail,
			group: spec.group,
			kind: spec.kind,
			count: spec.count,
			flagged: spec.flagged,
			lastAt: recent[0]!.at,
			daily,
			weekly: weeklyFrom(daily),
			medianMs: spec.medianMs,
			recent,
		};
	}).sort((a, b) => b.count - a.count);

	const totals = new Map<string, number>();
	for (const n of nodes) totals.set(n.group, (totals.get(n.group) ?? 0) + n.count);
	const groups = GROUPS.map((g) => ({ ...g, count: (totals.get(g.id) ?? 0) + (TAIL[g.id] ?? 0) }));
	return { nodes, groups };
}
