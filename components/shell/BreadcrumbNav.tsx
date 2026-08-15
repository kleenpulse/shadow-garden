"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

// Thin client wrapper around <nav> so Breadcrumbs.tsx (a server component,
// deliberately — the trail must render in the static shell for crawlers with
// no hydration wait) can still get a translated aria-label. The <ol>/<li>
// list is passed through as `children`, server-rendered exactly as before —
// only this wrapper hydrates.
export default function BreadcrumbNav({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	const t = useTranslations("chrome.breadcrumbs");
	return (
		<nav aria-label={t("ariaLabel")} className={className}>
			{children}
		</nav>
	);
}
