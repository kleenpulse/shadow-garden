"use client";

import type { PreviewProps } from "@/lib/registry/types";
import { AnimatedNumber, type AnimationType } from "./AnimatedNumber";

export default function AnimatedNumberPreview({ values, reducedMotion }: PreviewProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6 font-display text-6xl text-ink sm:text-8xl">
      <AnimatedNumber
        value={Math.round(values.value as number)}
        animationType={values.animationType as AnimationType}
        duration={reducedMotion ? 0 : (values.duration as number)}
      />
    </div>
  );
}
