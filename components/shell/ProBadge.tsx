"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// The paid-tier mark, revived from the old TierBadge (removed in 97d0870 when
// the catalog went tierless). One-sided on purpose: it renders ONLY for Pro
// entries — free is the default and wears nothing, so the catalog never fills
// with "Free" chips. Static data, no mount gating (unlike NewBadge, whose
// window depends on the clock).
//
// `pill` sits in badge rows next to NewBadge's pill; `tiny` is an inline chip
// for dense sidebar rows — NewBadge's tiny owns the floating corner, so the two
// never collide on entries that are both new and Pro.
export default function ProBadge({
  pro,
  variant = "pill",
  className,
}: {
  pro: boolean | undefined;
  variant?: "pill" | "tiny";
  className?: string;
}) {
  const t = useTranslations("chrome.proBadge");
  if (!pro) return null;

  if (variant === "tiny") {
    return (
      <span
        className={cn(
          "pointer-events-none rounded bg-accent/15 px-1 py-px font-display text-[8px] uppercase tracking-[0.12em] text-accent",
          className,
        )}
      >
        {t("label")}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex min-w-11 items-center justify-center rounded border border-transparent bg-accent/15 px-1.5 py-0.5 font-display text-[9px] uppercase tracking-[0.12em] text-accent",
        className,
      )}
    >
      {t("label")}
    </span>
  );
}
