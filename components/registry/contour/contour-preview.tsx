"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Contour from "./contour";

export default function ContourPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full min-h-80 w-full">
      <Contour
        scale={values.scale as number}
        levels={values.levels as number}
        warp={values.warp as number}
        drift={values.drift as number}
        lineWidth={values.lineWidth as number}
        majorEvery={values.majorEvery as number}
        bandOpacity={values.bandOpacity as number}
        pointerLift={values.pointerLift as number}
        inkColor={values.inkColor as string}
        accentColor={values.accentColor as string}
        backgroundColor={values.backgroundColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
      />
      {reducedMotion ? null : (
        <p className="pointer-events-none absolute right-3 bottom-2 font-display text-[9px] tracking-[0.28em] text-ink-mute uppercase">
          move — raise the ground
        </p>
      )}
    </div>
  );
}
