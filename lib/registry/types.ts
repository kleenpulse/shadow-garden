// Single source of truth for a component's tunable surface. Each PropSchema entry
// drives BOTH a control in the Controls panel AND a row in the Props API table —
// never hand-written twice.

export type Category =
  | "Backgrounds"
  | "Text Animations"
  | "Micro-interactions"
  | "Power-User Systems";

// Fixed display order for the sidebar / catalog grouping.
export const CATEGORY_ORDER: Category[] = [
  "Backgrounds",
  "Text Animations",
  "Micro-interactions",
  "Power-User Systems",
];

export type Tier = "free" | "pro";

export type PropValue = number | string | boolean;
export type TunedValues = Record<string, PropValue>;

type PropBase = {
  /** Prop name as it appears in the component API. */
  name: string;
  /** Optional friendlier control label; falls back to `name`. */
  label?: string;
  /** One-line description, shown in the API table. */
  description: string;
  /** Disable this control while another tuned prop equals the given value. */
  disabledWhen?: { prop: string; equals: PropValue };
};

export type NumberProp = PropBase & {
  kind: "number";
  default: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
};

export type EnumProp = PropBase & {
  kind: "enum";
  default: string;
  options: string[];
};

export type BooleanProp = PropBase & {
  kind: "boolean";
  default: boolean;
};

export type ColorProp = PropBase & {
  kind: "color";
  default: string;
};

export type PropSchema = NumberProp | EnumProp | BooleanProp | ColorProp;

/**
 * What a shipped file is to the customer. Every file the component imports has
 * to be copied, so every file gets a role — the union is what stops a supporting
 * file from being silently omitted from the install manifest (§V40).
 *
 * - `component` — the entry itself, always variants[0].
 * - `hook` — the animation runtime host, `hooks/use-animation-loop.ts` (§C1b).
 * - `util` — a shared helper living outside `components/registry/`, i.e.
 *   `lib/utils.ts` and its `cn` export.
 * - `peer` — a sibling the component is assembled from (`./Toolbar`,
 *   `./auto-mask-horizontal`). Distinct from `util`: calling `Toolbar.tsx` a
 *   util would be a lie in the tab strip.
 *
 * Behaviour per role lives in one table — `ROLE_TABLE` in lib/registry/roles.ts.
 * The role union is declared here rather than there because this file is
 * vendored into the admin repo (§V19) and has to compile standalone.
 */
export type VariantRole = "component" | "hook" | "util" | "peer";

export type Variant = {
  lang: "js" | "ts";
  style: "css" | "tailwind";
  /** Path to the canonical source file on disk, relative to the repo root. */
  file: string;
  /** Defaults to `"component"`. */
  role?: VariantRole;
  /** Tab label in the Code panel. Falls back to the file's basename. */
  label?: string;
};

export interface ComponentEntry {
  slug: string;
  name: string;
  category: Category;
  tier: Tier;
  /** ISO date (YYYY-MM-DD) the component was added. Drives the transient "New"
      badge (< 7 days old); absent means never-new. */
  addedAt?: string;
  description: string;
  /** Drives the Controls panel and the Props API table. */
  props: PropSchema[];
  /**
   * Motion-glossary terms this component demonstrates, matched exactly against
   * `COOKBOOK_TERMS` in lib/cookbook.ts. Declared here rather than on the glossary
   * so a component owns its own cookbook; /cookbook inverts the mapping.
   * `check:registry` fails on a term the glossary does not define.
   */
  cookbook?: string[];
  /** Every file the customer copies. v1 populates one canonical (TS + Tailwind)
      component; peer files (`hook` / `util` / `peer`) follow it, so variants[0]
      is always the component itself. */
  variants: Variant[];
  /**
   * npm packages the customer must install — the **transitive** closure over
   * every declared variant, not just the component file's own imports. A variant
   * that itself imports a package puts that package here too: the 37 entries
   * shipping `lib/utils.ts` declare `clsx` and `tailwind-merge` because `cn`
   * needs them. Previews are excluded — they never ship (§V40).
   *
   * This array is customer-facing install instructions. Under-declare and the
   * paste does not compile; over-declare and they install a package they never
   * load. `check:registry` enforces both directions.
   */
  dependencies?: string[];
  /** Has a free-running animation loop the global pause control can halt.
      Set on WebGL/Canvas/rAF loopers; drives the header pause button's visibility. */
  pausable?: boolean;
}

/** Props handed to every live preview component. */
export interface PreviewProps {
  values: TunedValues;
  /** True when the OS requests reduced motion — previews must quiesce. */
  reducedMotion: boolean;
  /** True when the user has manually paused via the Controls header toggle.
      Distinct from `reducedMotion` (which also gates entrance/one-shot animations);
      loopers OR the two into one "effective still" signal. */
  paused: boolean;
}
