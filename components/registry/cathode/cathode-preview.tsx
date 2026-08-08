"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Cathode, { type CathodeSignal } from "./cathode";

export default function CathodePreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full min-h-80 w-full">
      <Cathode
        signal={values.signal as CathodeSignal}
        sweepSpeed={values.sweepSpeed as number}
        scanlineDensity={values.scanlineDensity as number}
        scanlineDepth={values.scanlineDepth as number}
        curvature={values.curvature as number}
        bloom={values.bloom as number}
        persistence={values.persistence as number}
        rollSpeed={values.rollSpeed as number}
        chromaOffset={values.chromaOffset as number}
        phosphorColor={values.phosphorColor as string}
        backgroundColor={values.backgroundColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
      />
      {reducedMotion ? null : (
        <p className="pointer-events-none absolute right-3 bottom-2 font-display text-[9px] tracking-[0.28em] text-ink-mute uppercase">
          the beam turns around
        </p>
      )}
    </div>
  );
}
