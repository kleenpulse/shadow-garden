import Link from "next/link";
import type { Metadata } from "next";
import { registry } from "@/lib/registry";

// Next returns a real 404 status for this route, which is what matters — a soft
// 404 (200 + "not found" copy) gets the URL indexed as a thin page. The links are
// here so a crawler that lands on a dead URL still finds its way into the catalog
// instead of hitting a wall.
//
// No `robots` key: Next already emits `<meta name="robots" content="noindex">` on
// a not-found render, and declaring it again ships the tag twice.
export const metadata: Metadata = {
	title: "Not Found",
};

export default function NotFound() {
	return (
		<main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-8 px-6 py-20">
			<div>
				<p className="font-display text-[11px] uppercase tracking-[0.25em] text-accent">
					404
				</p>
				<h1 className="mt-3 font-display text-3xl uppercase tracking-[0.08em] text-ink">
					Nothing in this shadow
				</h1>
				<p className="mt-4 max-w-xl font-sans text-sm leading-relaxed text-ink-dim">
					That page isn&apos;t on the bench. The catalog holds{" "}
					{registry.length} components — every one live, tunable, and ready to
					copy.
				</p>
			</div>

			<nav aria-label="Recovery" className="flex flex-wrap gap-3">
				<Link
					href="/components"
					className="rounded-md border border-hairline bg-panel px-4 py-2 font-display text-[11px] uppercase tracking-[0.18em] text-ink transition-colors hover:border-accent-muted hover:text-accent"
				>
					Browse all components
				</Link>
				<Link
					href="/cookbook"
					className="rounded-md border border-hairline bg-panel px-4 py-2 font-display text-[11px] uppercase tracking-[0.18em] text-ink transition-colors hover:border-accent-muted hover:text-accent"
				>
					Motion Cook Book
				</Link>
				<Link
					href="/"
					className="rounded-md border border-hairline bg-panel px-4 py-2 font-display text-[11px] uppercase tracking-[0.18em] text-ink transition-colors hover:border-accent-muted hover:text-accent"
				>
					Home
				</Link>
			</nav>
		</main>
	);
}
