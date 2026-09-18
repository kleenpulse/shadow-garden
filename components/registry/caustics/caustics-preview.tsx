"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Caustics from "./caustics";

export default function CausticsPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full w-full">
      <Caustics
        scale={values.scale as number}
        speed={values.speed as number}
        depth={values.depth as number}
        ripple={values.ripple as number}
        refraction={values.refraction as number}
        brightness={values.brightness as number}
        pointerInfluence={values.pointerInfluence as number}
        inkColor={values.inkColor as string}
        glowColor={values.glowColor as string}
        backgroundColor={values.backgroundColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
      />
      {reducedMotion ? null : (
        <p className="pointer-events-none absolute right-3 bottom-2 font-display text-[9px] tracking-[0.28em] text-ink-mute uppercase">
          move — push the water
        </p>
      )}
    </div>
  );
}
