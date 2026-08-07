"use client";

import { useEffect, useRef, useState } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import Mirage, { type MirageMode, type MirageTrigger } from "./Mirage";

// Proof the click actually lands. A filtered subtree still hit-tests normally —
// displacement moves pixels, not the boxes the browser tests against — so the
// button reports back rather than asking you to take it on faith.
function ProofButton() {
  const [hit, setHit] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleared on unmount, and on every re-click: a second press inside the window
  // would otherwise let the first timer revert the label early.
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

export default function MiragePreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative flex h-full min-h-80 w-full items-center justify-center p-8">
      <Mirage
        mode={values.mode as MirageMode}
        intensity={values.intensity as number}
        speed={values.speed as number}
        scale={values.scale as number}
        chroma={values.chroma as number}
        trigger={values.trigger as MirageTrigger}
        edgeHold={values.edgeHold as number}
        tintColor={values.tintColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
        className="relative w-full max-w-md"
      >
        <article className="rounded-2xl border border-hairline bg-panel p-6">
          <p className="font-display text-[10px] tracking-[0.32em] text-accent uppercase">
            Still interactive
          </p>
          <h3 className="mt-3 font-display text-2xl text-ink">Heat Haze</h3>
          <p className="mt-3 text-sm leading-relaxed text-ink-dim">
            Nothing here is a snapshot. The text is selectable, the button takes
            focus, and the link is a real link — the displacement is applied to
            the live tree in place.
          </p>
          <div className="mt-5 flex items-center gap-3">
            <ProofButton />
            <a
              href="#mirage"
              className="font-display text-xs tracking-[0.14em] text-ink-dim underline underline-offset-4 uppercase"
            >
              A real link
            </a>
          </div>
        </article>
      </Mirage>
      {reducedMotion ? null : (
        <p className="pointer-events-none absolute right-3 bottom-2 font-display text-[9px] tracking-[0.28em] text-ink-mute uppercase">
          hover — disturb the air
        </p>
      )}
    </div>
  );
}
