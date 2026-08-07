"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Holofoil, {
  type HolofoilBlend,
  type HolofoilPattern,
} from "./Holofoil";

export default function HolofoilPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative flex h-full min-h-80 w-full items-center justify-center p-8">
      <Holofoil
        maxTilt={values.maxTilt as number}
        perspective={values.perspective as number}
        foil={values.foil as HolofoilPattern}
        foilIntensity={values.foilIntensity as number}
        sparkle={values.sparkle as number}
        glare={values.glare as number}
        idleDrift={values.idleDrift as number}
        settle={values.settle as number}
        blendMode={values.blendMode as HolofoilBlend}
        sheenColor={values.sheenColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
      >
        <article className="h-80 w-56 bg-gradient-to-b from-bench-800 to-bench-900 p-5">
          <p className="font-display text-[10px] tracking-[0.32em] text-accent uppercase">
            Shadow Garden
          </p>
          <h3 className="mt-4 font-display text-2xl leading-tight text-ink">
            Shadow
          </h3>
          <p className="mt-1 font-display text-[10px] tracking-[0.24em] text-ink-mute uppercase">
            Eminence · VII
          </p>
          <div className="mt-5 h-28 rounded-lg border border-hairline bg-bench-950/60" />
          <p className="mt-4 text-[11px] leading-relaxed text-ink-dim">
            Moves unseen until the moment it must not.
          </p>
          <p className="mt-3 font-display text-[9px] tracking-[0.2em] text-ink-mute">
            001 / 777
          </p>
        </article>
      </Holofoil>
      {reducedMotion ? null : (
        <p className="pointer-events-none absolute right-3 bottom-2 font-display text-[9px] tracking-[0.28em] text-ink-mute uppercase">
          hover — tilt the card
        </p>
      )}
    </div>
  );
}
