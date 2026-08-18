"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Contour from "./contour";

export default function ContourPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <Contour
      levels={values.levels as number}
      cellSize={values.cellSize as number}
      speed={values.speed as number}
      warp={values.warp as number}
      cursorRadius={values.cursorRadius as number}
      cursorStrength={values.cursorStrength as number}
      indexEvery={values.indexEvery as number}
      lineWidth={values.lineWidth as number}
      lineColor={values.lineColor as string}
      indexColor={values.indexColor as string}
      background={values.background as string}
      paused={paused}
      reducedMotion={reducedMotion}
    />
  );
}
