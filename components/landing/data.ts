// Landing-page data derivation. Everything here is computed server-side from the
// registry so counts, names, and tiers can never drift from the catalog. Only
// plain serializable objects cross into the client islands.

import { registry, getEntry, groupByCategory } from "@/lib/registry";
import type { Category, NumberProp, Tier } from "@/lib/registry/types";

export interface LandingEntry {
  slug: string;
  name: string;
  tier: Tier;
  description: string;
}

export interface LandingExhibit {
  /** Section index glyph — the four categories, in registry order. */
  greek: string;
  /** Zero-padded ordinal, e.g. "01". */
  index: string;
  category: Category;
  blurb: string;
  entries: LandingEntry[];
}

export interface SliderSchema {
  name: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

export interface LandingData {
  stats: { total: number; free: number; pro: number };
  hero: { amplitude: number; distance: number; color: string; opacity: number };
  exhibits: LandingExhibit[];
  /** Accent used by the SpotlightShell cards — its own registry default. */
  spotlightAccent: string;
  proEntries: Array<{ slug: string; name: string; category: Category }>;
  tuning: {
    glowColor: string;
    sliders: SliderSchema[];
    /** Static defaults for the non-tunable BorderGlow props. */
    glowIntensity: number;
    edgeSensitivity: number;
    borderRadius: number;
    fillOpacity: number;
  };
}

const GREEK = ["α", "β", "γ", "δ"] as const;

/** "MorphingText" → "Morphing Text" — registry names are PascalCase; the page displays them spaced. */
function spaceName(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, "$1 $2");
}

/** Stable in-page anchor for a category section, e.g. "text-animations". */
export function anchorFor(category: Category): string {
  return category.toLowerCase().replace(/[^a-z]+/g, "-");
}

const BLURBS: Record<Category, string> = {
  Backgrounds: "Ambient fields. The room tone of an interface.",
  "Text Animations": "Letters under tension. Morph, count, scroll.",
  "Micro-interactions": "Small mechanisms. Felt more than seen.",
  "Power-User Systems": "Command surfaces for operators.",
};

function numberProp(slug: string, name: string): NumberProp {
  const entry = getEntry(slug);
  const prop = entry?.props.find((p) => p.name === name);
  if (!prop || prop.kind !== "number") {
    throw new Error(`Landing data expected number prop ${slug}.${name}`);
  }
  return prop;
}

function colorProp(slug: string, name: string): string {
  const entry = getEntry(slug);
  const prop = entry?.props.find((p) => p.name === name);
  if (!prop || prop.kind !== "color") {
    throw new Error(`Landing data expected color prop ${slug}.${name}`);
  }
  return prop.default;
}

export function buildLandingData(): LandingData {
  const free = registry.filter((entry) => entry.tier === "free").length;

  const exhibits: LandingExhibit[] = groupByCategory().map((group, i) => ({
    greek: GREEK[i] ?? "·",
    index: String(i + 1).padStart(2, "0"),
    category: group.category,
    blurb: BLURBS[group.category],
    entries: group.entries.map(({ slug, name, tier, description }) => ({
      slug,
      name: spaceName(name),
      tier,
      description,
    })),
  }));

  const toSlider = (slug: string, name: string, label: string): SliderSchema => {
    const prop = numberProp(slug, name);
    return {
      name,
      label,
      default: prop.default,
      min: prop.min,
      max: prop.max,
      step: prop.step ?? 1,
      unit: prop.unit,
    };
  };

  return {
    stats: { total: registry.length, free, pro: registry.length - free },
    hero: {
      amplitude: numberProp("threads", "amplitude").default,
      distance: numberProp("threads", "distance").default,
      color: colorProp("threads", "color"),
      opacity: numberProp("threads", "opacity").default,
    },
    exhibits,
    spotlightAccent: colorProp("spotlight-shell", "accentColor"),
    proEntries: registry
      .filter((entry) => entry.tier === "pro")
      .map(({ slug, name, category }) => ({ slug, name: spaceName(name), category })),
    tuning: {
      glowColor: colorProp("border-glow", "glowColor"),
      sliders: [
        toSlider("border-glow", "glowRadius", "Glow radius"),
        toSlider("border-glow", "coneSpread", "Cone spread"),
      ],
      glowIntensity: numberProp("border-glow", "glowIntensity").default,
      edgeSensitivity: numberProp("border-glow", "edgeSensitivity").default,
      borderRadius: numberProp("border-glow", "borderRadius").default,
      fillOpacity: numberProp("border-glow", "fillOpacity").default,
    },
  };
}
