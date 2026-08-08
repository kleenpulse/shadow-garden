"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Redact from "./redact";

// The effect only reads as redaction if the thing being redacted looks like a
// document, so the stage supplies the file: eyebrow, ruled panel, corner stamp.
const MEMO =
  "The seventh shade was never assigned a designation. Every record of the assignment was destroyed at the subject's request, as was the request.";

export default function RedactPreview({ values, reducedMotion }: PreviewProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="relative w-full max-w-xl rounded-md border border-hairline bg-raised p-6 pt-8">
        <span className="absolute top-4 right-4 rotate-[-8deg] rounded-xs border border-accent-muted px-2 py-0.5 font-display text-[9px] tracking-[0.24em] text-accent uppercase">
          Declassified
        </span>

        <p className="mb-4 font-display text-[10px] tracking-[0.3em] text-ink-mute uppercase">
          Memorandum · Shadow Garden · Eyes Only
        </p>

        <Redact
          text={MEMO}
          mode={values.mode as "wipe" | "slide" | "lift"}
          direction={values.direction as "ltr" | "rtl" | "center-out" | "random"}
          duration={values.duration as number}
          stagger={values.stagger as number}
          startDelay={values.startDelay as number}
          barPadding={values.barPadding as number}
          loop={values.loop as boolean}
          interval={values.interval as number}
          barColor={values.barColor as string}
          edgeColor={values.edgeColor as string}
          reducedMotion={reducedMotion}
          className="font-sans text-[15px] leading-8 text-ink"
        />
      </div>
    </div>
  );
}
