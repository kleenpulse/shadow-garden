"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Lever, { type LeverOrientation } from "./lever";

export default function LeverPreview({ values, reducedMotion }: PreviewProps) {
  return (
    <div className="flex h-full min-h-80 w-full flex-col items-center justify-center gap-6">
      <Lever
        orientation={values.orientation as LeverOrientation}
        stiffness={values.stiffness as number}
        damping={values.damping as number}
        threshold={values.threshold as number}
        resistance={values.resistance as number}
        led={values.led as boolean}
        labels={values.labels as boolean}
        accent={values.accent as string}
        size={values.size as number}
        reducedMotion={reducedMotion}
      />
      <p className="pointer-events-none font-mono text-[10px] tracking-[0.2em] text-ink-mute uppercase">
        drag past the notch · flick to slam · space toggles
      </p>
    </div>
  );
}
