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

export type Variant = {
  lang: "js" | "ts";
  style: "css" | "tailwind";
  /** Path to the canonical source file on disk, relative to the repo root. */
  file: string;
  /**
   * What this file is to the customer. `"component"` is the entry itself and is
   * always variants[0]; `"hook"` is a peer file they must copy alongside it —
   * the animation runtime host (SPEC §C1b). Defaults to `"component"`.
   */
  role?: "component" | "hook";
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
  /** v1 populates one canonical (TS + Tailwind) entry; array kept extensible. */
  variants: Variant[];
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
