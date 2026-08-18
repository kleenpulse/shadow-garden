"use client";

import { useTranslations } from "next-intl";
import { useDataCopy } from "@/lib/i18n/data-copy";
import type { ComponentEntry } from "@/lib/registry/types";
import { formatDefault, typeLabel } from "@/lib/registry/kinds";

// Generated from the SAME schema that drives the Controls panel — one source of
// truth. How each kind prints is the kind table's business, not this table's.
// Client leaf so prop descriptions can resolve against the generated
// catalog.<slug>.props.<propName> copy; prop names, types and defaults are
// API identity and never translate.

const HEADINGS = ["prop", "type", "default", "description"] as const;

export default function PropsTable({ entry }: { entry: ComponentEntry }) {
  const t = useTranslations("chrome.propsTable");
  const copy = useDataCopy();

  return (
    <div className="overflow-x-auto rounded-lg border border-hairline bg-panel">
      <table className="w-full border-collapse text-start">
        <thead>
          <tr className="border-b border-hairline">
            {HEADINGS.map((heading) => (
              <th
                key={heading}
                className="px-4 py-2.5 font-display text-[10px] uppercase tracking-[0.18em] text-ink-mute"
              >
                {t(heading)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entry.props.map((prop) => (
            <tr key={prop.name} className="border-b border-hairline/60 last:border-0 align-top">
              <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-accent">{prop.name}</td>
              <td className="px-4 py-2.5 font-mono text-xs text-ink-dim">{typeLabel(prop)}</td>
              <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-ink-dim">
                {formatDefault(prop)}
              </td>
              <td className="px-4 py-2.5 font-sans text-xs text-ink-dim">
                {copy(`catalog.${entry.slug}.props.${prop.name}`, prop.description)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
