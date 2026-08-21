"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Prism from "./prism";

export default function PrismPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full min-h-80 w-full">
      <Prism
        dispersion={values.dispersion as number}
        bands={values.bands as number}
        beamIntensity={values.beamIntensity as number}
        beamColor={values.beamColor as string}
        saturation={values.saturation as number}
        fog={values.fog as number}
        autoRotate={values.autoRotate as boolean}
        rotateSpeed={values.rotateSpeed as number}
        paused={paused}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}
