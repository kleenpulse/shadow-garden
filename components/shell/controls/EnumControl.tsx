"use client";

import type { EnumProp } from "@/lib/registry/types";

export default function EnumControl({
  schema,
  value,
  onChange,
}: {
  schema: EnumProp;
  value: string;
  onChange: (value: string) => void;
}) {
  const label = schema.label ?? schema.name;
  return (
    <div className="space-y-1.5">
      <label htmlFor={`ctl-${schema.name}`} className="font-mono text-xs text-ink-dim">
        {label}
      </label>
      <select
        id={`ctl-${schema.name}`}
        className="w-full rounded-md border border-hairline bg-raised px-2.5 py-1.5 font-mono text-xs text-ink outline-none focus-visible:border-accent"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {schema.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
