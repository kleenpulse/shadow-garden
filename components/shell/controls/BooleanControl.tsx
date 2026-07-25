"use client";

import type { BooleanProp } from "@/lib/registry/types";
import { cn } from "@/lib/utils";

// Panel-switch toggle — round thumb, evenly inset in the track. Native <button>
// with role="switch" gives Enter/Space activation and focus for free.
export default function BooleanControl({
  schema,
  value,
  onChange,
  disabled = false,
}: {
  schema: BooleanProp;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const label = schema.label ?? schema.name;
  return (
    // No justify-between: in the full-width bench grid a cell can span a third
    // of the workspace, which would strand the switch far from its label.
    <div
      className={cn(
        "flex items-center gap-3 transition-opacity",
        disabled && "opacity-40",
      )}
    >
      <label id={`lbl-${schema.name}`} className="font-mono text-xs text-ink-dim">
        {label}
      </label>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-labelledby={`lbl-${schema.name}`}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
          value ? "border-accent-active bg-accent/25" : "border-hairline bg-raised"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${
            value ? "left-[18px] bg-accent" : "left-0.5 bg-ink-mute"
          }`}
        />
      </button>
    </div>
  );
}
