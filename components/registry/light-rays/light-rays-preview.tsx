"use client";

import type { PreviewProps } from "@/lib/registry/types";
import LightRays from "./light-rays";

export default function LightRaysPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  const still = paused || reducedMotion;
  return (
    <LightRays
      raysColor={values.raysColor as string}
      raysSpeed={still ? 0 : (values.raysSpeed as number)}
      lightSpread={values.lightSpread as number}
      rayLength={values.rayLength as number}
      pulsating={still ? false : (values.pulsating as boolean)}
      fadeDistance={values.fadeDistance as number}
      saturation={values.saturation as number}
      followMouse={values.followMouse as boolean}
      mouseInfluence={values.mouseInfluence as number}
      noiseAmount={values.noiseAmount as number}
      distortion={values.distortion as number}
    />
  );
}
