"use client";

import { useTranslations } from "next-intl";

// Subtitle for the /favorites header. Favorites live in this browser
// (localStorage) — there are no accounts to sync them to. Client component
// (useTranslations requires it) — the parent page stays a server component,
// this leaf just hydrates in around it.
export default function FavoritesSubtitle() {
  const t = useTranslations("chrome.favorites");
  return (
    <p className="mt-3 max-w-xl font-sans text-sm text-ink-dim">
      {t("subtitle")}
    </p>
  );
}
