"use client";

import { useEffect, useRef, useState } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import Submerge from "./Submerge";

// Proof the click still lands under water. A filtered subtree hit-tests against
// its undisplaced boxes — displacement moves pixels, not the geometry the
// browser tests — so the button reports back rather than asking to be believed.
function ProofButton() {
  const [hit, setHit] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <button
      type="button"
      aria-live="polite"
      onClick={() => {
        setHit(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setHit(false), 2000);
      }}
      className="rounded-lg bg-accent px-4 py-2 font-display text-xs tracking-[0.14em] text-on-accent uppercase"
    >
      {hit ? "Garden" : "Press me"}
    </button>
  );
}

export default function SubmergePreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full min-h-80 w-full">
      {/* The whole stage is the pool, not a wet rectangle floating in a dry one.
          The card sits well inside it, so the edge taper protects the
          container's boundary while the card is far enough from that boundary to
          be bent freely — its own outline never meets the filter's edge, which
          is what drew a hard frame around it before. */}
      <Submerge
        depth={values.depth as number}
        flow={values.flow as number}
        turbulence={values.turbulence as number}
        rippleForce={values.rippleForce as number}
        rippleSpread={values.rippleSpread as number}
        settle={values.settle as number}
        edgeHold={values.edgeHold as number}
        waterColor={values.waterColor as string}
        deepColor={values.deepColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
        className="absolute inset-0 isolate touch-none overflow-hidden select-none"
      >
        <div className="flex h-full w-full items-center justify-center p-10">
          <article className="w-full max-w-md rounded-2xl border border-hairline bg-panel p-6">
          <p className="font-display text-[10px] tracking-[0.32em] text-accent uppercase">
            Still interactive
          </p>
          <h3 className="mt-3 font-display text-2xl text-ink">Held Under</h3>
          <p className="mt-3 text-sm leading-relaxed text-ink-dim">
            Nothing here is a snapshot. Move across the surface and the wake
            spreads; the text stays selectable and the button still answers.
          </p>
          <div className="mt-5 flex items-center gap-3">
            <ProofButton />
            <a
              href="#submerge"
              className="font-display text-xs tracking-[0.14em] text-ink-dim underline underline-offset-4 uppercase"
            >
              A real link
            </a>
            </div>
          </article>
        </div>
      </Submerge>
      {reducedMotion ? null : (
        <p className="pointer-events-none absolute right-3 bottom-2 font-display text-[9px] tracking-[0.28em] text-ink-mute uppercase">
          move — break the surface
        </p>
      )}
    </div>
  );
}
