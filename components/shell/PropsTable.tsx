import type { ComponentEntry, PropSchema } from "@/lib/registry/types";

// Generated from the SAME schema that drives the Controls panel — one source of truth.
function typeLabel(prop: PropSchema): string {
  switch (prop.kind) {
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "color":
      return "string (hex)";
    case "enum":
      return prop.options.map((option) => `"${option}"`).join(" | ");
  }
}

function defaultLabel(prop: PropSchema): string {
  return prop.kind === "color" || prop.kind === "enum" ? `"${prop.default}"` : String(prop.default);
}

export default function PropsTable({ entry }: { entry: ComponentEntry }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-hairline bg-panel">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-hairline">
            {["Prop", "Type", "Default", "Description"].map((heading) => (
              <th
                key={heading}
                className="px-4 py-2.5 font-display text-[10px] uppercase tracking-[0.18em] text-ink-mute"
              >
                {heading}
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
                {defaultLabel(prop)}
              </td>
              <td className="px-4 py-2.5 font-sans text-xs text-ink-dim">{prop.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
