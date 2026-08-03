import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSource, type SourceFile } from "./source";
import { installCommand } from "./install";
import { formatDefault, typeLabel } from "./kinds";
import { ROLE_TABLE, rolesPresent } from "./roles";
import type { ComponentEntry, PropSchema } from "./types";

// The AI-ready integration brief. Derived, never authored twice: the same
// PropSchema[] that drives the Controls panel and the props table also writes the
// prompt's props section, so a tuned default can't drift out of the brief.
//
// The Pro gate is INHERITED, not re-implemented — getSource() already owns the
// single server-side read seam (§V13), so `locked` and `pending` pass straight
// through. This is also why the prompt text can't live on ComponentEntry: that
// object is imported into client bundles (Sidebar, command groups) and handed
// whole to LiveWorkspace, so every field on it ships to every visitor, free or
// Pro. Nothing here crosses to a client that isn't entitled to the same bytes.

export type PromptResult =
  | { status: "ok"; text: string }
  | { status: "locked" }
  | { status: "pending" };

// Literal root, same reason as source.ts: a computed base defeats Turbopack's
// file trace. Slugs come from the registry so they are trusted, but the shape is
// asserted anyway — one cheap guard beats reasoning about every future caller.
const PROMPTS_ROOT = path.join(process.cwd(), "prompts");
const SLUG = /^[a-z0-9-]+$/;

const SITE = process.env.NEXT_PUBLIC_SITE_URL;

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

/** `<Waves color="#a855f7" amplitude={1.5} />` from the documented defaults. */
function usage(entry: ComponentEntry): string {
  const attr = (prop: PropSchema): string =>
    prop.kind === "number" || prop.kind === "boolean"
      ? `${prop.name}={${String(prop.default)}}`
      : `${prop.name}="${prop.default}"`;

  if (entry.props.length === 0) return `<${entry.name} />`;
  if (entry.props.length <= 3) {
    return `<${entry.name} ${entry.props.map(attr).join(" ")} />`;
  }
  return [
    `<${entry.name}`,
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
      const gated = prop.disabledWhen
        ? ` Ignored while \`${prop.disabledWhen.prop}\` is \`${String(prop.disabledWhen.equals)}\`.`
        : "";
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
  const sections: string[] = [];

  sections.push(
    [
      `# Integrate \`${entry.name}\` from Shadow Garden`,
      "",
      `You are helping me add the **${entry.name}** component to an existing project.`,
      `Everything you need is below — full source, dependencies, props and the`,
      `behavioural contract. Read it all before writing anything.`,
      "",
      `- **Component:** ${entry.name}`,
      `- **Category:** ${entry.category}`,
      `- **Summary:** ${entry.description}`,
      ...(SITE ? [`- **Reference:** ${SITE}/components/${entry.slug}`] : []),
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
          `import ${entry.name} from "@/components/${entry.slug}/${entry.name}";`,
          "",
          usage(entry),
        ].join("\n"),
        "tsx",
      ),
      "",
      "Every value above is the documented default — pass only what you actually want to change.",
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
      "1. Tell me where in my project this should live and why.",
      "2. Create the files above verbatim.",
      "3. Wire the component into the place I point you at, with sensible props for that context.",
      "4. Flag anything in my setup that conflicts with the stack assumptions above.",
      "",
      "Do not restyle the component or alter the animation math unless I ask.",
    ].join("\n"),
  );

  return `${sections.join("\n\n")}\n`;
}

export async function getPrompt(entry: ComponentEntry): Promise<PromptResult> {
  const source = await getSource(entry);
  // No second gate. A locked entry never reached its bytes, and `pending` means
  // an incomplete brief — better to render nothing than to hand out half a file.
  if (source.status !== "ok") return source;

  return {
    status: "ok",
    text: buildPrompt(entry, source.files, await overlay(entry.slug)),
  };
}
