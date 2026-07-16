"use client";

import { useEffect, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import type { ColorProp } from "@/lib/registry/types";

export default function ColorControl({
  schema,
  value,
  onChange,
}: {
  schema: ColorProp;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = schema.label ?? schema.name;

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="space-y-1.5" ref={ref}>
      <div className="flex items-center justify-between gap-3">
        <label className="font-mono text-xs text-ink-dim">{label}</label>
        <div className="flex items-center gap-2">
          <output className="font-display text-xs uppercase text-accent">{value}</output>
          <button
            type="button"
            aria-label={`Edit ${label}`}
            aria-expanded={open}
            onClick={() => setOpen((prev) => !prev)}
            className="h-5 w-5 rounded-sm border border-hairline"
            style={{ backgroundColor: value }}
          />
        </div>
      </div>
      {open && (
        <div className="bench-colorpicker relative z-10 pt-1">
          <HexColorPicker color={value} onChange={onChange} />
          <input
            className="mt-2 w-full rounded-md border border-hairline bg-raised px-2 py-1 font-mono text-xs text-ink"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-label={`${label} hex value`}
          />
        </div>
      )}
    </div>
  );
}
