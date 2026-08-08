"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Swarm, { type SwarmDensity, type SwarmShape } from "./Swarm";

const WORDS = ["GARDEN", "ETA", "VII"];

export default function SwarmPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full min-h-80 w-full">
      <Swarm
        density={values.density as SwarmDensity}
        shape={values.shape as SwarmShape}
        targets={WORDS}
        swapDuration={values.swapDuration as number}
        morphSpeed={values.morphSpeed as number}
        stagger={values.stagger as number}
        curl={values.curl as number}
        damping={values.damping as number}
        repel={values.repel as number}
        pointSize={values.pointSize as number}
        zoom={values.zoom as number}
        autoSpin={values.autoSpin as boolean}
        particleColor={values.particleColor as string}
        accentColor={values.accentColor as string}
        backgroundColor={values.backgroundColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
      />
      {reducedMotion ? null : (
        <p className="pointer-events-none absolute right-3 bottom-2 font-display text-[9px] tracking-[0.28em] text-ink-mute uppercase">
          move — push the cloud apart
        </p>
      )}
    </div>
  );
}
