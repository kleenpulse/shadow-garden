"use client";

import type { PreviewProps } from "@/lib/registry/types";
import DotField from "./DotField";

export default function DotFieldPreview({ values, reducedMotion }: PreviewProps) {
  return (
    <DotField
      dotRadius={values.dotRadius as number}
      dotSpacing={values.dotSpacing as number}
      cursorRadius={values.cursorRadius as number}
      cursorForce={values.cursorForce as number}
      bulgeOnly={values.bulgeOnly as boolean}
      bulgeStrength={values.bulgeStrength as number}
      glowRadius={values.glowRadius as number}
      sparkle={reducedMotion ? false : (values.sparkle as boolean)}
      waveAmplitude={reducedMotion ? 0 : (values.waveAmplitude as number)}
      gradientFrom={values.gradientFrom as string}
      gradientTo={values.gradientTo as string}
      glowColor={values.glowColor as string}
    />
  );
}
