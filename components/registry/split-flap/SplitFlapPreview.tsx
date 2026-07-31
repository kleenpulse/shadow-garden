"use client";

import { useEffect, useState } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import SplitFlap from "./SplitFlap";

// Fixed-width columns, like a real board — the mechanism has as many card stacks
// as it has, and short words are padded rather than shrinking the hardware.
const BOARD = ["SHADOW ", "GARDEN ", "EPSILON", "ZETA   ", "DELTA  "];

export default function SplitFlapPreview({ values, reducedMotion, paused }: PreviewProps) {
  const [row, setRow] = useState(0);

  useEffect(() => {
    // No cycling while the board is halted or motion is off — re-targeting a
    // frozen mechanism would queue up flips nobody asked for and land them all
    // at once on resume.
    if (paused || reducedMotion) return;
    const id = setInterval(() => setRow((n) => (n + 1) % BOARD.length), 4200);
    return () => clearInterval(id);
  }, [paused, reducedMotion]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
      <p className="font-display text-[10px] tracking-[0.28em] text-ink-mute uppercase">
        departures
      </p>

      <SplitFlap
        text={BOARD[row]}
        charset={values.charset as "alphanumeric" | "letters" | "digits" | "departures"}
        flapDuration={values.flapDuration as number}
        stagger={values.stagger as number}
        settleBounce={values.settleBounce as number}
        cardGap={values.cardGap as number}
        seamWeight={values.seamWeight as number}
        specular={values.specular as number}
        perspective={values.perspective as number}
        cardColor={values.cardColor as string}
        glyphColor={values.glyphColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
        className="font-display text-[clamp(1.75rem,7vw,3.5rem)]"
      />
    </div>
  );
}
