"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Reflow, { type ReflowAlign } from "./reflow";

// Heavy overlap between consecutive phrases, on purpose. If every word changed
// there would be nothing to travel and the component would be a crossfade with
// extra steps — the demo has to be mostly the same sentence, moving.
const PHRASES = [
  "The quick brown fox jumps over the lazy dog",
  "The quick brown fox leaps over the sleeping dog",
  "The quick fox leaps over the dog",
  "The brown fox sleeps beside the lazy dog",
];

export default function ReflowPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      {/* Narrow enough that the sentence already wraps at columnWidth 100. A
          column wide enough to hold the whole phrase on one line shows word
          travel but never a line break, which is the half of the demo people
          actually came for. */}
      <div className="w-full max-w-md">
        <p className="mb-5 font-display text-[10px] tracking-[0.28em] text-ink-mute uppercase">
          drag the measure
        </p>
        {/* Reserved, because the point of the measure slider is that the line
            count changes. Without a floor the whole stage jumps every time a
            phrase drops to two lines. */}
        <div className="flex min-h-40 items-start">
          <Reflow
            phrases={PHRASES}
            columnWidth={values.columnWidth as number}
            stiffness={values.stiffness as number}
            damping={values.damping as number}
            stagger={values.stagger as number}
            enterScale={values.enterScale as number}
            wordGap={values.wordGap as number}
            lineHeight={values.lineHeight as number}
            align={values.align as ReflowAlign}
            auto={values.auto as boolean}
            interval={values.interval as number}
            traceMoves={values.traceMoves as boolean}
            accentColor={values.accentColor as string}
            paused={paused}
            reducedMotion={reducedMotion}
            className="text-2xl text-ink sm:text-[28px]"
          />
        </div>
      </div>
    </div>
  );
}
