"use client";

import { useEffect, useState } from "react";
import { MarqueeText } from "@/components/registry/marquee-text/MarqueeText";
import PreviewBoundary from "@/components/shell/PreviewBoundary";

const CREED =
  "We operate in the dark · We render in the light · Every parameter accounted for · " +
  "Nothing ships uncalibrated · We operate in the dark · We render in the light · " +
  "Every parameter accounted for · Nothing ships uncalibrated";

// Manifesto band — the registry's own MarqueeText, drifting one creed line.
// Mounted after hydration: MarqueeText seeds its keyframe name with
// Math.random(), which the Cache Components prerender forbids. The animation
// is CSS keyframes, so the global reduced-motion backstop stills it.
export default function ManifestoMarquee() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="flex h-10.5 items-center border-y border-hairline" aria-hidden>
      {mounted ? (
        <PreviewBoundary slug="marquee-text" label="MarqueeText" variant="silent">
          <MarqueeText
            text={CREED}
            speed={28}
            gap={64}
            pause={0}
            className="font-display text-[11px] uppercase tracking-[0.3em] text-ink-mute"
          />
        </PreviewBoundary>
      ) : null}
    </div>
  );
}
