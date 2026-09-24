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
        scanRate={values.scanRate as number}
        persistence={values.persistence as number}
        scanlineDensity={values.scanlineDensity as number}
        scanlineDepth={values.scanlineDepth as number}
        curvature={values.curvature as number}
        bloom={values.bloom as number}
        rollSpeed={values.rollSpeed as number}
        chromaOffset={values.chromaOffset as number}
        phosphorColor={values.phosphorColor as string}
        backgroundColor={values.backgroundColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}
