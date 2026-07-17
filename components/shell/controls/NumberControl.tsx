"use client";

import type { NumberProp } from "@/lib/registry/types";
import { cn } from "@/lib/utils";

function formatValue(value: number, schema: NumberProp): string {
  const step = schema.step ?? 1;
  const decimals = step < 1 ? (String(step).split(".")[1]?.length ?? 1) : 0;
  return `${value.toFixed(decimals)}${schema.unit ? ` ${schema.unit}` : ""}`;
}

// The signature control: a detented slider with an LED-style monospace readout.
export default function NumberControl({
  schema,
  value,
  onChange,
  disabled = false,
}: {
  schema: NumberProp;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const label = schema.label ?? schema.name;
  return (
    <div className={cn("space-y-1.5 transition-opacity", disabled && "opacity-40")}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={`ctl-${schema.name}`} className="font-mono text-xs text-ink-dim">
          {label}
        </label>
        <output className="font-display text-xs tabular-nums text-accent">
          {formatValue(value, schema)}
        </output>
      </div>
      <input
        id={`ctl-${schema.name}`}
        type="range"
        className="bench-range w-full"
        min={schema.min}
        max={schema.max}
        step={schema.step ?? 1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
