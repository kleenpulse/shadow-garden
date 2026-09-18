"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useIsPro } from "@/hooks/use-pro";

// TopBar CTA island. Renders the "Go Pro" pill ONLY for free users — hidden
// while loading and for Pro users, so there's no flash of a CTA they don't
// need. Opens the shared PricingModal via hash. Mounted only when the commerce
// stack is armed (the (shell) layout decides), so an unarmed deploy never even
// fetches /api/billing.
export default function GoProButton() {
  const pro = useIsPro();
  const t = useTranslations("chrome.goPro");

  // null = loading, true = Pro → render nothing. Only confirmed free users see it.
  if (pro !== false) return null;

  return (
    <button
      type="button"
      onClick={() => {
        window.location.hash = "subscribe";
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 font-sans text-sm font-medium text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden />
      {t("label")}
    </button>
  );
}
