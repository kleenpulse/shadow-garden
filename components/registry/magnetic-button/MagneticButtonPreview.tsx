"use client";

import type { PreviewProps } from "@/lib/registry/types";
import MagneticButton from "./MagneticButton";

const LABEL = "Enter the Garden";

export default function MagneticButtonPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="flex h-full min-h-80 w-full items-center justify-center p-8">
      <MagneticButton
        pullStrength={values.pullStrength as number}
        radius={values.radius as number}
        stiffness={values.stiffness as number}
        damping={values.damping as number}
        auraColor={values.auraColor as string}
        auraSize={values.auraSize as number}
        ripple={values.ripple as boolean}
        rippleColor={values.rippleColor as string}
        reducedMotion={paused || reducedMotion}
      >
        {LABEL}
      </MagneticButton>
    </div>
  );
}
