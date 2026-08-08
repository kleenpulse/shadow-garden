"use client";

import { useRef } from "react";
import Link from "next/link";
import { useReducedMotion } from "motion/react";
import type { ComponentEntry, PropSchema } from "@/lib/registry/types";
import { defaultsFromSchema } from "@/lib/registry";
import { displayName } from "@/lib/display-name";
import { previews } from "@/components/registry/previews";
import PreviewBoundary from "./PreviewBoundary";
import FavoriteButton from "./FavoriteButton";
import { useThumbnailSlot } from "./thumbnail-slots";

type ColorProp = Extract<PropSchema, { kind: "color" }>;

function firstColor(entry: ComponentEntry): string | undefined {
  const color = entry.props.find((p): p is ColorProp => p.kind === "color");
  return color?.default;
}

export default function FavoriteThumbnailCard({
  entry,
}: {
  entry: ComponentEntry;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const hasSlot = useThumbnailSlot(entry.slug, cardRef);
  const reduced = useReducedMotion();
  const Preview = previews[entry.slug];
  // Live only when granted a slot, motion is allowed, and a preview exists.
  const showLive = hasSlot && !reduced && Boolean(Preview);
  const href = `/components/${entry.slug}`;
  const tint = firstColor(entry);

  return (
    <article
      ref={cardRef}
      className="group relative flex flex-col overflow-hidden rounded-lg border border-hairline bg-panel transition-colors hover:border-accent-muted"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-raised">
        {showLive ? (
          <div className="pointer-events-none absolute inset-0">
            <PreviewBoundary
              slug={entry.slug}
              label={entry.name}
              variant="inline"
              showRetry={false}
            >
              <Preview
                values={defaultsFromSchema(entry.props)}
                reducedMotion={Boolean(reduced)}
                paused={false}
              />
            </PreviewBoundary>
          </div>
        ) : (
          <div
            aria-hidden
            className="absolute inset-0"
            style={
              tint
                ? {
                    background: `radial-gradient(120% 100% at 30% 0%, ${tint}22, transparent 70%)`,
                  }
                : undefined
            }
          >
            <span className="absolute bottom-2 left-3 font-mono text-[10px] uppercase tracking-widest text-ink-mute">
              {reduced ? "static" : "preview"}
            </span>
          </div>
        )}

        {/* Link overlay covers the thumbnail; the heart sits above it. */}
        <Link
          href={href}
          aria-label={`Open ${entry.name}`}
          className="absolute inset-0 z-0"
        />
        <FavoriteButton
          slug={entry.slug}
          name={entry.name}
          className="absolute right-2 top-2 z-10 border border-hairline bg-surface/70 backdrop-blur"
        />
      </div>

      <div className="flex items-start justify-between gap-2 p-3">
        <div className="min-w-0">
          <Link
            href={href}
            className="font-display text-sm uppercase tracking-[0.08em] text-ink transition-colors hover:text-accent"
          >
            {displayName(entry.name)}
          </Link>
          <p className="mt-1 line-clamp-2 font-sans text-xs leading-relaxed text-ink-dim">
            {entry.description}
          </p>
        </div>
      </div>
    </article>
  );
}
