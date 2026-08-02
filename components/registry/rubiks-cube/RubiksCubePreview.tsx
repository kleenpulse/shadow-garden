"use client";

import type { PreviewProps } from "@/lib/registry/types";
import RubiksCube, { type CubePalette } from "./RubiksCube";

export default function RubiksCubePreview({ values, reducedMotion, paused }: PreviewProps) {
  return (
    <div className="relative h-full w-full">
      <RubiksCube
        autoRotate={values.autoRotate as boolean}
        rotationSpeed={values.rotationSpeed as number}
        moveDuration={values.moveDuration as number}
        scrambleMoveCount={values.scrambleMoveCount as number}
        pauseBetweenCycles={values.pauseBetweenCycles as number}
        cameraDistance={values.cameraDistance as number}
        gap={values.gap as number}
        palette={values.palette as CubePalette}
        bodyColor={values.bodyColor as string}
        background={values.background as string}
        glossy={values.glossy as boolean}
        glow={values.glow as boolean}
        paused={paused}
        reducedMotion={reducedMotion}
      />
      {reducedMotion ? null : (
        <p className="pointer-events-none absolute right-3 bottom-2 font-display text-[9px] tracking-[0.28em] text-ink-mute uppercase">
          drag — orbit, re-aim the spin
        </p>
      )}
    </div>
  );
}
