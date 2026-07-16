import type { Tier } from "@/lib/registry/types";

export default function TierBadge({ tier }: { tier: Tier }) {
  const isPro = tier === "pro";
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-display text-[9px] uppercase tracking-[0.12em] ${
        isPro
          ? "bg-accent/15 text-accent"
          : "border border-hairline text-ink-mute"
      }`}
    >
      {isPro ? "Pro" : "Free"}
    </span>
  );
}
