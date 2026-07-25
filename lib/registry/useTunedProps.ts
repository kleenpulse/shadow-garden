"use client";

import { useMemo } from "react";
import {
  parseAsBoolean,
  parseAsFloat,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import type { PropKind, PropOfKind } from "./kinds";
import type { PropSchema, PropValue, TunedValues } from "./types";

// Bridge the prop schema to nuqs parsers. Tuned values live in the URL query
// string via shallow routing (client-only) — so deep links reproduce a tuning
// exactly, and the server `searchParams` stays untouched, preserving PPR.
//
// A Record keyed by PropKind rather than a switch: nuqs can't live in
// lib/registry/kinds.ts (that module has to stay importable by the headless
// check), but keying on the same union buys the same guarantee — a fifth kind
// fails to compile here instead of silently parsing as a string.
// `satisfies` rather than a type annotation: it enforces the key set without
// widening the four builder types into a common supertype (nuqs's builders are
// invariant in their value, so a shared annotation would not typecheck).
const PARSERS = {
  number: (prop: PropOfKind<"number">) => parseAsFloat.withDefault(prop.default),
  boolean: (prop: PropOfKind<"boolean">) =>
    parseAsBoolean.withDefault(prop.default),
  enum: (prop: PropOfKind<"enum">) =>
    parseAsStringLiteral(prop.options).withDefault(prop.default),
  color: (prop: PropOfKind<"color">) => parseAsString.withDefault(prop.default),
} satisfies { [K in PropKind]: (prop: PropOfKind<K>) => unknown };

function buildParsers(props: PropSchema[]) {
  // `as never` — same correlated-union limitation the kind table documents.
  const entries = props.map(
    (prop) => [prop.name, PARSERS[prop.kind](prop as never)] as const,
  );
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
