"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Weave, { type WeavePin, type WeaveShading } from "./weave";

export default function WeavePreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full w-full">
      <Weave
        cols={values.cols as number}
        rows={values.rows as number}
        iterations={values.iterations as number}
        gravity={values.gravity as number}
        wind={values.wind as number}
        stiffness={values.stiffness as number}
        damping={values.damping as number}
        tearThreshold={values.tearThreshold as number}
        pinMode={values.pinMode as WeavePin}
        shading={values.shading as WeaveShading}
        tint={values.tint as string}
        strainColor={values.strainColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
      />

      <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center font-display text-[10px] tracking-[0.28em] text-ink-mute uppercase">
        drag the sheet · pull until it tears
      </p>
    </div>
  );
}
