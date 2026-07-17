"use client";

import type { EnumProp } from "@/lib/registry/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={`ctl-${schema.name}`} aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {schema.options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
