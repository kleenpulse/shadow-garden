"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Cinders from "./cinders";

export default function CindersPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  const still = paused || reducedMotion;
  return (
    <div className="relative h-full w-full">
      <Cinders
        emberCount={values.emberCount as number}
        riseSpeed={values.riseSpeed as number}
        turbulence={values.turbulence as number}
        emberSize={values.emberSize as number}
        glow={values.glow as number}
        draftStrength={values.draftStrength as number}
        emberColor={values.emberColor as string}
        backgroundColor={values.backgroundColor as string}
        paused={still}
      />
    </div>
  );
}
