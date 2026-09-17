"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Tear from "./tear";

export default function TearPreview({ values, reducedMotion }: PreviewProps) {
  return (
    <div className="relative h-full min-h-80 w-full">
      <Tear
        perforationAt={values.perforationAt as number}
        jag={values.jag as number}
        teeth={values.teeth as number}
        resistance={values.resistance as number}
        gravity={values.gravity as number}
        autoReset={values.autoReset as boolean}
        resetDelay={values.resetDelay as number}
        inkColor={values.inkColor as string}
        reducedMotion={reducedMotion}
      />
      <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.2em] text-ink-mute uppercase">
        drag the stub down and away
      </p>
    </div>
  );
}
