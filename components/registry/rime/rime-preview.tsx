"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Rime, { type RimeMode } from "./rime";

export default function RimePreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  const mode = values.mode as RimeMode;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-8">
      <Rime
        text="RIME"
        mode={mode}
        growth={values.growth as number}
        branching={values.branching as number}
        density={values.density as number}
        seeds={values.seeds as number}
        thaw={values.thaw as number}
        hold={values.hold as number}
        sparkle={values.sparkle as number}
        frostColor={values.frostColor as string}
        baseColor={values.baseColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
      />
      <p className="font-display text-[10px] tracking-[0.28em] text-ink-mute uppercase">
        {mode === "loop"
          ? "the frost is the only paint — the word never moves"
          : mode === "hover"
            ? "hover to thaw · still selectable"
            : "press and hold to freeze the word"}
      </p>
    </div>
  );
}
