"use client";

import type { EnumProp } from "@/lib/registry/types";
import { cn } from "@/lib/utils";
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
  disabled = false,
}: {
  schema: EnumProp;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const label = schema.name;
  return (
    <div className={cn("space-y-1.5 transition-opacity", disabled && "opacity-40")}>
      <label htmlFor={`ctl-${schema.name}`} className="font-mono text-xs text-ink-dim">
        {label}
      </label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
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
