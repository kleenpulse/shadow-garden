import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSource, type SourceFile } from "./source";
import { installCommand } from "./install";
import { formatDefault, typeLabel } from "./kinds";
import { ROLE_TABLE, rolesPresent } from "./roles";
import { tokenCss, tokensUsed, usesDisplayFont, usesTokens } from "./bench-tokens";
import type { ComponentEntry, PropSchema } from "./types";
import { SITE_URL } from "@/lib/site";

// The AI-ready integration brief. Derived, never authored twice: the same
// PropSchema[] that drives the Controls panel and the props table also writes the
// prompt's props section, so a tuned default can't drift out of the brief.
//
// The read seam is INHERITED, not re-implemented — getSource() already owns the
// single server-side read, so `pending` passes straight through.

export type PromptResult =
  | { status: "ok"; text: string }
  | { status: "pending" };

// Literal root, same reason as source.ts: a computed base defeats Turbopack's
// file trace. Slugs come from the registry so they are trusted, but the shape is
// asserted anyway — one cheap guard beats reasoning about every future caller.
const PROMPTS_ROOT = path.join(process.cwd(), "prompts");
const SLUG = /^[a-z0-9-]+$/;

/**
 * A fence long enough to survive the content. Component source is TSX and rarely
 * holds backticks, but an overlay or a template literal can, and a three-backtick
 * fence around text containing three backticks silently truncates the block.
 */
