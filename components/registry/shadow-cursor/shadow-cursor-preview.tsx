"use client";

import type { PreviewProps } from "@/lib/registry/types";
import ShadowCursor from "./shadow-cursor";

export default function ShadowCursorPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full min-h-80 w-full">
      <ShadowCursor
        dotSize={values.dotSize as number}
        trailSize={values.trailSize as number}
        stiffness={values.stiffness as number}
        damping={values.damping as number}
        cursorColor={values.cursorColor as string}
        blendMode={
          values.blendMode as "difference" | "screen" | "exclusion" | "normal"
        }
        poolScale={values.poolScale as number}
        reducedMotion={paused || reducedMotion}
        className="h-full min-h-80 w-full bg-raised"
      >
        <div className="flex h-full min-h-80 flex-col items-center justify-center gap-6 p-10 text-center">
          <h3 className="font-display text-2xl uppercase tracking-widest text-ink">
            Move over the bench
          </h3>
          <p className="max-w-sm font-sans text-sm text-ink-dim">
            The dot leads, the trail lags — and both pool onto anything
            interactive.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <button
              data-cursor-pool
              className="rounded-md border border-hairline bg-panel px-5 py-2.5 font-display text-sm uppercase tracking-wide text-ink transition-colors hover:bg-accent/15"
            >
              Summon
            </button>
            <button
              data-cursor-pool
              className="rounded-md bg-accent px-5 py-2.5 font-display text-sm uppercase tracking-wide text-on-accent"
            >
              Deploy
            </button>
            <a
              data-cursor-pool
              href="#"
              onClick={(e) => e.preventDefault()}
              className="font-display text-sm uppercase tracking-wide text-accent underline underline-offset-4"
            >
              Documentation
            </a>
          </div>
        </div>
      </ShadowCursor>
    </div>
  );
}
