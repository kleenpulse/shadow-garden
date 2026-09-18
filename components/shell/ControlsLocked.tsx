"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// The body ControlsPanel shows in place of its grid for a Pro component the
// visitor has not unlocked (GATE_CONTROLS deployments only). Deliberately sits
// INSIDE the panel rather than replacing it: the header keeps pause and reset,
// which are about the preview (free for everyone), not about the API.
export default function ControlsLocked({
  name,
  propCount,
  cta,
  dense = false,
}: {
  name: string;
  propCount: number;
  /** Route-specific upgrade path — the shell opens the pricing modal in place,
      the fullscreen stage has to link back to the page that hosts it. */
  cta: ReactNode;
  dense?: boolean;
}) {
  const t = useTranslations("chrome.controlsLocked");
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 text-center",
        dense ? "px-4 py-6" : "px-6 py-10",
      )}
    >
      <span className="font-display text-[11px] uppercase tracking-[0.2em] text-accent">
        {t("eyebrow")}
      </span>
      <p className="max-w-sm font-sans text-sm text-ink-dim">
        {t("body", { name, propCount })}
      </p>
      <div className="mt-1">{cta}</div>
    </div>
  );
}
