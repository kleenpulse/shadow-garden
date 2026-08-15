import Link from "next/link";
import type { Crumb } from "@/lib/schema";
import BreadcrumbNav from "./BreadcrumbNav";

// Server component, no state — renders in the static shell so a crawler sees the
// trail without waiting on hydration. The matching BreadcrumbList JSON-LD is
// emitted by the page; both read the same `Crumb[]` so they cannot disagree.
//
// The last crumb is the current page: text, not a link, and marked
// `aria-current="page"`. A self-link there is a dead affordance for a mouse and a
// wrong announcement for a screen reader.
export default function Breadcrumbs({ trail }: { trail: Crumb[] }) {
	return (
		<BreadcrumbNav className="mb-4">
			<ol className="flex flex-wrap items-center gap-1.5 font-display text-[10px] uppercase tracking-[0.18em] text-ink-mute">
				{trail.map((crumb, index) => {
					const isLast = index === trail.length - 1;
					return (
						// Keyed by position, not by path. A trail is a fixed ordered list
						// whose identity IS its position, and two crumbs may legitimately
						// share a destination — a component page reads
						// "Components / Power-User Systems", and there is no per-category
						// route for the second one to point at. Keying by path made those
						// collide and React logged a duplicate-key error on every one of
						// the component detail pages.
						// eslint-disable-next-line react/no-array-index-key
						<li key={index} className="flex items-center gap-1.5">
							{isLast ? (
								<span aria-current="page" className="text-ink-dim">
									{crumb.name}
								</span>
							) : (
								<Link
									href={crumb.path}
									className="transition-colors hover:text-accent"
								>
									{crumb.name}
								</Link>
							)}
							{!isLast && (
								<span aria-hidden="true" className="text-ink-mute/50">
									/
								</span>
							)}
						</li>
					);
				})}
			</ol>
		</BreadcrumbNav>
	);
}
