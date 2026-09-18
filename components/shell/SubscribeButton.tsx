"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// Dumb trigger: opens the shared PricingModal by setting the #subscribe hash.
// Used by every locked panel (each of which is already server-guaranteed to be
// rendering for a non-entitled visitor). Callers pass an already-translated
// label; the default is the generic "Go Pro".
export default function SubscribeButton({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  const t = useTranslations("chrome.goPro");
  return (
    <button
      type="button"
      onClick={() => {
        window.location.hash = "subscribe";
      }}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 font-sans text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        className,
      )}
    >
      {label ?? t("label")}
    </button>
  );
}
