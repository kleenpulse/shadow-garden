import type { Tier } from "@/lib/registry/types";
import { cn } from "@/lib/utils";

export default function TierBadge({
	tier,
	className,
}: {
	tier: Tier;
	className?: string;
}) {
	const isPro = tier === "pro";
	return (
		<span
			className={cn(
				`inline-flex min-w-11 items-center justify-center rounded px-1.5 py-0.5 font-display text-[9px] border uppercase tracking-[0.12em] `,
				className,
				isPro
					? " border-transparent bg-accent/15 text-accent"
					: " border-hairline text-ink-mute",
			)}
		>
			{isPro ? "Pro" : "Free"}
		</span>
	);
}
