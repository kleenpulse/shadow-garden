"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Lens from "./Lens";

export default function LensPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full min-h-80 w-full">
      <Lens
        size={values.size as number}
        refraction={values.refraction as number}
        edgeThickness={values.edgeThickness as number}
        blur={values.blur as number}
        chromatic={values.chromatic as number}
        magnify={values.magnify as number}
        shimmer={values.shimmer as number}
        friction={values.friction as number}
        bounded={values.bounded as boolean}
        rimColor={values.rimColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
      >
        {/* The glass magnifies the children it is handed and nothing else, so
            the demo panel has to reach every corner of whatever it is mounted
            in — `justify-between` and a filling middle row. A column that
            stacks at the top leaves the lens sweeping flat surface colour for
            most of its travel, which reads as broken glass rather than as an
            empty page. It matters most unbounded and on `/full`, where the
            panel IS the viewport. */}
        <div className="flex h-full w-full flex-col justify-between gap-5 overflow-hidden bg-surface p-8">
          <div className="flex flex-col gap-5">
            <p className="font-display text-[10px] tracking-[0.32em] text-accent uppercase">
              Shadow Garden
            </p>
            <h2 className="font-display text-4xl leading-tight text-ink">
              Those who chase the shadows
            </h2>
            <p className="max-w-3xl text-sm leading-relaxed text-ink-dim">
              Drag the glass anywhere across this panel. The text underneath is
              a real text node — select it, search it, read it with a screen
              reader. What the lens bends is a live duplicate rather than a
              screenshot, which is why it stays sharp at any size and keeps up
              with every change you make to the content behind it.
            </p>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Shadow"].map(
              (n) => (
                <div
                  key={n}
                  className="rounded-lg border border-hairline bg-panel px-3 py-4 text-center font-display text-[11px] tracking-[0.18em] text-ink-dim uppercase"
                >
                  {n}
                </div>
              ),
            )}
          </div>

          {/* `min-h-0` on a flex child is what stops the row below from being
              overlapped: without it a grid refuses to shrink past its content
              and `justify-between` distributes the negative free space by
              letting the items run into each other. */}
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-hidden sm:grid-cols-3">
            {[
              ["Refraction", "displacement, not a tint"],
              ["Dispersion", "three passes, three scales"],
              ["Bevel", "the last fifth of the radius"],
              ["Magnification", "a transform, so it stays sharp"],
              ["Momentum", "friction applied per second"],
              ["Bounds", "its container, or the viewport"],
            ].map(([term, gloss]) => (
              <div
                key={term}
                className="flex min-h-0 flex-col justify-center gap-2 overflow-hidden rounded-lg border border-hairline bg-panel/60 px-4 py-3"
              >
                <p className="font-display text-[10px] tracking-[0.22em] text-accent uppercase">
                  {term}
                </p>
                <p className="text-xs leading-relaxed text-ink-mute">{gloss}</p>
              </div>
            ))}
          </div>

          <p className="max-w-3xl text-sm leading-relaxed text-ink-dim">
            The bevel does all of the bending, so the middle of the disc stays
            legible and only the rim distorts — which is how a real lens behaves,
            and the difference between glass and a smudge.
          </p>
        </div>
      </Lens>
      {reducedMotion ? null : (
        <p className="pointer-events-none absolute right-3 bottom-2 font-display text-[9px] tracking-[0.28em] text-ink-mute uppercase">
          drag the glass
        </p>
      )}
    </div>
  );
}
