"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Stipple from "./stipple";

export default function StipplePreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full min-h-80 w-full">
      <Stipple
        algorithm={values.algorithm as "atkinson" | "floyd-steinberg" | "sierra"}
        pixelSize={values.pixelSize as number}
        fieldScale={values.fieldScale as number}
        speed={values.speed as number}
        contrast={values.contrast as number}
        serpentine={values.serpentine as boolean}
        ink={values.ink as string}
        paper={values.paper as string}
        paused={paused}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}
