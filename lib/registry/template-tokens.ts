import type { PropSchema } from "./types";

// The five knobs every landing-page template exposes (SPEC §V53).
//
// A component's props describe the effect it IS — `amplitude`, `speed`, `cellSize`.
// A template has no such surface: it is a page, and the only thing a buyer wants
// to turn before they copy it is whether it can wear their brand. So the Controls
// panel for a template answers exactly that question, and the Props table below it
// documents the same five as the template's public API.
//
// Shared rather than per-entry on purpose. `template-declares-tokens` in
// scripts/registry/rules.ts asserts every template ships THIS array, so the
// Controls panel is identical across the section and the postMessage payload has
// one fixed shape (§I.msg) instead of one per template.
//
// Framework-free, same constraint as lib/registry/kinds.ts (§C5/§C17): the
// headless check imports it under plain `bun`.

/**
 * Font pairings are named abstractly, not by family. A template maps the name to
 * its own stack in `template.css` — `display` is Aventine's condensed grotesk and
 * Caishen's brush serif. Naming the families here instead would force every
 * template to ship every font, and would make §V53's "same five" impossible.
 */
export const FONT_PAIRS = ["display", "grotesk", "serif", "mono"] as const;

export const TEMPLATE_TOKENS: PropSchema[] = [
  {
    kind: "color",
    name: "accent",
    default: "#c8a961",
    description: "Brand accent — buttons, links, active states, motion highlights.",
  },
  {
    kind: "color",
    name: "background",
    default: "#0a0a0b",
    description: "Page ground. Every surface in the template derives from it.",
  },
  {
    kind: "enum",
    name: "fontPair",
    default: "display",
    options: [...FONT_PAIRS],
    description: "Heading/body pairing. Maps to a font stack inside the template.",
  },
  {
    kind: "number",
    name: "radius",
    default: 4,
    min: 0,
    max: 32,
    step: 1,
    unit: "px",
    description: "Corner radius applied to cards, buttons and media frames.",
  },
  {
    kind: "enum",
    name: "motion",
    default: "full",
    options: ["full", "reduced"],
    description:
      "Motion budget. `reduced` quiesces scroll-driven and looping animation without removing layout.",
  },
];

/** Token names in declaration order — the check and the frame channel share this. */
export const TEMPLATE_TOKEN_NAMES: string[] = TEMPLATE_TOKENS.map((p) => p.name);
