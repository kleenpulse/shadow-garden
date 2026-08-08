"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Quicksilver from "./quicksilver";

export default function QuicksilverPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full min-h-80 w-full">
      <Quicksilver
        flowSpeed={values.flowSpeed as number}
        warp={values.warp as number}
        stir={values.stir as number}
        viscosity={values.viscosity as number}
        fresnel={values.fresnel as number}
        iridescence={values.iridescence as number}
        roughness={values.roughness as number}
        tint={values.tint as string}
        sheenColor={values.sheenColor as string}
        backgroundColor={values.backgroundColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
      />
      {reducedMotion ? null : (
        <p className="pointer-events-none absolute right-3 bottom-2 font-display text-[9px] tracking-[0.28em] text-ink-mute uppercase">
          drag — stir the metal
        </p>
      )}
    </div>
  );
}
