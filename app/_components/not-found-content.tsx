"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

// Body copy for app/not-found.tsx — the page itself stays a server component so
// its metadata export (and Next's own noindex handling) keep working.
export default function NotFoundContent({ total }: { total: number }) {
	const t = useTranslations("pages.notFound");

	return (
		<main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-8 px-6 py-20">
			<div>
				<p className="font-display text-[11px] uppercase tracking-[0.25em] text-accent">
					404
				</p>
				<h1 className="mt-3 font-display text-3xl uppercase tracking-[0.08em] text-ink">
					{t("title")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-sm leading-relaxed text-ink-dim">
					{t("body", { count: total })}
				</p>
			</div>

			<nav aria-label={t("recovery")} className="flex flex-wrap gap-3">
				<Link
					href="/components"
					className="rounded-md border border-hairline bg-panel px-4 py-2 font-display text-[11px] uppercase tracking-[0.18em] text-ink transition-colors hover:border-accent-muted hover:text-accent"
				>
					{t("browseAll")}
				</Link>
				<Link
					href="/cookbook"
					className="rounded-md border border-hairline bg-panel px-4 py-2 font-display text-[11px] uppercase tracking-[0.18em] text-ink transition-colors hover:border-accent-muted hover:text-accent"
				>
					{t("cookbook")}
				</Link>
				<Link
					href="/"
					className="rounded-md border border-hairline bg-panel px-4 py-2 font-display text-[11px] uppercase tracking-[0.18em] text-ink transition-colors hover:border-accent-muted hover:text-accent"
				>
					{t("home")}
				</Link>
			</nav>
		</main>
	);
}
