"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Dither, { type DitherField, type DitherPattern } from "./dither";

export default function DitherPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full min-h-80 w-full">
      <Dither
        pattern={values.pattern as DitherPattern}
        levels={values.levels as number}
        pixelSize={values.pixelSize as number}
        field={values.field as DitherField}
        fieldSpeed={values.fieldSpeed as number}
        fieldScale={values.fieldScale as number}
        frameHold={values.frameHold as number}
        contrast={values.contrast as number}
        inkColor={values.inkColor as string}
        paperColor={values.paperColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
      />
      <p className="pointer-events-none absolute right-3 bottom-2 font-display text-[9px] tracking-[0.28em] text-ink-mute uppercase">
        {values.levels === 2 ? "one bit" : `${values.levels} tones`}
      </p>
    </div>
  );
}
