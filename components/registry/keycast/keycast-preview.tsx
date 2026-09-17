"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Keycast, { type KeycastCorner, type KeycastPlatform } from "./keycast";

export default function KeycastPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full min-h-80 w-full">
      <Keycast
        lifetime={values.lifetime as number}
        maxVisible={values.maxVisible as number}
        corner={values.corner as KeycastCorner}
        combineRepeats={values.combineRepeats as boolean}
        platform={values.platform as KeycastPlatform}
        demo={values.demo as boolean}
        capSize={values.capSize as number}
        accent={values.accent as string}
        paused={paused}
        reducedMotion={reducedMotion}
      />
      <p className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.2em] text-ink-mute uppercase">
        press any keys — the hud reports them
      </p>
    </div>
  );
}
