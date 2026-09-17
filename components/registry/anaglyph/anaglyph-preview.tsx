"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Anaglyph, { type AnaglyphBlend, type AnaglyphLayers } from "./anaglyph";

export default function AnaglyphPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="flex h-full min-h-80 w-full flex-col items-center justify-center gap-6">
      <Anaglyph
        text="ANAGLYPH"
        maxShift={values.maxShift as number}
        response={values.response as number}
        lag={values.lag as number}
        sway={values.sway as number}
        layers={values.layers as AnaglyphLayers}
        blend={values.blend as AnaglyphBlend}
        channelA={values.channelA as string}
        channelB={values.channelB as string}
        paused={paused}
        reducedMotion={reducedMotion}
        className="font-display text-5xl font-bold tracking-tight text-ink sm:text-7xl"
      />
      <p className="pointer-events-none font-mono text-[10px] tracking-[0.2em] text-ink-mute uppercase">
        move the cursor across the type
      </p>
    </div>
  );
}
