"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Inscribe, { type InscribeFinish } from "./inscribe";

export default function InscribePreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="flex h-full min-h-80 w-full items-center justify-center px-8">
      <Inscribe
        text="EMINENCE"
        duration={values.duration as number}
        stagger={values.stagger as number}
        fillDelay={values.fillDelay as number}
        strokeWidth={values.strokeWidth as number}
        finish={values.finish as InscribeFinish}
        replay={values.replay as boolean}
        replayDelay={values.replayDelay as number}
        strokeColor={values.strokeColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
        className="max-w-2xl"
      />
    </div>
  );
}
