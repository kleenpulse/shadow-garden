"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Kinetic, { type KineticSplit, type KineticTrigger } from "./kinetic";

// Short on purpose. Every glyph is its own spring, and a paragraph of them is
// a paragraph of springs — the point lands in four words and the cost of
// proving it does not need to be a hundred.
const LINE = "Type with weight.";

export default function KineticPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  const trigger = values.trigger as KineticTrigger;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-8">
      <Kinetic
        text={LINE}
        stiffness={values.stiffness as number}
        damping={values.damping as number}
        mass={values.mass as number}
        jumpHeight={values.jumpHeight as number}
        anticipation={values.anticipation as number}
        windUp={values.windUp as number}
        squash={values.squash as number}
        stagger={values.stagger as number}
        interval={values.interval as number}
        trigger={trigger}
        split={values.split as KineticSplit}
        shadow={values.shadow as boolean}
        accentColor={values.accentColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
        className="font-display text-4xl text-ink sm:text-6xl"
      />
      <p className="font-display text-[10px] tracking-[0.24em] text-ink-mute uppercase">
        {trigger === "hover"
          ? "hover or focus the line"
          : "anticipation · squash · follow-through"}
      </p>
    </div>
  );
}
