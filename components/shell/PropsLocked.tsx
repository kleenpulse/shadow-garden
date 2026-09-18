"use client";

import { useTranslations } from "next-intl";
import SubscribeButton from "./SubscribeButton";

// The Props API table for a gated Pro component (GATE_CONTROLS deployments
// only). Client leaf for the same reason as CodePanelLocked: translated
// strings, server-resolved entitlement.
export default function PropsLocked({
  name,
  propCount,
}: {
  name: string;
  propCount: number;
}) {
  const t = useTranslations("chrome.propsLocked");
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg bg-panel px-6 py-8 text-center">
      <span className="font-display text-[11px] uppercase tracking-[0.2em] text-accent">
        {t("eyebrow")}
      </span>
      <p className="max-w-sm font-sans text-sm text-ink-dim">
        {t("body", { name, propCount })}
      </p>
      <SubscribeButton label={t("cta")} className="mt-2" />
    </div>
  );
}
