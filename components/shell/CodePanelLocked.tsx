"use client";

import { useTranslations } from "next-intl";
import SubscribeButton from "./SubscribeButton";

// The Code tab for a Pro component the visitor has not unlocked. A client leaf
// because the strings are translated and main's i18n is client-only; the
// entitlement answer was already resolved server-side in CodePanel — no raw
// source is anywhere near this subtree.
export default function CodePanelLocked({ name }: { name: string }) {
  const t = useTranslations("chrome.codePanel");
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-lg bg-panel px-6 text-center">
      <span className="font-display text-[11px] uppercase tracking-[0.2em] text-accent">
        {t("lockedEyebrow")}
      </span>
      <p className="max-w-xs font-sans text-sm text-ink-dim">
        {t("lockedBody", { name })}
      </p>
      <SubscribeButton label={t("lockedCta")} className="mt-2" />
    </div>
  );
}
