// Comments live in the repo, not in the bytes a buyer reads. Every registry
// source is stripped on the way out of `readVariant`, so the Code tab, the copy
// button and the AI prompt all serve the same bare file while the checked-in
// component keeps the "why" notes the maintainers need.
//
// Hand-rolled rather than typescript's scanner: the compiler is a devDependency
// and this runs in the request path. The trade is that the machine below has to
// know where a `/` is a comment and where it is division, a regex, a JSX close
// or plain text — hence the frame stack. `scripts/registry/check-strip.ts`
// proves the output is token-identical to the input for every shipped file.

/**
 * Comment bodies that survive: they are instructions to a tool, not prose. A
 * buyer who pastes the file gets the same lint/type behaviour we do.
 */
// Every alternative is anchored to a token no English sentence starts with —
// `global ` was in this list once and swallowed the comment "…can stand down
// from the / global hotkey), but keep Escape-to-close…".
const DIRECTIVE =
  /^\s*(?:eslint[- ]|@ts-(?:ignore|expect-error|nocheck)|prettier-ignore|biome-ignore|webpack[A-Z]|@vite-ignore|[#@]__PURE__|istanbul ignore|[cv]8 ignore|\/\s*<reference)/;

/** Keywords after which a `/` opens a regex and a `<` opens JSX. */
const KEYWORD = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "do",
  "else",
  "yield",
  "await",
  "case",
  "throw",
  "default",
]);

/** Chars after which a `/` opens a regex. */
const REGEX_AFTER = "(,=:[!&|?{};+-*%^~<>";
/** Chars after which a `<` opens a JSX element. `)` and `]` are deliberately out — those read as comparison. */
const JSX_AFTER = "(,=:[{;&|?}>!+-*/%^~";

type Frame =
  /** Statement position. `expr` frames are `{…}` holes — a `}` at depth 0 pops them. */
  | { k: "code"; depth: number; expr: boolean; brace: number; inJsx: boolean }
  /** Inside a template literal, scanning for the closing backtick or a `${`. */
  | { k: "tmpl" }
  /** Between `<Tag` and the `>` that ends the opening tag. */
  | { k: "tag" }
  /** Between an opening tag's `>` and its closing tag — free text, no comments. */
  | { k: "children" };

const ID = /[A-Za-z0-9_$]/;

export function stripComments(source: string): string {
  const removed = mark(source);
  return removed === null ? source : rebuild(source, removed);
}

/**
 * Walk the file once, flagging every char that belongs to a stripped comment.
 * Returns null when the file has none, so the common path copies nothing.
 */
