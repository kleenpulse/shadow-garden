"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Ribbons from "./Ribbons";

type VerticalPosition = "top" | "middle" | "bottom" | "random";

export default function RibbonsPreview({ values, reducedMotion }: PreviewProps) {
  return (
    <Ribbons
      color={values.color as string}
      colorSaturation="70%"
      colorBrightness="60%"
      colorAlpha={values.colorAlpha as number}
      colorCycleSpeed={0}
      verticalPosition={values.verticalPosition as VerticalPosition}
      horizontalSpeed={reducedMotion ? 0 : (values.horizontalSpeed as number)}
      ribbonCount={values.ribbonCount as number}
      strokeSize={values.strokeSize as number}
      parallaxAmount={values.parallaxAmount as number}
      animateSections={reducedMotion ? false : (values.animateSections as boolean)}
    />
  );
}
