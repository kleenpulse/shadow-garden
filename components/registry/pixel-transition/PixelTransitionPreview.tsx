"use client";

import type { PreviewProps } from "@/lib/registry/types";
import PixelTransition from "./PixelTransition";

export default function PixelTransitionPreview({ values }: PreviewProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <PixelTransition
        className="h-56 w-56 overflow-hidden rounded-lg border border-hairline"
        gridSize={values.gridSize as number}
        pixelColor={values.pixelColor as string}
        animationStepDuration={values.animationStepDuration as number}
        once={values.once as boolean}
        firstContent={
          <div className="flex h-full w-full items-center justify-center bg-panel font-display text-sm uppercase tracking-widest text-ink-dim">
            Hover me
          </div>
        }
        secondContent={
          <div className="flex h-full w-full items-center justify-center bg-accent font-display text-sm uppercase tracking-widest text-on-accent">
            Shadow Garden
          </div>
        }
      />
    </div>
  );
}
