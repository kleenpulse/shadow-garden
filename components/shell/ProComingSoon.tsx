"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

// Stand-in for GoProButton while payments are switched off (COMMERCE_COMING_SOON
// in lib/capabilities.ts). Same TopBar slot, quieter dress: hairline pill instead
// of the accent CTA. Still opens the pricing modal via #subscribe — the modal
// renders its coming-soon state, so the tier stays visible without selling.
export default function ProComingSoon() {
	const t = useTranslations("chrome.goPro");

	return (
		<button
			type="button"
			onClick={() => {
				window.location.hash = "subscribe";
			}}
			className="inline-flex h-8 items-center gap-1.5 rounded-md border border-hairline bg-surface px-3 font-sans text-sm text-ink-dim transition-colors hover:border-accent-muted hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
		>
			<Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />
			{t("comingSoon")}
		</button>
	);
}
