"use client";

import type { PreviewProps } from "@/lib/registry/types";
import MetallicText from "./MetallicText";

// Heavy and wide. Chrome is a ramp across the height of a glyph, so a thin face
// gives it two pixels to work with and the effect reads as a coloured outline.
const HEADLINE = "METALLIC TEXT";

export default function MetallicTextPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 p-6">
      <MetallicText
        text={HEADLINE}
        className="font-display text-[clamp(2rem,9vw,4.5rem)] leading-none font-extrabold tracking-[0.06em]"
        sweepSpeed={values.sweepSpeed as number}
        sweepWidth={values.sweepWidth as number}
        sweepAngle={values.sweepAngle as number}
        contrast={values.contrast as number}
        specular={values.specular as number}
        lag={values.lag as number}
        sweep={values.sweep as "alternate" | "loop"}
        grain={values.grain as number}
        baseColor={values.baseColor as string}
        highlightColor={values.highlightColor as string}
        accentColor={values.accentColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
      />
      <p className="font-display text-[9px] tracking-[0.28em] text-ink-mute uppercase">
        select it — the words are still there
      </p>
    </div>
  );
}
