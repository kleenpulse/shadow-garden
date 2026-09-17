"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Ferrofluid from "./ferrofluid";

export default function FerrofluidPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full min-h-80 w-full">
      <Ferrofluid
        blobs={values.blobs as number}
        speed={values.speed as number}
        cohesion={values.cohesion as number}
        spikes={values.spikes as number}
        spikeFrequency={values.spikeFrequency as number}
        magnetRadius={values.magnetRadius as number}
        sheen={values.sheen as number}
        fluidColor={values.fluidColor as string}
        accentColor={values.accentColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
      />
      <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.2em] text-ink-mute uppercase">
        hold the cursor to the fluid
      </p>
    </div>
  );
}
