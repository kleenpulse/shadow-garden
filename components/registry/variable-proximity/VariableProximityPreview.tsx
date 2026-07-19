"use client";

import { useRef } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import VariableProximity from "./VariableProximity";

type Falloff = "linear" | "exponential" | "gaussian";

export default function VariableProximityPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center p-8"
    >
      <VariableProximity
        label="Move your cursor near the Shadow Garden"
        fromFontVariationSettings="'wght' 100"
        toFontVariationSettings="'wght' 900"
        containerRef={containerRef}
        radius={values.radius as number}
        falloff={values.falloff as Falloff}
        paused={paused || reducedMotion}
        className="max-w-md text-center text-3xl text-ink sm:text-4xl"
        style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
      />
    </div>
  );
}
