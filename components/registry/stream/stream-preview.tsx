"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Stream from "./stream";

const DEMO_TEXT =
  "A response that arrives all at once now reads as broken. This surface streams the way a live model streams: a shimmer while it thinks, tokens landing on an irregular clock and blurring into place, a caret riding the last word, and a stop control that actually interrupts. Pause the bench and generation freezes mid-word — the cadence rides the animation clock, not a timer chain.";

export default function StreamPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="flex h-full min-h-80 w-full items-center justify-center p-4">
      <div className="h-full max-h-96 w-full max-w-xl">
        <Stream
          text={DEMO_TEXT}
          tokensPerSecond={values.tokensPerSecond as number}
          jitter={values.jitter as number}
          chunking={values.chunking as "word" | "character"}
          blurAmount={values.blurAmount as number}
          thinkingMs={values.thinkingMs as number}
          caret={values.caret as "bar" | "block" | "none"}
          caretColor={values.caretColor as string}
          autoReplay={values.autoReplay as boolean}
          paused={paused}
          reducedMotion={reducedMotion}
        />
      </div>
    </div>
  );
}
