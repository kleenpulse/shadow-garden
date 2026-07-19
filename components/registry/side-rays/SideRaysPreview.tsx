"use client";

import type { PreviewProps } from "@/lib/registry/types";
import SideRays from "./SideRays";

export default function SideRaysPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  const still = paused || reducedMotion;
  return (
    <SideRays
      speed={still ? 0 : (values.speed as number)}
      rayColor1={values.rayColor1 as string}
      rayColor2={values.rayColor2 as string}
      intensity={values.intensity as number}
      spread={values.spread as number}
      tilt={values.tilt as number}
      saturation={values.saturation as number}
      blend={values.blend as number}
      falloff={values.falloff as number}
      opacity={values.opacity as number}
      paused={still}
    />
  );
}
