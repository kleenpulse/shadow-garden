"use client";

import type { PreviewProps } from "@/lib/registry/types";
import LightRays from "./LightRays";

export default function LightRaysPreview({ values, reducedMotion }: PreviewProps) {
  return (
    <LightRays
      raysColor={values.raysColor as string}
      raysSpeed={reducedMotion ? 0 : (values.raysSpeed as number)}
      lightSpread={values.lightSpread as number}
      rayLength={values.rayLength as number}
      pulsating={reducedMotion ? false : (values.pulsating as boolean)}
      fadeDistance={values.fadeDistance as number}
      saturation={values.saturation as number}
      followMouse={values.followMouse as boolean}
      mouseInfluence={values.mouseInfluence as number}
      noiseAmount={values.noiseAmount as number}
      distortion={values.distortion as number}
    />
  );
}
