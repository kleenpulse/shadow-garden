"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Teletype, { type TeletypeCaret } from "./teletype";

// Deliberately uneven — a long line, a short one, and marks in four different
// places. A rotator whose lines are all the same shape proves nothing about
// either the reserved box or the punctuation beat.
//
// A module constant, not an inline literal: the component restarts whenever
// `lines` changes identity, and an array built in the render body is a new
// array every time the Controls panel moves a slider.
const LINES = [
  "Ship the interface, not the intention.",
  "Every animation makes a promise: something is about to happen.",
  "Fast, but never rushed — timing is the whole difference.",
  "None of this, in the end, is an accident.",
];

export default function TeletypePreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="flex w-full max-w-xl flex-col gap-4">
        <p className="font-display text-[10px] tracking-[0.28em] text-ink-mute uppercase">
          cadence · breath · caret
        </p>
        <Teletype
          lines={LINES}
          charsPerSecond={values.charsPerSecond as number}
          deleteRate={values.deleteRate as number}
          hold={values.hold as number}
          gap={values.gap as number}
          jitter={values.jitter as number}
          punctuationPause={values.punctuationPause as number}
          caret={values.caret as TeletypeCaret}
          caretBlink={values.caretBlink as number}
          loop={values.loop as boolean}
          reserveSpace={values.reserveSpace as boolean}
          accentColor={values.accentColor as string}
          paused={paused}
          reducedMotion={reducedMotion}
          className="text-[15px] leading-relaxed sm:text-[17px]"
        />
        {/* Sits directly under the type so a reserved box reads as a box: with
            `reserveSpace` off, this rule walks up and down the stage. */}
        <div className="h-px w-full bg-hairline" aria-hidden />
      </div>
    </div>
  );
}
