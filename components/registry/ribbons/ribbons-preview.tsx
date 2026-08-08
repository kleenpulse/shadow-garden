"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Ribbons from "./ribbons";

type VerticalPosition = "top" | "middle" | "bottom" | "random";

export default function RibbonsPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  const still = paused || reducedMotion;
  return (
    <Ribbons
      color={values.color as string}
      colorSaturation="60%"
      colorBrightness="50%"
      colorAlpha={values.colorAlpha as number}
      colorCycleSpeed={4}
      verticalPosition={values.verticalPosition as VerticalPosition}
      horizontalSpeed={still ? 0 : (values.horizontalSpeed as number)}
      ribbonCount={values.ribbonCount as number}
      strokeSize={values.strokeSize as number}
      parallaxAmount={values.parallaxAmount as number}
      animateSections={still ? false : (values.animateSections as boolean)}
      paused={still}
    />
  );
}
