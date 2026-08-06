import Link from "next/link";
import {
	COLLECTIONS,
	COLLECTION_GROUPS,
	collectionGroup,
	collectionPath,
} from "@/lib/collections";
import { registry } from "@/lib/registry";

// The shell had no footer. This is where the collection spokes live: server
// rendered, so all 18 links sit in the static HTML of every shell page — which is
// the only reason a crawler sees the hub-and-spoke graph at all. A client-side
// nav would put them behind hydration, where they may as well not exist.

const NAV = [
	{ href: "/components", label: "All components" },
	{ href: "/collections", label: "Collections" },
	{ href: "/cookbook", label: "Motion Cook Book" },
];

export default function SiteFooter() {
	const groups = COLLECTION_GROUPS.map((group) => ({
		group,
		items: COLLECTIONS.filter((c) => collectionGroup(c) === group),
	})).filter((row) => row.items.length > 0);

	return (
		<footer className="mt-16 border-t border-hairline">
			<div className="mx-auto w-full max-w-7xl px-3 py-12 lg:px-8">
				<div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
					<div>
						<p className="font-display text-sm uppercase tracking-[0.28em] text-ink">
							Shadow Garden
						</p>
						<p className="mt-3 max-w-xs font-sans text-xs leading-relaxed text-ink-mute">
							An instrument bench for React motion. Preview live, tune every
							parameter, take the source.
						</p>
						<nav
							aria-label="Site"
							className="mt-5 flex flex-col gap-2 font-display text-[10px] uppercase tracking-[0.22em]"
						>
							{NAV.map((item) => (
								<Link
									key={item.href}
									href={item.href}
									className="text-ink-dim transition-colors hover:text-accent"
								>
									{item.label}
								</Link>
							))}
						</nav>
					</div>

					{groups.map(({ group, items }) => (
						<nav key={group} aria-label={group}>
							<p className="font-display text-[10px] uppercase tracking-[0.22em] text-ink-mute">
								{group}
							</p>
							<ul className="mt-3 flex flex-col gap-2">
								{items.map((collection) => (
									<li key={collection.slug}>
										<Link
											href={collectionPath(collection)}
											className="font-sans text-xs text-ink-dim transition-colors hover:text-accent"
										>
											{collection.title}
										</Link>
									</li>
								))}
							</ul>
						</nav>
					))}
				</div>
			</div>

			<div className="border-t border-hairline">
				{/* min-h-11 = the sidebar's pinned footer (py-3 + text-sm leading), so the
				    two bottom bars line up where they meet at the sidebar edge. */}
				<div className="mx-auto flex min-h-11 w-full max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-3 py-3 font-display text-[10px] uppercase tracking-[0.22em] text-ink-mute lg:px-8">
					<span>{registry.length} components · 1 accent</span>
					<span>Shadow Garden</span>
				</div>
			</div>
		</footer>
	);
}
