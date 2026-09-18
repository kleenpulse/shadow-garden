"use client";

import { useRef } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import StretchType from "./stretch-type";

// The bench stage does not scroll, and this component measures scroll velocity —
// so the preview supplies the scroller. `scrollContainerRef` is the same escape
// hatch a customer uses to drive it from a modal or a virtualised list; the
// default (no ref) tracks the window, which is what a normal page wants.
const LINES = [
  "scroll",
  "faster",
  "and the",
  "letters",
  "give",
  "under",
  "the load",
  "then",
  "recover",
];

export default function StretchTypePreview({ values, reducedMotion }: PreviewProps) {
  const scroller = useRef<HTMLDivElement>(null);

  return (
    <div className="relative h-full w-full">
      <div
        ref={scroller}
        // `absolute inset-0`, not `h-full`: the stage grid row is min-height-only,
        // so in-flow content this tall would inflate the row to its intrinsic
        // height and nothing would ever scroll (same trap word-reveal hit).
        // `overscroll-contain` stops a hard flick inside the stage from chaining
        // into the page behind it — the whole point here is to scroll hard.
        className="absolute inset-0 overflow-y-auto overscroll-contain"
      >
        <div className="flex flex-col items-center gap-16 px-6 py-[45%]">
          {LINES.map((line) => (
            <StretchType
              key={line}
              text={line}
              scrollContainerRef={scroller}
              stretch={values.stretch as number}
              skew={values.skew as number}
              tracking={values.tracking as number}
              stiffness={values.stiffness as number}
              damping={values.damping as number}
              maxVelocity={values.maxVelocity as number}
              stagger={values.stagger as number}
              direction={values.direction as "vertical" | "horizontal"}
              reducedMotion={reducedMotion}
              className="text-3xl sm:text-5xl"
            />
          ))}
        </div>
      </div>

      {reducedMotion ? null : (
        <p className="pointer-events-none absolute right-3 bottom-2 font-display text-[9px] tracking-[0.28em] text-ink-mute uppercase">
          scroll — hard
        </p>
      )}
    </div>
  );
}
