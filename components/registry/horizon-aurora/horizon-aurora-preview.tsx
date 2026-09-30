"use client";

import type { PreviewProps } from "@/lib/registry/types";
import HorizonAurora from "./horizon-aurora";

export default function HorizonAuroraPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full min-h-80 w-full">
      <HorizonAurora
        position={values.position as "bottom" | "top"}
        horizon={values.horizon as number}
        curvature={values.curvature as number}
        reach={values.reach as number}
        speed={values.speed as number}
        intensity={values.intensity as number}
        pull={values.pull as number}
        coreColor={values.coreColor as string}
        hazeColor={values.hazeColor as string}
        skyColor={values.skyColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}
