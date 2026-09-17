"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Patchbay from "./patchbay";

export default function PatchbayPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full min-h-80 w-full">
      <Patchbay
        droop={values.droop as number}
        wobble={values.wobble as number}
        pulseSpeed={values.pulseSpeed as number}
        pulseCount={values.pulseCount as number}
        cableWidth={values.cableWidth as number}
        showLabels={values.showLabels as boolean}
        cableColor={values.cableColor as string}
        pulseColor={values.pulseColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
      />
      <p className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.2em] text-ink-mute uppercase">
        drag a cable between the banks
      </p>
    </div>
  );
}
