"use client";

import type { PreviewProps } from "@/lib/registry/types";
import DotField from "./dot-field";

export default function DotFieldPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  const still = paused || reducedMotion;
  return (
    <DotField
      dotRadius={values.dotRadius as number}
      dotSpacing={values.dotSpacing as number}
      cursorRadius={values.cursorRadius as number}
      cursorForce={values.cursorForce as number}
      bulgeOnly={values.bulgeOnly as boolean}
      bulgeStrength={values.bulgeStrength as number}
      glowRadius={values.glowRadius as number}
      sparkle={still ? false : (values.sparkle as boolean)}
      waveAmplitude={still ? 0 : (values.waveAmplitude as number)}
      gradientFrom={values.gradientFrom as string}
      gradientTo={values.gradientTo as string}
      glowColor={values.glowColor as string}
      paused={still}
    />
  );
}
