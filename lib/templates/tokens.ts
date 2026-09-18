import { TEMPLATE_TOKENS } from "@/lib/registry/template-tokens";
import type { TunedValues } from "@/lib/registry/types";

// The wire format between the bench and a template (SPEC §I.msg, §V59).
//
// A template consumes PLAIN CSS VARIABLES and two data attributes — nothing else.
// That is deliberate: it means the bytes a buyer copies contain no postMessage
// listener, no bench coupling and no runtime they did not ask for. They change the
// brand by editing one block of `template.css`.
//
// The bench, meanwhile, gets live control for free: it sets the same variables on
// a wrapper element, and CSS cascade does the rest. Dragging the accent picker
// repaints without reloading the iframe because there is nothing to re-run.

/** Token name → CSS custom property. Everything numeric carries its unit here. */
const CSS_VAR: Record<string, (value: string) => [string, string]> = {
  accent: (v) => ["--sg-accent", v],
  background: (v) => ["--sg-bg", v],
  radius: (v) => ["--sg-radius", `${v}px`],
};

/** Token name → data attribute. These select between variants the template owns. */
const DATA_ATTR: Record<string, string> = {
  fontPair: "data-font-pair",
  motion: "data-motion",
};

export interface TemplateSkin {
  style: Record<string, string>;
  attrs: Record<string, string>;
}

/** Turn tuned token values into the wrapper's inline style + data attributes. */
export function skinFrom(values: TunedValues): TemplateSkin {
  const style: Record<string, string> = {};
  const attrs: Record<string, string> = {};

  for (const [name, raw] of Object.entries(values)) {
    const toVar = CSS_VAR[name];
    if (toVar) {
      const [prop, value] = toVar(String(raw));
      style[prop] = value;
      continue;
    }
    const attr = DATA_ATTR[name];
    if (attr) attrs[attr] = String(raw);
  }

  return { style, attrs };
}

/**
 * Token values from a query string, falling back to each token's declared
 * default. Used for the iframe's FIRST paint — the bench posts updates after
 * mount, but a frame that started at the wrong accent would flash before the
 * first message lands.
 */
export function tokensFromParams(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): TunedValues {
  const read = (key: string): string | undefined => {
    if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const out: TunedValues = {};
  for (const prop of TEMPLATE_TOKENS) {
    const raw = read(prop.name);
    if (raw === undefined) {
      out[prop.name] = prop.default;
      continue;
    }
    // nuqs serialises everything as a string; the schema says what it should be.
    out[prop.name] = prop.kind === "number" ? Number(raw) || prop.default : raw;
  }
  return out;
}

/** The same values as a query string, for the iframe's initial `src`. */
export function tokensToQuery(values: TunedValues): string {
  const params = new URLSearchParams();
  for (const prop of TEMPLATE_TOKENS) {
    const value = values[prop.name];
    if (value !== undefined) params.set(prop.name, String(value));
  }
  return params.toString();
}
