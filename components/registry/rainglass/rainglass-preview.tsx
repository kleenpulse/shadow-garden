"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Rainglass from "./rainglass";

export default function RainglassPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <Rainglass
      intensity={values.intensity as number}
      dropScale={values.dropScale as number}
      speed={values.speed as number}
      wander={values.wander as number}
      refraction={values.refraction as number}
      fog={values.fog as number}
      layers={values.layers as number}
      blur={values.blur as number}
      tintTop={values.tintTop as string}
      tintBottom={values.tintBottom as string}
      glow={values.glow as string}
      paused={paused}
      reducedMotion={reducedMotion}
    />
  );
}
