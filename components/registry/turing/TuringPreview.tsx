"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Turing, { type TuringGrid, type TuringSeed } from "./Turing";

export default function TuringPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full min-h-80 w-full">
      <Turing
        feed={values.feed as number}
        kill={values.kill as number}
        diffusion={values.diffusion as number}
        steps={values.steps as number}
        gridSize={values.gridSize as TuringGrid}
        seed={values.seed as TuringSeed}
        brush={values.brush as number}
        sharpness={values.sharpness as number}
        colorLow={values.colorLow as string}
        colorHigh={values.colorHigh as string}
        paused={paused}
        reducedMotion={reducedMotion}
      />
      {reducedMotion ? null : (
        <p className="pointer-events-none absolute right-3 bottom-2 font-display text-[9px] tracking-[0.28em] text-ink-mute uppercase">
          move — inoculate the plate
        </p>
      )}
    </div>
  );
}
