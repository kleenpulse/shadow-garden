"use client";

import { useState } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import Segmented, {
  type SegmentedDensity,
  type SegmentedIndicator,
  type SegmentedSizing,
} from "./Segmented";

// Deliberately uneven label widths. With `sizing: auto` the indicator has to
// resize as well as travel, which is the half of the FLIP a demo of four
// equal-width tabs never shows.
const ITEMS = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "quarter", label: "Quarter" },
];

const READOUT: Record<string, string> = {
  day: "24 hours, one row per hour",
  week: "7 columns, stacked by weekday",
  month: "A calendar grid, 5 or 6 rows",
  quarter: "13 weeks, rolled up by month",
};

export default function SegmentedPreview({
  values,
  reducedMotion,
}: PreviewProps) {
  const [range, setRange] = useState("week");

  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <p className="font-display text-[10px] tracking-[0.28em] text-ink-mute uppercase">
          click a segment · arrows · home / end
        </p>

        <Segmented
          items={ITEMS}
          value={range}
          onValueChange={setRange}
          indicator={values.indicator as SegmentedIndicator}
          sizing={values.sizing as SegmentedSizing}
          density={values.density as SegmentedDensity}
          radius={values.radius as number}
          stiffness={values.stiffness as number}
          damping={values.damping as number}
          smear={values.smear as number}
          glow={values.glow as boolean}
          accentColor={values.accentColor as string}
          reducedMotion={reducedMotion}
          aria-label="Date range"
        />

        {/* Owned by the preview, not the component: a segmented control that
            reported its own selection would be a tab panel wearing a control's
            clothes. The readout is here to prove the value actually changed. */}
        <p className="min-h-5 text-center font-sans text-[13px] text-ink-dim">
          {READOUT[range]}
        </p>
      </div>
    </div>
  );
}
