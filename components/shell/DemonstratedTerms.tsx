import Link from "next/link";
import { termAnchor, termDefinition } from "@/lib/cookbook";
import type { ComponentEntry } from "@/lib/registry/types";

// The header chips name the motion terms a component demonstrates; this prints
// what they mean. Both sides already exist — `entry.cookbook` declares the terms,
// lib/cookbook.ts defines them — so this is a join, not new copy. It also gives
// every component page a paragraph of genuinely topical text it didn't have, and
// feeds the glossary a deep link from all 70.
export default function DemonstratedTerms({ entry }: { entry: ComponentEntry }) {
	const terms = (entry.cookbook ?? [])
		.map((term) => ({ term, definition: termDefinition(term) }))
		.filter((row): row is { term: string; definition: string } =>
			Boolean(row.definition),
		);

	if (terms.length === 0) return null;

	return (
		<section className="space-y-3">
			<h2 className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute">
				What It Demonstrates
			</h2>
			<dl className="divide-y divide-hairline rounded-lg border border-hairline bg-panel">
				{terms.map(({ term, definition }) => (
					<div
						key={term}
						className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-6"
					>
						<dt className="shrink-0 sm:w-52">
							<Link
								href={`/cookbook#${termAnchor(term)}`}
								className="font-display text-xs uppercase tracking-[0.12em] text-ink transition-colors hover:text-accent"
							>
								{term}
							</Link>
						</dt>
						<dd className="font-sans text-sm leading-relaxed text-ink-dim">
							{definition}
						</dd>
					</div>
				))}
			</dl>
		</section>
	);
}
