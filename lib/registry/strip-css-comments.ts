// The CSS half of the strip seam (SPEC §V57).
//
// lib/registry/strip-comments.ts is a JSX scanner: it tracks template literals,
// regex-vs-division, tag frames and JSX children. Point it at a stylesheet and
// `grid-area: 1 / 2`, `font: 12px/1.5` and `content: "</div>"` all land in code
// paths written for a different language. CSS has exactly one comment form and no
// regex literals, so it gets its own twenty lines instead.
//
// Same contract as its sibling: the checked-in file keeps its "why" notes, the
// buyer gets the bare stylesheet, and scripts/registry/check-strip.ts proves the
// structure survived.

/**
 * Strip `/* … *\/` comments, leaving strings and `url()` bodies untouched.
 *
 * Quoted strings are skipped wholesale because `content: "/*"` is a legal
 * declaration, and an unquoted `url(/* )` is not — so tracking quotes is enough.
 */
export function stripCssComments(source: string): string {
  let out = "";
  let i = 0;
  let touched = false;

  while (i < source.length) {
    const c = source[i]!;

    if (c === '"' || c === "'") {
      const end = closeQuote(source, i);
      out += source.slice(i, end);
      i = end;
      continue;
    }

    if (c === "/" && source[i + 1] === "*") {
      const close = source.indexOf("*/", i + 2);
      i = close === -1 ? source.length : close + 2;
      touched = true;
      continue;
    }

    out += c;
    i++;
  }

  return touched ? tidy(out) : source;
}

/** Index just past the closing quote. An unterminated quote ends at the newline. */
function closeQuote(source: string, start: number): number {
  const q = source[start];
  let i = start + 1;
  while (i < source.length) {
    const c = source[i];
    if (c === "\\") i += 2;
    else if (c === q) return i + 1;
    else if (c === "\n") return i;
    else i++;
  }
  return i;
}

/**
 * Comment removal leaves holes: a banner above the first rule, trailing spaces
 * where an end-of-line note used to sit, two blank lines between blocks. Same
 * cleanup the TS stripper does, for the same reason — the buyer should not be
 * able to tell a comment was ever there.
 */
function tidy(text: string): string {
  const lines = text.split("\n").map((line) => line.replace(/[ \t]+$/, ""));
  const kept: string[] = [];
  for (const line of lines) {
    if (line === "" && kept[kept.length - 1] === "") continue;
    kept.push(line);
  }
  while (kept.length > 0 && kept[0] === "") kept.shift();
  while (kept.length > 0 && kept[kept.length - 1] === "") kept.pop();
  return kept.join("\n") + "\n";
}
