// The bench theme tokens a shipped component can lean on, with static values a
// customer can paste. About a third of the catalog styles itself with classes
// like `text-ink` and `bg-panel`; those are this repo's theme, not stock
// Tailwind, so in a customer's project they resolve to nothing unless the brief
// hands the tokens over too.
//
// Keep in sync with app/globals.css by hand. The values are restated here, not
// read from the stylesheet, for two reasons: the light theme there is a
// color-mix() over `--sg-dusk` that means nothing outside this app, and the
// brief is built per request, where a stylesheet read would need its own file
// trace.
//
// Free of React, Next and `server-only`, like roles.ts: the headless scripts
// import it too.

interface RoleToken {
  /** `ink` → the `--sg-ink` runtime variable and the `--color-ink` utility key. */
  name: string;
  light: string;
  dark: string;
  /** False for a role that has a runtime variable but no Tailwind utility. */
  utility: boolean;
}

const ROLE_TOKENS: readonly RoleToken[] = [
  { name: "surface", light: "#f9f9fb", dark: "#0a0b0c", utility: true },
  { name: "panel", light: "#ffffff", dark: "#101215", utility: true },
  { name: "raised", light: "#eceaef", dark: "#191d21", utility: true },
  { name: "hairline", light: "#dde2e7", dark: "#2a2f36", utility: true },
  { name: "ink", light: "#16191d", dark: "#e2e6e9", utility: true },
  { name: "ink-dim", light: "#545b64", dark: "#bcc2c8", utility: true },
  { name: "ink-mute", light: "#878e97", dark: "#6c737c", utility: true },
  { name: "accent", light: "#7e22ce", dark: "#a855f7", utility: true },
  { name: "accent-hover", light: "#6b21a8", dark: "#b87df9", utility: true },
  { name: "accent-active", light: "#581c87", dark: "#9333ea", utility: true },
  { name: "accent-muted", light: "#d8b4fe", dark: "#5b3a7a", utility: true },
  { name: "on-accent", light: "#ffffff", dark: "#0a0b0c", utility: true },
  { name: "danger", light: "#dc2626", dark: "#f87171", utility: true },
  { name: "scroll", light: "#c3c9cf", dark: "#464d56", utility: false },
];

/** Theme keys with one value in both themes. */
const STATIC_TOKENS: Readonly<Record<string, { value: string; use: RegExp }>> = {
  "--color-amethyst": {
    value: "#a855f7",
    use: /(?<![\w-])[a-z-]+-amethyst(?![\w-])/,
  },
  "--font-display": {
    // Space Mono is the intended face; the stack still reads as a mono display
    // in a project that has not loaded it.
    value: `"Space Mono", ui-monospace, "SFMono-Regular", monospace`,
    use: /(?<![\w-])font-display(?![\w-])/,
  },
};

/**
 * Utilities globals.css defines with `@utility`. Not tokens, but absent from a
 * customer's project in exactly the same way: there is no scrollbar plugin, so
 * without these blocks the class is a silent no-op.
 */
const CUSTOM_UTILITIES: Readonly<Record<string, string>> = {
  "scrollbar-thin": ["@utility scrollbar-thin {", "  scrollbar-width: thin;", "}"].join("\n"),
  "scrollbar-none": [
    "@utility scrollbar-none {",
    "  scrollbar-width: none;",
    "  &::-webkit-scrollbar {",
    "    display: none;",
    "  }",
    "}",
  ].join("\n"),
};

// Longest name first, so `ink-mute` is not read as `ink`.
const UTILITY_NAMES = ROLE_TOKENS.filter((token) => token.utility)
  .map((token) => token.name)
  .sort((a, b) => b.length - a.length)
  .join("|");
/** `text-ink`, `border-hairline/60`, `hover:bg-accent!` — any utility ending in a role. */
const UTILITY_USE = new RegExp(`(?<![\\w-])[a-z-]+-(${UTILITY_NAMES})(?![\\w-])`, "g");
/** A runtime variable read directly, e.g. `var(--sg-ink)` in an inline style. */
const VAR_USE = /--sg-([a-z-]+)/g;

export interface TokenUse {
  /** Role names whose `--sg-*` variable the source needs, in table order. */
  roles: string[];
  /** Roles used through a Tailwind utility, so they need a `--color-*` key. */
  utilities: string[];
  /** Roles the source reads as `var(--sg-*)` itself, with no utility between. */
  direct: string[];
  /** Static theme keys used: `--color-amethyst`, `--font-display`. */
  statics: string[];
  /** Custom `@utility` classes used: `scrollbar-thin`, `scrollbar-none`. */
  custom: string[];
}

/** What a set of shipped files needs from the bench theme. */
export function tokensUsed(sources: string[]): TokenUse {
  const text = sources.join("\n");
  const utilities = new Set([...text.matchAll(UTILITY_USE)].map((m) => m[1]));
  // A component's own private `--sg-tilt-x` is not a role and is skipped by the
  // table filter below.
  const direct = new Set([...text.matchAll(VAR_USE)].map((m) => m[1]));
  const inOrder = (names: Set<string>) =>
    ROLE_TOKENS.filter((token) => names.has(token.name)).map((token) => token.name);

  return {
    roles: inOrder(new Set([...utilities, ...direct])),
    utilities: inOrder(utilities),
    direct: inOrder(direct),
    statics: Object.keys(STATIC_TOKENS).filter((key) => STATIC_TOKENS[key].use.test(text)),
    custom: Object.keys(CUSTOM_UTILITIES).filter((name) =>
      new RegExp(`(?<![\\w-])${name}(?![\\w-])`).test(text),
    ),
  };
}

export function usesTokens(use: TokenUse): boolean {
  return use.roles.length > 0 || use.statics.length > 0 || use.custom.length > 0;
}

/** True when the source sets type in the display face, which the customer must load. */
export function usesDisplayFont(use: TokenUse): boolean {
  return use.statics.includes("--font-display");
}

/**
 * The custom properties the customer's stylesheet cannot do without. A role used
 * only through a utility needs its `--color-*` key and nothing else — a customer
 * who sets `--color-ink` to their own value has no use for `--sg-ink`.
 */
export function requiredVariables(use: TokenUse): string[] {
  return [
    ...use.utilities.map((name) => `--color-${name}`),
    ...use.direct.map((name) => `--sg-${name}`),
    ...use.statics,
  ];
}

/** The CSS to paste: only the tokens this source uses, light and dark. */
export function tokenCss(use: TokenUse): string {
  const role = (name: string) => ROLE_TOKENS.find((token) => token.name === name)!;
  const blocks: string[] = [];

  if (use.statics.length > 0) {
    blocks.push(
      ["@theme {", ...use.statics.map((key) => `  ${key}: ${STATIC_TOKENS[key].value};`), "}"].join("\n"),
    );
  }
  if (use.utilities.length > 0) {
    blocks.push(
      [
        "@theme inline {",
        ...use.utilities.map((name) => `  --color-${name}: var(--sg-${name});`),
        "}",
      ].join("\n"),
    );
  }
  if (use.roles.length > 0) {
    blocks.push(
      [":root {", ...use.roles.map((name) => `  --sg-${name}: ${role(name).light};`), "}"].join("\n"),
      [".dark {", ...use.roles.map((name) => `  --sg-${name}: ${role(name).dark};`), "}"].join("\n"),
    );
  }
  blocks.push(...use.custom.map((name) => CUSTOM_UTILITIES[name]));
  return blocks.join("\n\n");
}
