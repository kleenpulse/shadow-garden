import ts from "typescript";

// Two facts about a landing-page template that nothing else can see, digested
// here so the rules stay pure (§C5, same shape as loop-usage.ts and
// filter-region.ts).
//
// Both are invisible at runtime and fatal at paste time. A template that renders
// `/hero.webp` works perfectly in this repo — the file is right there in public/ —
// and 404s the moment a buyer copies it, because the binary was never theirs to
// copy (§C12/§V55). A stylesheet whose selectors are not scoped works perfectly
// in the iframe and repaints the bench the moment the template is viewed inline
// (§V56).


export interface TemplateAudit {
  /** Root-relative media literals — the ones that will not survive the copy. */
  localAssets: Array<{ file: string; value: string }>;
  /** Effectively-global selectors in a template stylesheet. */
  unscopedSelectors: Array<{ file: string; selector: string }>;
  /** Utilities that compile to nothing, and CSS variables nothing declares. */
  deadTokens: Array<{ file: string; token: string; kind: "utility" | "var" }>;
}

/**
 * Extensions that mean "a binary lives at this path". Deliberately not a general
 * `/^\//` check: `href="/pricing"` and `src="/api/x"` are routes, not assets, and
 * a template is allowed to link to the site it is part of.
 */
const MEDIA = /\.(png|jpe?g|webp|avif|gif|svg|mp4|webm|mov|m4v|mp3|wav|ogg|glb|gltf|bin|woff2?|otf|ttf)$/i;

/**
 * String literals in a TS/TSX file that point at a root-relative media file.
 *
 * AST, not regex, for the reason imports.ts spells out: this repo describes its
 * own past mistakes in doc comments, and a text search counts the prose. A
 * template's own README line about `/hero.webp` is not a shipped reference.
 */
export function findLocalAssets(fileName: string, text: string): string[] {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const value = node.text;
      if (value.startsWith("/") && !value.startsWith("//") && MEDIA.test(value)) {
        out.push(value);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

/** At-rules whose bodies hold declarations or frames, never selectors. */
const OPAQUE_AT = /^@(keyframes|font-face|property|counter-style|page|import|charset|namespace)\b/i;
/** At-rules that wrap ordinary rules — their contents are still top level. */
const TRANSPARENT_AT = /^@(media|supports|layer|container|scope)\b/i;

/**
 * Selectors that escape the template's scope.
 *
 * Only *effectively top-level* rules are checked: a selector nested inside
 * `[data-template="x"] { … }` is already scoped by its parent, and demanding the
 * attribute on every nested rule would make the stylesheet unreadable for no
 * extra safety. `@media`/`@supports`/`@layer` are transparent — a rule inside one
 * is still global — so the walk descends through them without lowering the bar.
 */
export function findUnscopedSelectors(text: string, slug: string): string[] {
  const scope = `[data-template="${slug}"]`;
  const out: string[] = [];
  let i = 0;
  let prelude = "";
  // One entry per open block: true when that block scopes what is inside it.
  const stack: boolean[] = [];

  const scoped = () => stack.some(Boolean);

  while (i < text.length) {
    const c = text[i]!;

    if (c === "/" && text[i + 1] === "*") {
      const close = text.indexOf("*/", i + 2);
      i = close === -1 ? text.length : close + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c && text[j] !== "\n") {
        j += text[j] === "\\" ? 2 : 1;
      }
      prelude += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    if (c === "{") {
      const head = prelude.trim();
      prelude = "";
      i++;

      if (OPAQUE_AT.test(head)) {
        // Skip the whole body — `0%`/`to` are not selectors.
        let depth = 1;
        while (i < text.length && depth > 0) {
          if (text[i] === "{") depth++;
          else if (text[i] === "}") depth--;
          i++;
        }
        continue;
      }

      if (TRANSPARENT_AT.test(head)) {
        // Contributes no scope of its own; whatever held it still applies.
        stack.push(false);
        continue;
      }

      if (!scoped()) {
        for (const part of head.split(",")) {
          const selector = part.trim();
          if (selector && !selector.includes(scope)) out.push(selector);
        }
      }
      stack.push(true);
      continue;
    }

    if (c === "}") {
      stack.pop();
      prelude = "";
      i++;
      continue;
    }

    if (c === ";" && stack.length === 0) {
      // A top-level at-statement (`@import "x";`) — nothing to scope.
      prelude = "";
      i++;
      continue;
    }

    prelude += c;
    i++;
  }

  return out;
}
