"use client";

import type { BooleanProp } from "@/lib/registry/types";

// Panel-switch toggle — squarish thumb for the instrument feel. Native <button>
// with role="switch" gives Enter/Space activation and focus for free.
export default function BooleanControl({
  schema,
  value,
  onChange,
}: {
  schema: BooleanProp;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const label = schema.label ?? schema.name;
  return (
    <div className="flex items-center justify-between gap-3">
      <label id={`lbl-${schema.name}`} className="font-mono text-xs text-ink-dim">
        {label}
      </label>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-labelledby={`lbl-${schema.name}`}
        onClick={() => onChange(!value)}
        className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
          value ? "border-accent-active bg-accent/25" : "border-hairline bg-raised"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-sm transition-all ${
            value ? "left-[18px] bg-accent" : "left-0.5 bg-ink-mute"
          }`}
        />
      </button>
    </div>
  );
}
