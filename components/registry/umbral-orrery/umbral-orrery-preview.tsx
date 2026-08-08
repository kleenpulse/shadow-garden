"use client";

import type { PreviewProps } from "@/lib/registry/types";
import UmbralOrrery from "./umbral-orrery";

export default function UmbralOrreryPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <UmbralOrrery
      moonCount={values.moonCount as number}
      orbitSpeed={values.orbitSpeed as number}
      sunIntensity={values.sunIntensity as number}
      tilt={values.tilt as number}
      planetSize={values.planetSize as number}
      moonSize={values.moonSize as number}
      sunColor={values.sunColor as string}
      glowColor={values.glowColor as string}
      cameraDistance={values.cameraDistance as number}
      background="#05060a"
      paused={paused || reducedMotion}
    />
  );
}