function mark(src: string): Uint8Array | null {
  const flags = new Uint8Array(src.length);
  const stack: Frame[] = [
    { k: "code", depth: 0, expr: false, brace: -1, inJsx: false },
  ];
  let any = false;
  let i = 0;
  // Last significant char and, when that char ended an identifier, the whole
  // word — together they disambiguate `/` and `<`.
  let prev = "";
  let word = "";

  const cut = (start: number, end: number) => {
    flags.fill(1, start, end);
    any = true;
  };

  /** `//…` and `/*…*\/`. Returns the index just past the comment. */
  const comment = (start: number): number => {
    if (src[start + 1] === "/") {
      const nl = src.indexOf("\n", start);
      const end = nl === -1 ? src.length : nl;
      if (!DIRECTIVE.test(src.slice(start + 2, end))) cut(start, end);
      return end;
    }
    const close = src.indexOf("*/", start + 2);
    const end = close === -1 ? src.length : close + 2;
    if (!DIRECTIVE.test(src.slice(start + 2, close === -1 ? end : close))) {
      cut(start, end);
    }
    return end;
  };

  /** Quoted string. Bails at a newline — an unterminated quote is not our problem to widen. */
  const quoted = (start: number): number => {
    const q = src[start];
    let j = start + 1;
    while (j < src.length) {
      const c = src[j];
      if (c === "\\") j += 2;
      else if (c === q || c === "\n") return j + 1;
      else j++;
    }
    return j;
  };

  const regex = (start: number): number => {
    let j = start + 1;
    let klass = false;
    while (j < src.length) {
      const c = src[j];
      if (c === "\\") j += 2;
      else if (c === "\n") return j;
      else if (c === "[") {
        klass = true;
        j++;
      } else if (c === "]") {
        klass = false;
        j++;
      } else if (c === "/" && !klass) {
        j++;
        while (j < src.length && ID.test(src[j])) j++;
        return j;
      } else j++;
    }
    return j;
  };

  const sig = (c: string) => {
    prev = c;
    word = "";
  };

  while (i < src.length) {
    const frame = stack[stack.length - 1];
    const c = src[i];

    if (frame.k === "children") {
      if (c === "{") {
        stack.push({ k: "code", depth: 0, expr: true, brace: i, inJsx: true });
        i++;
      } else if (c === "<" && src[i + 1] === "/") {
        const gt = src.indexOf(">", i);
        i = gt === -1 ? src.length : gt + 1;
        stack.pop();
        sig(">");
      } else if (c === "<" && /[A-Za-z_$>]/.test(src[i + 1] ?? "")) {
        stack.push({ k: "tag" });
        i++;
      } else i++;
      continue;
    }

    if (frame.k === "tmpl") {
      if (c === "\\") i += 2;
      else if (c === "`") {
        stack.pop();
        i++;
        sig("`");
      } else if (c === "$" && src[i + 1] === "{") {
        stack.push({ k: "code", depth: 0, expr: true, brace: i + 1, inJsx: false });
        i += 2;
      } else i++;
      continue;
    }

    if (frame.k === "tag") {
      if (c === '"' || c === "'") i = quoted(i);
      else if (c === "{") {
        stack.push({ k: "code", depth: 0, expr: true, brace: i, inJsx: false });
        i++;
      } else if (c === "/" && src[i + 1] === ">") {
        stack.pop();
        i += 2;
        sig(">");
      } else if (c === "/" && (src[i + 1] === "/" || src[i + 1] === "*")) {
        i = comment(i);
      } else if (c === ">") {
        stack[stack.length - 1] = { k: "children" };
        i++;
      } else i++;
      continue;
    }

    // code frame
    if (ID.test(c)) {
      let j = i;
      while (j < src.length && ID.test(src[j])) j++;
      word = src.slice(i, j);
      prev = src[j - 1];
      i = j;
      continue;
    }
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      i = quoted(i);
      sig(c);
      continue;
    }
    if (c === "`") {
      stack.push({ k: "tmpl" });
      i++;
      continue;
    }
    if (c === "/") {
      const n = src[i + 1];
      if (n === "/" || n === "*") {
        i = comment(i);
        continue;
      }
      if (prev === "" || REGEX_AFTER.includes(prev) || KEYWORD.has(word)) {
        i = regex(i);
        sig("/");
        continue;
      }
      i++;
      sig("/");
      continue;
    }
    if (c === "<") {
      const n = src[i + 1] ?? "";
      const opens =
        (prev === "" || JSX_AFTER.includes(prev) || KEYWORD.has(word)) &&
        /[A-Za-z_$>]/.test(n);
      if (opens) {
        stack.push({ k: "tag" });
        i++;
        continue;
      }
      i++;
      sig("<");
      continue;
    }
    if (c === "{") {
      frame.depth++;
      i++;
      sig("{");
      continue;
    }
    if (c === "}") {
      if (frame.depth === 0 && frame.expr) {
        // A `{…}` in JSX children that held nothing but stripped comments takes
        // its own braces with it — otherwise the file ships a bare `{}`, or the
        // opening and closing braces of a multi-line `{/* … */}` on two lines.
        if (frame.inJsx && any && blank(src, flags, frame.brace + 1, i)) {
          cut(frame.brace, i + 1);
        }
        stack.pop();
        i++;
        sig("}");
        continue;
      }
      if (frame.depth > 0) frame.depth--;
      i++;
      sig("}");
      continue;
    }
    i++;
    sig(c);
  }

  return any ? flags : null;
}

/** True when everything left between `start` and `end` after stripping is whitespace. */
function blank(
  src: string,
  flags: Uint8Array,
  start: number,
  end: number,
): boolean {
  let stripped = false;
  for (let j = start; j < end; j++) {
    if (flags[j]) {
      stripped = true;
      continue;
    }
    if (!/\s/.test(src[j])) return false;
  }
  return stripped;
}

function rebuild(src: string, flags: Uint8Array): string {
  const out: string[] = [];
  let offset = 0;

  for (const line of src.split("\n")) {
    const end = offset + line.length;
    let touched = false;
    let kept = "";
    for (let j = offset; j < end; j++) {
      if (flags[j]) touched = true;
      else kept += src[j];
    }
    offset = end + 1;

    if (!touched) {
      out.push(line);
      continue;
    }
    // A line that held only a comment goes with it; one that held code keeps the
    // code without the whitespace the comment used to sit behind.
    if (kept.trim() === "") continue;
    out.push(kept.replace(/[ \t]+$/, ""));
  }

  // Comment blocks leave holes: a banner at the top, or two blank lines where a
  // paragraph between functions used to be.
  while (out.length > 0 && out[0].trim() === "") out.shift();
  const collapsed: string[] = [];
  for (const line of out) {
    if (line.trim() === "" && collapsed[collapsed.length - 1]?.trim() === "") {
      continue;
    }
    collapsed.push(line);
  }
  while (collapsed.length > 0 && collapsed[collapsed.length - 1].trim() === "") {
    collapsed.pop();
  }
  return collapsed.join("\n") + "\n";
}
