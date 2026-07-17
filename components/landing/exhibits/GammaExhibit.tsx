"use client";

import Link from "next/link";
import { SpotlightShell } from "@/components/registry/spotlight-shell/SpotlightShell";
import type { LandingEntry } from "@/components/landing/data";

// γ — Micro-interactions. One SpotlightShell card per specimen; the cards ARE
// the demo — tilt, glow, and shimmer respond to the cursor (self-gated under
// reduced motion by the component itself).
export default function GammaExhibit({
  items,
  accentColor,
}: {
  items: LandingEntry[];
  accentColor: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((item) => (
        <SpotlightShell key={item.slug} accentColor={accentColor}>
          <Link
            href={`/components/${item.slug}`}
            className="flex h-full flex-col gap-3 p-6 focus-visible:outline-none"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display text-sm uppercase tracking-[0.18em] text-ink">
                {item.name}
              </span>
              <span className="font-display text-[10px] uppercase tracking-[0.22em] text-ink-mute">
                {item.tier}
              </span>
            </div>
            <p className="font-sans text-xs leading-relaxed text-ink-dim">{item.description}</p>
            <span
              aria-hidden
              className="mt-auto font-display text-[10px] uppercase tracking-[0.22em] text-accent"
            >
              Inspect →
            </span>
          </Link>
        </SpotlightShell>
      ))}
    </div>
  );
}
