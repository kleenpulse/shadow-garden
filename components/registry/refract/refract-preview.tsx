"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Refract from "./refract";

export default function RefractPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full min-h-80 w-full">
      <Refract
        ior={values.ior as number}
        dispersion={values.dispersion as number}
        frost={values.frost as number}
        edgeWidth={values.edgeWidth as number}
        glare={values.glare as number}
        slabWidth={values.slabWidth as number}
        scene={values.scene as "blobs" | "stripes" | "checker"}
        tint={values.tint as string}
        paused={paused}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}
