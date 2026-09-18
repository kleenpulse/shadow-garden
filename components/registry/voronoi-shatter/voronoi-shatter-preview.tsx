"use client";

import type { PreviewProps } from "@/lib/registry/types";
import VoronoiShatter from "./voronoi-shatter";

export default function VoronoiShatterPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full w-full">
      <VoronoiShatter
        density={values.density as number}
        drift={values.drift as number}
        seamWidth={values.seamWidth as number}
        seamGlow={values.seamGlow as number}
        shatter={values.shatter as number}
        shatterRadius={values.shatterRadius as number}
        cellContrast={values.cellContrast as number}
        seamColor={values.seamColor as string}
        cellColor={values.cellColor as string}
        backgroundColor={values.backgroundColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
      />
      {reducedMotion ? null : (
        <p className="pointer-events-none absolute right-3 bottom-2 font-display text-[9px] tracking-[0.28em] text-ink-mute uppercase">
          move — fracture the field
        </p>
      )}
    </div>
  );
}
