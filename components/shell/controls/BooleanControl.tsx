"use client";

import type { BooleanProp } from "@/lib/registry/types";
import Switch from "./Switch";

// Schema adapter over the shared Switch primitive — the visual and the
// role="switch" contract live there, this only maps a PropSchema onto them.
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
  return (
    <Switch
      id={schema.name}
      label={schema.name}
      checked={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
