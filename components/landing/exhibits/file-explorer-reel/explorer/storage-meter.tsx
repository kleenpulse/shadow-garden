"use client";

// Compact readout of how much origin storage the explorer is using, plus the
// active backend id. Quota is best-effort — when the browser won't report it,
// we show usage alone.

import { HardDrive } from "lucide-react";
import type { FileStoreBackend, StorageEstimate } from "./store/types";
import { cn, formatBytes } from "./util";

const BACKEND_LABEL: Record<string, string> = {
	opfs: "OPFS",
	indexeddb: "IndexedDB",
	memory: "Memory",
};

export function StorageMeter({
	estimate,
	backend,
	className,
}: {
	estimate: StorageEstimate | null;
	backend: FileStoreBackend | null;
	className?: string;
}) {
	const usage = estimate?.usage ?? 0;
	const quota = estimate?.quota ?? 0;
	const pct = quota > 0 ? Math.min(100, (usage / quota) * 100) : null;
	const label = backend ? (BACKEND_LABEL[backend] ?? backend) : "—";

	return (
		<div
			className={cn(
				"flex items-center gap-2 text-[11px] text-ink-mute",
				className,
			)}
			title={
				quota > 0
					? `${formatBytes(usage)} of ${formatBytes(quota)} used · ${label}`
					: `${formatBytes(usage)} used · ${label}`
			}
		>
			<HardDrive className="h-3.5 w-3.5 shrink-0" />
			<span className="font-display uppercase tracking-[0.15em]">{label}</span>
			{pct !== null ? (
				<span
					className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-raised"
					role="presentation"
				>
					<span
						className="block h-full rounded-full bg-accent"
						style={{ width: `${Math.max(2, pct)}%` }}
					/>
				</span>
			) : null}
			<span className="font-mono tabular-nums">{formatBytes(usage)}</span>
		</div>
	);
}
