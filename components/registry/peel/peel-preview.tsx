"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Peel, { type PeelContent, type PeelCorner } from "./peel";

export default function PeelPreview({ values, reducedMotion }: PreviewProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 px-8">
      <Peel
        resistance={values.resistance as number}
        curl={values.curl as number}
        threshold={values.threshold as number}
        stiffness={values.stiffness as number}
        damping={values.damping as number}
        shadow={values.shadow as number}
        backDim={values.backDim as number}
        content={values.content as PeelContent}
        corner={values.corner as PeelCorner}
        size={values.size as number}
        accent={values.accent as string}
        reducedMotion={reducedMotion}
      />
      <p className="font-display text-[10px] tracking-[0.28em] text-ink-mute uppercase">
        drag the corner · past the threshold it lets go
      </p>
    </div>
  );
}
