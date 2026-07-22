"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Aurora from "./Aurora";

export default function AuroraPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full min-h-80 w-full">
      <Aurora
        baseColor={values.baseColor as string}
        auroraColor={values.auroraColor as string}
        auroraColor2={values.auroraColor2 as string}
        speed={values.speed as number}
        intensity={values.intensity as number}
        bands={values.bands as number}
        warp={values.warp as number}
        coverage={values.coverage as number}
        grain={values.grain as number}
        paused={paused || reducedMotion}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}
