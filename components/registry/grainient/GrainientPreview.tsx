"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Grainient from "./Grainient";

export default function GrainientPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  const still = paused || reducedMotion;
  return (
    <Grainient
      timeSpeed={still ? 0 : (values.timeSpeed as number)}
      warpStrength={values.warpStrength as number}
      warpFrequency={values.warpFrequency as number}
      warpSpeed={still ? 0 : 1}
      blendSoftness={values.blendSoftness as number}
      noiseScale={values.noiseScale as number}
      grainAmount={values.grainAmount as number}
      contrast={values.contrast as number}
      saturation={values.saturation as number}
      zoom={values.zoom as number}
      color1={values.color1 as string}
      color2={values.color2 as string}
      color3={values.color3 as string}
      paused={still}
    />
  );
}