function fence(text: string): string {
  const longest = (text.match(/`+/g) ?? []).reduce(
    (max, run) => Math.max(max, run.length),
    0,
  );
  return "`".repeat(Math.max(3, longest + 1));
}

function block(text: string, lang = ""): string {
  const bars = fence(text);
  return `${bars}${lang}\n${text.replace(/\s+$/, "")}\n${bars}`;
}

/**
 * The import that actually resolves, read off the shipped component file. The
 * path is the file's own path and the binding is whatever the file exports — a
 * handful of entries have no default export, and `entry.name` is a display name
 * that can hold a space ("Shard Orbit"), which is not an identifier.
 */
function componentImport(
  entry: ComponentEntry,
  component: SourceFile,
): { statement: string; tag: string } {
  const from = `"@/${component.file.replace(/\.tsx?$/, "")}"`;
  const fallback = entry.name.replace(/\s+/g, "");

  const byDefault =
    component.raw.match(/^export default (?:async )?function\s+(\w+)/m) ??
    component.raw.match(/^export default (\w+)\s*;?\s*$/m);
  if (byDefault) {
    return { statement: `import ${byDefault[1]} from ${from};`, tag: byDefault[1] };
  }

  const named = [...component.raw.matchAll(/^export (?:function|const)\s+(\w+)/gm)].map(
    (match) => match[1],
  );
  const tag =
    named.find((name) => name.toLowerCase() === fallback.toLowerCase()) ??
    named[0] ??
    fallback;
  return { statement: `import { ${tag} } from ${from};`, tag };
}

/** `<Waves color="#a855f7" amplitude={1.5} />` from the documented defaults. */
function usage(entry: ComponentEntry, tag: string): string {
  const attr = (prop: PropSchema): string =>
    prop.kind === "number" || prop.kind === "boolean"
      ? `${prop.name}={${String(prop.default)}}`
      : `${prop.name}="${prop.default}"`;

  if (entry.props.length === 0) return `<${tag} />`;
  if (entry.props.length <= 3) {
    return `<${tag} ${entry.props.map(attr).join(" ")} />`;
  }
  return [
    `<${tag}`,
    ...entry.props.map((prop) => `  ${attr(prop)}`),
    "/>",
  ].join("\n");
}

function propsTable(entry: ComponentEntry): string {
  if (entry.props.length === 0) {
    return "This component takes no tunable props.";
  }
  return [
    "| Prop | Type | Default | Description |",
    "| --- | --- | --- | --- |",
    ...entry.props.map((prop) => {
      const range =
        prop.kind === "number"
          ? ` Range ${prop.min}–${prop.max}${prop.unit ? ` ${prop.unit}` : ""}.`
          : "";
      const gate = prop.disabledWhen;
      const gated = !gate
        ? ""
        : "equals" in gate
          ? ` Ignored while \`${gate.prop}\` is \`${String(gate.equals)}\`.`
          : ` Ignored unless \`${gate.prop}\` is \`${String(gate.notEquals)}\`.`;
      // Escape pipes so a description can't break the table.
      const description = `${prop.description}${range}${gated}`.replace(
        /\|/g,
        "\\|",
      );
      return `| \`${prop.name}\` | \`${typeLabel(prop)}\` | \`${formatDefault(prop)}\` | ${description} |`;
    }),
  ].join("\n");
}

/**
 * The behavioural contract an LLM cannot infer from the source alone, plus the
 * ones it can but routinely drops on the floor. Conditional on what the entry and
 * its bytes actually declare — a component with no drag surface should not be
 * lectured about touch-action.
 */
function rules(entry: ComponentEntry, files: SourceFile[]): string[] {
  const all = files.map((file) => file.raw).join("\n");
  const out: string[] = [];

  if (/^\s*["']use client["']/.test(files[0]?.raw ?? "")) {
    out.push(
      "Keep the `\"use client\"` directive. This is a client component and will not render as a Server Component.",
    );
  }
  out.push(
    "It fills its parent. Give the wrapper an explicit height (or a definite grid area) — against a height-auto parent it collapses to nothing.",
  );
  if (all.includes("reducedMotion")) {
    out.push(
      "It takes a `reducedMotion` prop and quiesces when true. Wire it to a `prefers-reduced-motion` listener rather than hardcoding `false`.",
    );
  }
  if (entry.pausable) {
    out.push(
      "It runs a free-running animation loop. Halt it when off-screen or backgrounded if you care about battery.",
    );
  }
  if (all.includes("touch-none") || all.includes("touch-action")) {
    out.push(
      "The `touch-action: none` on the hit target is load-bearing — without it a finger drag scrolls the page instead of driving the effect. Do not strip it as a stray utility class.",
    );
  }
  // One contract line per role actually shipped, in ROLE_TABLE order — reading
  // the order off the table rather than off `files` keeps the prompt byte-stable
  // between entries that happen to declare their variants in a different order.
  for (const role of rolesPresent(files.map((file) => file.role))) {
    const { contract } = ROLE_TABLE[role];
    if (contract) out.push(contract);
  }
  if (all.includes("WEBGL_lose_context") || all.includes("getContext")) {
    out.push(
      "It owns a GPU/canvas context and releases it on unmount. Preserve the cleanup return — leaking contexts kills the tab after a few navigations.",
    );
  }
  return out;
}

/** `prompts/<slug>.md`, when the author wrote one. Absent is the normal case. */
async function overlay(slug: string): Promise<string | null> {
  if (!SLUG.test(slug)) return null;
  try {
    const text = await readFile(path.join(PROMPTS_ROOT, `${slug}.md`), "utf8");
    return text.trim() || null;
  } catch {
    return null;
  }
}

function buildPrompt(
  entry: ComponentEntry,
  files: SourceFile[],
  notes: string | null,
): string {
  const deps = installCommand("bun", entry);
  const tokens = tokensUsed(files.map((file) => file.raw));
  const component = componentImport(entry, files[0]);
  const sections: string[] = [];

  sections.push(
    [
      `# Integrate \`${entry.name}\` from Motion Garden`,
      "",
      `You are helping me add the **${entry.name}** component to an existing project.`,
      `Everything you need is below — full source, dependencies, props and the`,
      `behavioural contract. Read it all before writing anything.`,
      "",
      `- **Component:** ${entry.name}`,
      `- **Category:** ${entry.category}`,
      `- **Summary:** ${entry.description}`,
      `- **Reference:** ${SITE_URL}/components/${entry.slug}`,
      `- **Full catalog (for you, the agent):** ${SITE_URL}/llms.txt`,
    ].join("\n"),
  );

  sections.push(
    [
      "## Stack this source assumes",
      "",
      "- React 19 with the Next.js App Router (never the `pages/` directory)",
      "- TypeScript, strict",
      "- Tailwind CSS v4, CSS-first config (utilities are inline; no `tailwind.config` needed)",
      "",
      "If my project differs, adapt the integration — but do not rewrite the animation math to suit a different stack. Ask me first.",
    ].join("\n"),
  );

  sections.push(["## Dependencies", "", block(deps, "bash")].join("\n"));

  if (usesTokens(tokens)) {
    sections.push(
      [
        "## Design tokens this source uses",
        "",
        "Some classes in the source are Motion Garden theme tokens, not stock Tailwind (`text-ink`, `bg-panel`, `font-display` and the like). Without them, parts of the component render unstyled. Add this to my global CSS, after the Tailwind import:",
        "",
        block(tokenCss(tokens), "css"),
        "",
        "The values are Motion Garden's own light and dark themes. If my project already has tokens for these roles, point the `--sg-*` variables at mine instead and tell me which you mapped. `.dark` assumes class-based dark mode — adapt the selector to how my project switches themes.",
        ...(usesDisplayFont(tokens)
          ? [
              "",
              "`font-display` expects Space Mono, and this CSS only names it. Load the font (with `next/font/google`, for example) or put my own display face first in the stack; until then it falls back to the system monospace.",
            ]
          : []),
      ].join("\n"),
    );
  }

  sections.push(
    [
      "## Files to create",
      "",
      `${files.length === 1 ? "One file." : `${files.length} files — all of them are required.`} Paths are as shipped; the component may live anywhere in my project, but keep every peer file at the exact path shown so the import aliases resolve.`,
      "",
      ...files.map((file, i) =>
        [
          `### ${i + 1}. \`${file.file}\`${ROLE_TABLE[file.role].promptSuffix}`,
          "",
          block(file.raw, file.lang),
          "",
        ].join("\n"),
      ),
    ].join("\n"),
  );

  sections.push(["## Props", "", propsTable(entry)].join("\n"));

  sections.push(
    [
      "## Usage",
      "",
      block(
        [
          component.statement,
          "",
          usage(entry, component.tag),
        ].join("\n"),
        "tsx",
      ),
      "",
      "The import path matches the file path above; change it if you move the component. Every value shown is the documented default — pass only what you actually want to change. The snippet lists the tunable props only: if the component's props type in the source requires others (content, handlers, data), pass those too.",
    ].join("\n"),
  );

  const contract = rules(entry, files);
  if (contract.length > 0) {
    sections.push(
      [
        "## Integration rules",
        "",
        ...contract.map((rule) => `- ${rule}`),
      ].join("\n"),
    );
  }

  if (notes) {
    sections.push(["## Component-specific notes", "", notes].join("\n"));
  }

  sections.push(
    [
      "## Your task",
      "",
      ...[
        "Tell me where in my project this should live and why.",
        "Create the files above verbatim.",
        ...(usesTokens(tokens)
          ? ["Add the design tokens to my global CSS, or map them to tokens I already have."]
          : []),
        "Wire the component into the place I point you at, with sensible props for that context.",
        "Flag anything in my setup that conflicts with the stack assumptions above.",
      ].map((step, i) => `${i + 1}. ${step}`),
      "",
      "Do not restyle the component or alter the animation math unless I ask.",
    ].join("\n"),
  );

  return `${sections.join("\n\n")}\n`;
}

export async function getPrompt(entry: ComponentEntry): Promise<PromptResult> {
  const source = await getSource(entry);
  // `pending` means an incomplete brief — better to render nothing than to hand out half a file.
  if (source.status !== "ok") return source;

  return {
    status: "ok",
    text: buildPrompt(entry, source.files, await overlay(entry.slug)),
  };
}
