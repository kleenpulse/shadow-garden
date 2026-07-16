"use client";

import { useMemo } from "react";
import {
  parseAsBoolean,
  parseAsFloat,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import type { PropSchema, PropValue, TunedValues } from "./types";

// Bridge the prop schema to nuqs parsers. Tuned values live in the URL query
// string via shallow routing (client-only) — so deep links reproduce a tuning
// exactly, and the server `searchParams` stays untouched, preserving PPR.
function buildParsers(props: PropSchema[]) {
  const entries = props.map((prop) => {
    switch (prop.kind) {
      case "number":
        return [prop.name, parseAsFloat.withDefault(prop.default)] as const;
      case "boolean":
        return [prop.name, parseAsBoolean.withDefault(prop.default)] as const;
      case "enum":
        return [prop.name, parseAsStringLiteral(prop.options).withDefault(prop.default)] as const;
      case "color":
        return [prop.name, parseAsString.withDefault(prop.default)] as const;
    }
  });
  return Object.fromEntries(entries);
}

export function useTunedProps(props: PropSchema[]) {
  const parsers = useMemo(() => buildParsers(props), [props]);
  const [values, setValues] = useQueryStates(parsers, {
    history: "replace",
    shallow: true,
    clearOnDefault: true,
    throttleMs: 80,
  });

  // The schema is dynamic, so the setter is typed loosely at this one boundary.
  const setValue = (name: string, value: PropValue) => {
    (setValues as (patch: Record<string, PropValue | null>) => void)({ [name]: value });
  };

  const reset = () => {
    const cleared: Record<string, null> = {};
    for (const prop of props) cleared[prop.name] = null;
    (setValues as (patch: Record<string, null>) => void)(cleared);
  };

  return { values: values as TunedValues, setValue, reset };
}
