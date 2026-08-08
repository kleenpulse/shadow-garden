"use client";

import type { PreviewProps } from "@/lib/registry/types";
import SakuraTree, { type SakuraWeather } from "./sakura-tree";

export default function SakuraTreePreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <SakuraTree
      windSpeed={values.windSpeed as number}
      fallingPetals={values.fallingPetals as number}
      bloomAmount={values.bloomAmount as number}
      weather={values.weather as SakuraWeather}
      windDirection={values.windDirection as number}
      cameraDistance={values.cameraDistance as number}
      paused={paused || reducedMotion}
    />
  );
}
