"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Passcode, { type PasscodeMode } from "./passcode";

export default function PasscodePreview({
  values,
  reducedMotion,
}: PreviewProps) {
  const mode = values.mode as PasscodeMode;
  const code = mode === "numeric" ? "424242" : "SHADOW";

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-6">
      <p className="text-center font-sans text-[13px] text-ink-dim">
        We sent a code to{" "}
        <span className="text-ink">operator@shadow-garden.dev</span>
      </p>

      <Passcode
        code={code}
        length={values.length as number}
        mode={mode}
        mask={values.mask as boolean}
        stiffness={values.stiffness as number}
        damping={values.damping as number}
        anticipation={values.anticipation as number}
        pasteStagger={values.pasteStagger as number}
        shakeAmplitude={values.shakeAmplitude as number}
        autoSubmit={values.autoSubmit as boolean}
        submitDelay={values.submitDelay as number}
        accentColor={values.accentColor as string}
        errorColor={values.errorColor as string}
        reducedMotion={reducedMotion}
      />

      {/* The correct code is on screen on purpose: without it the only reachable
          state is the rejection, and the fold into the tick would never be seen. */}
      <p className="font-display text-[10px] tracking-[0.28em] text-ink-mute uppercase">
        try {code} · or paste any {values.length as number} characters
      </p>
    </div>
  );
}
