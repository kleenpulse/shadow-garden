"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Threads from "./Threads";

export default function ThreadsPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <Threads
      color={values.color as string}
      amplitude={values.amplitude as number}
      distance={values.distance as number}
      saturation={values.saturation as number}
      opacity={values.opacity as number}
      enableMouseInteraction={values.enableMouseInteraction as boolean}
      paused={paused || reducedMotion}
    />
  );
}
