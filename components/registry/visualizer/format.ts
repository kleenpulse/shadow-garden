import type { OrbitNodeData } from "./types";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

const NUMBER = new Intl.NumberFormat("en-US");

/** Locale-pinned so server and client render the same digits. */
export function formatCount(n: number): string {
	return NUMBER.format(Math.round(n));
}

/** Compact age for run rows: "12m", "3h", "2d", "5w". */
export function formatAge(hours: number): string {
	if (!Number.isFinite(hours) || hours < 0) return "—";
	if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
	if (hours < 24) return `${Math.round(hours)}h`;
	const days = hours / 24;
	if (days < 14) return `${Math.round(days)}d`;
	return `${Math.round(days / 7)}w`;
}

/** "just now", "12m ago", "3h ago", "2d ago", "3w ago". */
export function formatAgo(iso: string, now: number): string {
	const t = Date.parse(iso);
	if (Number.isNaN(t)) return "—";
	const diff = Math.max(0, now - t);
	if (diff < MINUTE) return "just now";
	return `${formatAge(diff / HOUR)} ago`;
}

/** Long form for screen readers: "3 hours ago". */
export function formatAgoLong(iso: string, now: number): string {
	const t = Date.parse(iso);
	if (Number.isNaN(t)) return "unknown";
	const diff = Math.max(0, now - t);
	const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;
	if (diff < MINUTE) return "just now";
	if (diff < HOUR) return plural(Math.round(diff / MINUTE), "minute");
	if (diff < DAY) return plural(Math.round(diff / HOUR), "hour");
	if (diff < 14 * DAY) return plural(Math.round(diff / DAY), "day");
	return plural(Math.round(diff / (7 * DAY)), "week");
}

/** "Tue, Sep 23 · 2:05 pm" in the viewer's own clock. */
export function formatStamp(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "—";
	const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
	const h = d.getHours();
	const h12 = h % 12 === 0 ? 12 : h % 12;
	return `${day} · ${h12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

export function displayName(node: Pick<OrbitNodeData, "name" | "id">): string {
	return node.name?.trim() || node.id;
}

/** 840 → "840ms", 12_400 → "12.4s", 95_000 → "1m 35s", null → "—". */
export function formatMs(ms: number | null | undefined): string {
	if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "—";
	if (ms < 1000) return `${Math.round(ms)}ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
	const m = Math.floor(ms / 60_000);
	const sec = Math.round((ms % 60_000) / 1000);
	return sec ? `${m}m ${sec}s` : `${m}m`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
	return `${formatCount(n)} ${n === 1 ? one : many}`;
}

/** Mono uppercase caption. */
export const READOUT = "font-mono text-[11px] uppercase tracking-[0.06em] text-ink-mute";
