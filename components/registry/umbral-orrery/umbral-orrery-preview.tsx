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
      tilt={values.tilt as number}
      moonSize={values.moonSize as number}
      sunSize={values.sunSize as number}
      sunIntensity={values.sunIntensity as number}
      atmosphere={values.atmosphere as number}
      trails={values.trails as number}
      drift={values.drift as number}
      zoom={values.zoom as number}
      sunColor={values.sunColor as string}
      glowColor={values.glowColor as string}
      planetColor={values.planetColor as string}
      backgroundColor={values.backgroundColor as string}
      paused={paused || reducedMotion}
    />
  );
}
