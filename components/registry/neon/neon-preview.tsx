"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Neon, { type NeonMode } from "./neon";

export default function NeonPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  const mode = values.mode as NeonMode;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-8">
      <Neon
        text="OPEN"
        mode={mode}
        tubeColor={values.tubeColor as string}
        glow={values.glow as number}
        core={values.core as number}
        ignition={values.ignition as number}
        cycle={values.cycle as number}
        hum={values.hum as number}
        flicker={values.flicker as number}
        offGlass={values.offGlass as boolean}
        paused={paused}
        reducedMotion={reducedMotion}
      />
      <p className="font-display text-[10px] tracking-[0.28em] text-ink-mute uppercase">
        {mode === "loop"
          ? "select the word — it is still text"
          : mode === "hover"
            ? "hover to strike the tubes"
            : "steady burn · the flicker is a tube dying"}
      </p>
    </div>
  );
}
