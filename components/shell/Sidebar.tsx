"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { groupByCategory, registry } from "@/lib/registry";
import type { Category, ComponentEntry } from "@/lib/registry/types";
import { fuzzyScore } from "@/lib/fuzzy";
import { useUIStore } from "@/lib/store";
import TierBadge from "./TierBadge";
import ThemeToggle from "./ThemeToggle";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const search = useUIStore((state) => state.search);
  const setSearch = useUIStore((state) => state.setSearch);
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);

  const [collapsed, setCollapsed] = useState<Set<Category>>(new Set());
  const [active, setActive] = useState(0);

  const searching = search.trim().length > 0;

  const scored = useMemo(() => {
    if (!searching) return registry;
    return registry
      .map((entry) => ({
        entry,
        score: Math.max(
          fuzzyScore(search, entry.name),
          fuzzyScore(search, entry.category),
          fuzzyScore(search, entry.description),
        ),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((row) => row.entry);
  }, [search, searching]);

  const groups = useMemo(() => groupByCategory(searching ? scored : registry), [scored, searching]);

  const visibleFlat = useMemo<ComponentEntry[]>(() => {
    if (searching) return scored;
    return groups.flatMap((group) => (collapsed.has(group.category) ? [] : group.entries));
  }, [searching, scored, groups, collapsed]);

  const indexOfSlug = useMemo(() => {
    const map = new Map<string, number>();
    visibleFlat.forEach((entry, i) => map.set(entry.slug, i));
    return map;
  }, [visibleFlat]);

  useEffect(() => {
    setActive(0);
  }, [search]);

  const toggleCategory = (category: Category) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, visibleFlat.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      const target = visibleFlat[active];
      if (target) {
        router.push(`/components/${target.slug}`);
        setSidebarOpen(false);
      }
    } else if (event.key === "Escape") {
      setSearch("");
    }
  };

  const entryLink = (entry: ComponentEntry) => {
    const href = `/components/${entry.slug}`;
    const isActive = pathname === href;
    const isHighlighted = indexOfSlug.get(entry.slug) === active;
    return (
      <li key={entry.slug}>
        <Link
          href={href}
          onClick={() => setSidebarOpen(false)}
          aria-current={isActive ? "page" : undefined}
          className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
            isActive
              ? "bg-raised text-ink"
              : isHighlighted
                ? "bg-raised/50 text-ink"
                : "text-ink-dim hover:bg-raised/40 hover:text-ink"
          }`}
        >
          <span className="truncate font-sans">{entry.name}</span>
          <TierBadge tier={entry.tier} />
        </Link>
      </li>
    );
  };

  return (
    <>
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-hairline bg-surface transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between border-b border-hairline px-4 py-4">
          <Link href="/" className="flex items-baseline gap-2" onClick={() => setSidebarOpen(false)}>
            <span className="font-display text-sm uppercase tracking-[0.2em] text-ink">Shadow</span>
            <span className="font-display text-sm uppercase tracking-[0.2em] text-accent">Garden</span>
          </Link>
          <ThemeToggle />
        </div>

        <div className="px-3 py-3">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search components…"
            aria-label="Search components"
            className="w-full rounded-md border border-hairline bg-panel px-3 py-1.5 font-mono text-xs text-ink placeholder:text-ink-mute outline-none focus-visible:border-accent"
          />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-6" aria-label="Components">
          {visibleFlat.length === 0 ? (
            <p className="px-2.5 py-2 font-mono text-xs text-ink-mute">No matches.</p>
          ) : searching ? (
            <ul className="space-y-0.5">{scored.map(entryLink)}</ul>
          ) : (
            groups.map((group) => {
              const isCollapsed = collapsed.has(group.category);
              return (
                <div key={group.category} className="mb-3">
                  <button
                    type="button"
                    onClick={() => toggleCategory(group.category)}
                    aria-expanded={!isCollapsed}
                    className="flex w-full items-center gap-1.5 px-2.5 py-1 font-display text-[10px] uppercase tracking-[0.18em] text-ink-mute hover:text-ink-dim"
                  >
                    <span className={`transition-transform ${isCollapsed ? "-rotate-90" : ""}`}>▾</span>
                    {group.category}
                  </button>
                  {!isCollapsed && <ul className="mt-0.5 space-y-0.5">{group.entries.map(entryLink)}</ul>}
                </div>
              );
            })
          )}
        </nav>
      </aside>
    </>
  );
}
