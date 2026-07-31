"use client";

import { useState } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import Hold from "./Hold";

// A destructive action worth guarding is the only honest demo for this control,
// so the stage is a console line that actually changes when the hold commits.
// The timestamp is fixed rather than generated — a live clock would make every
// screenshot of this page differ from the last for no reason.
const PURGE_STAMP = "03:41:22";

export default function HoldPreview({ values, reducedMotion }: PreviewProps) {
  const [runs, setRuns] = useState(0);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
      <p className="font-display text-[10px] tracking-[0.28em] text-ink-mute uppercase">
        press and hold
      </p>

      <Hold
        label="Purge archive"
        confirmLabel="Archive purged"
        duration={values.duration as number}
        indicator={values.indicator as "ring" | "bar" | "fill"}
        threshold={values.threshold as number}
        rewindRate={values.rewindRate as number}
        strokeWidth={values.strokeWidth as number}
        holdScale={values.holdScale as number}
        commitScale={values.commitScale as number}
        successHold={values.successHold as number}
        accentColor={values.accentColor as string}
        trackColor={values.trackColor as string}
        reducedMotion={reducedMotion}
        onCommit={() => setRuns((n) => n + 1)}
      />

      <p className="font-display text-[11px] tracking-[0.14em]">
        {runs === 0 ? (
          <span className="text-ink-mute">&gt; awaiting authorisation</span>
        ) : (
          <span className="text-accent">
            &gt; archive purged · {PURGE_STAMP}
            {runs > 1 ? ` · ×${runs}` : ""}
          </span>
        )}
      </p>
    </div>
  );
}
