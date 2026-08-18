"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Molten, { type MoltenMode } from "./molten";

export default function MoltenPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  const mode = values.mode as MoltenMode;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-8">
      <Molten
        text="MOLTEN"
        mode={mode}
        melt={values.melt as number}
        viscosity={values.viscosity as number}
        cycle={values.cycle as number}
        threshold={values.threshold as number}
        softness={values.softness as number}
        drip={values.drip as number}
        wobble={values.wobble as number}
        phase={values.phase as number}
        baseColor={values.baseColor as string}
        meltColor={values.meltColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
      />

      {/* The word above is a real text node, not a picture of one. Saying so is
          the point of the caption — it is the claim the category makes and the
          one a canvas effect usually breaks. */}
      <p className="font-display text-[10px] tracking-[0.28em] text-ink-mute uppercase">
        {mode === "loop"
          ? "select the word — it is still text"
          : mode === "hover"
            ? "hover the word · still selectable"
            : "press and hold the word"}
      </p>
    </div>
  );
}
