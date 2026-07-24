"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Shadowflame from "./Shadowflame";

export default function ShadowflamePreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <Shadowflame
      coreColor={values.coreColor as string}
      flameColor={values.flameColor as string}
      backgroundColor={values.backgroundColor as string}
      speed={values.speed as number}
      warp={values.warp as number}
      detail={values.detail as number}
      shimmer={values.shimmer as number}
      height={values.height as number}
      grain={values.grain as number}
      flameWidth={values.flameWidth as number}
      sparkCount={values.sparkCount as number}
      sparkSize={values.sparkSize as number}
      sparkSpeed={values.sparkSpeed as number}
      paused={paused || reducedMotion}
      reducedMotion={reducedMotion}
    />
  );
}
