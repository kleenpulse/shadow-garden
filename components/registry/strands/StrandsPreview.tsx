"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Strands from "./Strands";

const STRAND_COLORS = ["#a855f7", "#6d28d9", "#22d3ee"];

export default function StrandsPreview({ values, reducedMotion }: PreviewProps) {
  return (
    <Strands
      colors={STRAND_COLORS}
      count={values.count as number}
      speed={reducedMotion ? 0 : (values.speed as number)}
      amplitude={values.amplitude as number}
      waviness={values.waviness as number}
      thickness={values.thickness as number}
      glow={values.glow as number}
      spread={values.spread as number}
      intensity={values.intensity as number}
      saturation={values.saturation as number}
      opacity={values.opacity as number}
      glass={values.glass as boolean}
      refraction={values.refraction as number}
      dispersion={values.dispersion as number}
    />
  );
}
