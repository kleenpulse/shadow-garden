"use client";

import type { PreviewProps } from "@/lib/registry/types";
import AsciiEngine, {
  type AsciiCharset,
  type AsciiSolid,
} from "./AsciiEngine";

export default function AsciiEnginePreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full min-h-80 w-full">
      <AsciiEngine
        solid={values.solid as AsciiSolid}
        charset={values.charset as AsciiCharset}
        cellSize={values.cellSize as number}
        spinSpeed={values.spinSpeed as number}
        tilt={values.tilt as number}
        zoom={values.zoom as number}
        contrast={values.contrast as number}
        edgeBoost={values.edgeBoost as number}
        glow={values.glow as number}
        inkColor={values.inkColor as string}
        backgroundColor={values.backgroundColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
      />
      <p className="pointer-events-none absolute right-3 bottom-2 font-display text-[9px] tracking-[0.28em] text-ink-mute uppercase">
        {reducedMotion
          ? `${values.cellSize as number}px cells`
          : `drag to orbit — ${values.cellSize as number}px cells`}
      </p>
    </div>
  );
}
