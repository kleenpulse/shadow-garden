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
        <div className="flex h-full w-full flex-col gap-5 bg-surface p-8">
          <p className="font-display text-[10px] tracking-[0.32em] text-accent uppercase">
            Shadow Garden
          </p>
          <h2 className="font-display text-4xl leading-tight text-ink">
            Those who chase the shadows
          </h2>
          <p className="text-sm leading-relaxed text-ink-dim">
            Drag the glass anywhere across this panel. The text underneath is a
            real text node — select it, search it, read it with a screen reader.
            What the lens bends is a live duplicate rather than a screenshot,
            which is why it stays sharp at any size and keeps up with every
            change you make to the content behind it.
          </p>
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
          <p className="text-sm leading-relaxed text-ink-dim">
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
