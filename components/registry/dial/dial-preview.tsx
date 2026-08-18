"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Dial, { type DialTicks } from "./dial";

export default function DialPreview({ values, reducedMotion }: PreviewProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-7 px-8">
      <Dial
        detents={values.detents as number}
        sweep={values.sweep as number}
        stiffness={values.stiffness as number}
        damping={values.damping as number}
        inertia={values.inertia as number}
        detentPull={values.detentPull as number}
        ticks={values.ticks as DialTicks}
        readout={values.readout as boolean}
        accent={values.accent as string}
        size={values.size as number}
        reducedMotion={reducedMotion}
      />
      <p className="font-display text-[10px] tracking-[0.28em] text-ink-mute uppercase">
        drag to turn · flick for inertia · arrows step the detents
      </p>
    </div>
  );
}
