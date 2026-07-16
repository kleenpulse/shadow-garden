import Link from "next/link";
import type { Metadata } from "next";
import { groupByCategory } from "@/lib/registry";
import TierBadge from "@/components/shell/TierBadge";

export const metadata: Metadata = {
  title: "Components",
  description: "Browse the Shadow Garden catalog of tunable, animation-forward components.",
};

export default function CatalogPage() {
  const groups = groupByCategory();

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-10">
        <p className="font-display text-[11px] uppercase tracking-[0.25em] text-ink-mute">Catalog</p>
        <h1 className="mt-2 font-display text-3xl uppercase tracking-[0.08em] text-ink">Components</h1>
        <p className="mt-3 max-w-xl font-sans text-sm text-ink-dim">
          Every component is live and tunable. Dial in the parameters, share the URL, copy the source.
        </p>
      </header>

      <div className="space-y-10">
        {groups.map((group) => (
          <section key={group.category}>
            <h2 className="mb-3 font-display text-[11px] uppercase tracking-[0.2em] text-ink-mute">
              {group.category}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.entries.map((entry) => (
                <Link
                  key={entry.slug}
                  href={`/components/${entry.slug}`}
                  className="group flex flex-col gap-2 rounded-lg border border-hairline bg-panel p-4 transition-colors hover:border-accent-muted"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-sm uppercase tracking-[0.08em] text-ink group-hover:text-accent">
                      {entry.name}
                    </span>
                    <TierBadge tier={entry.tier} />
                  </div>
                  <p className="font-sans text-xs leading-relaxed text-ink-dim">{entry.description}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
