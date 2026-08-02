"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// The body ControlsPanel shows in place of its grid for a Pro component the visitor
// has not unlocked. Deliberately sits INSIDE the panel rather than replacing it: the
// header keeps pause and reset, which are about the preview (free for everyone), not
// about the API.
export default function ControlsLocked({
  name,
  propCount,
  cta,
  dense = false,
}: {
  name: string;
  propCount: number;
  /** Route-specific upgrade path — the shell opens the pricing modal in place, the
      fullscreen stage has to link back to the page that hosts it. */
  cta: ReactNode;
  dense?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 text-center",
        dense ? "px-4 py-6" : "px-6 py-10",
      )}
    >
      <span className="font-display text-[11px] uppercase tracking-[0.2em] text-accent">
        Pro
      </span>
      <p className="max-w-sm font-sans text-sm text-ink-dim">
        {propCount} live controls for {name} — tune every prop and the preview answers
        in real time. Unlocks with the Pro tier.
      </p>
      <div className="mt-1">{cta}</div>
    </div>
  );
}
