"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Telemetry, {
  type TelemetryColumns,
  type TelemetryFill,
} from "./telemetry";

export default function TelemetryPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="flex h-full w-full flex-col">
      <div className="min-h-0 flex-1">
        <Telemetry
          tiles={values.tiles as number}
          columns={values.columns as TelemetryColumns}
          sampleRate={values.sampleRate as number}
          history={values.history as number}
          smoothing={values.smoothing as number}
          threshold={values.threshold as number}
          scars={values.scars as boolean}
          cursor={values.cursor as boolean}
          fill={values.fill as TelemetryFill}
          traceColor={values.traceColor as string}
          breachColor={values.breachColor as string}
          paused={paused}
          reducedMotion={reducedMotion}
        />
      </div>

      {/* The instruction is the demonstration: the point of the component is
          invisible until you hover one tile and watch the other seven answer. */}
      <p className="shrink-0 pb-3 text-center font-display text-[10px] tracking-[0.28em] text-ink-mute uppercase">
        hover one tile · every tile reports that instant
      </p>
    </div>
  );
}
