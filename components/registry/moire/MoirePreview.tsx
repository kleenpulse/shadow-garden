"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Moire from "./Moire";

export default function MoirePreview({ values, reducedMotion, paused }: PreviewProps) {
  return (
    <div className="relative h-full w-full">
      <Moire
        lattice={values.lattice as "lines" | "grid" | "dots" | "rings"}
        pitch={values.pitch as number}
        angle={values.angle as number}
        drift={values.drift as number}
        separation={values.separation as number}
        thickness={values.thickness as number}
        contrast={values.contrast as number}
        pointerInfluence={values.pointerInfluence as number}
        inkColor={values.inkColor as string}
        backgroundColor={values.backgroundColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
      />
      {reducedMotion ? null : (
        <p className="pointer-events-none absolute right-3 bottom-2 font-display text-[9px] tracking-[0.28em] text-ink-mute uppercase">
          move — twist the lattice
        </p>
      )}
    </div>
  );
}
