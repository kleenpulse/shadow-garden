"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Waves from "./Waves";

export default function WavesPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <Waves
      color={values.color as string}
      amplitude={values.amplitude as number}
      distance={values.distance as number}
      saturation={values.saturation as number}
      opacity={values.opacity as number}
      enableMouseInteraction={values.enableMouseInteraction as boolean}
      paused={paused || reducedMotion}
    />
  );
}
