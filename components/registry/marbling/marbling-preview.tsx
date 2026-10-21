"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Marbling from "./marbling";

export default function MarblingPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full w-full">
      <Marbling
        dropInterval={values.dropInterval as number}
        dropSize={values.dropSize as number}
        combStrength={values.combStrength as number}
        tineSpacing={values.tineSpacing as number}
        sharpness={values.sharpness as number}
        stylus={values.stylus as boolean}
        inkColor1={values.inkColor1 as string}
        inkColor2={values.inkColor2 as string}
        inkColor3={values.inkColor3 as string}
        paperColor={values.paperColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}
