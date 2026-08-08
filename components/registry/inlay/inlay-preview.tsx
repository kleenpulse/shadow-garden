"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Inlay, { type InlayMaterial } from "./inlay";

export default function InlayPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative flex h-full min-h-80 w-full flex-col items-center justify-center gap-4 px-8 text-center">
      <p className="font-display text-[10px] tracking-[0.32em] text-ink-mute uppercase">
        Real text, poured full
      </p>
      {/* Fluid rather than stepped. The component sizes itself to its text, so a
          fixed font size makes the box the same width at every viewport — and a
          canvas that never needs to resize is a canvas whose resize path is
          never exercised. */}
      <h2
        className="font-display leading-none font-bold tracking-tight"
        style={{ fontSize: "clamp(2rem, 7vw, 16rem)" }}
      >
        <Inlay
          text="SHADOW"
          material={values.material as InlayMaterial}
          flowSpeed={values.flowSpeed as number}
          scale={values.scale as number}
          sweep={values.sweep as number}
          glow={values.glow as number}
          grain={values.grain as number}
          warp={values.warp as number}
          hoverBoost={values.hoverBoost as number}
          colorA={values.colorA as string}
          colorB={values.colorB as string}
          paused={paused}
          reducedMotion={reducedMotion}
        />
      </h2>
      <p className="max-w-sm text-xs leading-relaxed text-ink-dim">
        Select the word above. It is a real text node — the material is painted
        over it, not instead of it.
      </p>
    </div>
  );
}
