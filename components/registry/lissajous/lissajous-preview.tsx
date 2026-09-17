"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Lissajous from "./lissajous";

export default function LissajousPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full min-h-80 w-full">
      <Lissajous
        speed={values.speed as number}
        persistence={values.persistence as number}
        dwell={values.dwell as number}
        morphSeconds={values.morphSeconds as number}
        beamWidth={values.beamWidth as number}
        glow={values.glow as number}
        showGraticule={values.showGraticule as boolean}
        phosphorColor={values.phosphorColor as string}
        backgroundColor={values.backgroundColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}
