import "server-only";
import { cache } from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { highlightToHtml } from "@/lib/shiki";
import { getEntitlement } from "./entitlement";
import type { ComponentEntry, Variant } from "./types";

// Static base dirs so Turbopack scopes its file trace to the directories whose
// sources must ship for runtime Pro reads, instead of the whole project. These
// must stay literal — a computed root defeats the trace.
//
// Two roots, not one: since §C1b an entry may carry a second variant pointing at
// hooks/use-animation-loop.ts, the runtime host the customer copies alongside
// the component. Anything outside these roots resolves to `pending` rather than
// escaping, and the resolved path is re-checked against its root so a `..` in a
// registry entry cannot read arbitrary files.
const REGISTRY_ROOT = path.join(process.cwd(), "components", "registry");
const HOOKS_ROOT = path.join(process.cwd(), "hooks");

const ROOTS: ReadonlyArray<{ prefix: RegExp; dir: string }> = [
  { prefix: /^components[\\/]registry[\\/]/, dir: REGISTRY_ROOT },
  { prefix: /^hooks[\\/]/, dir: HOOKS_ROOT },
];

export interface SourceFile {
  /** Repo-relative path, shown as the tab label / filename. */
  file: string;
  label: string;
  role: "component" | "hook";
  html: string;
  raw: string;
  lang: string;
}

export type SourceResult =
  | { status: "ok"; files: SourceFile[] }
  | { status: "locked" }
  | { status: "pending" };

/** Resolve a repo-relative variant path inside one of the allowed roots. */
function resolveInRoot(file: string): string | null {
  for (const { prefix, dir } of ROOTS) {
    if (!prefix.test(file)) continue;
    const relative = file.replace(prefix, "");
    const absolute = path.join(dir, relative);
    // Re-check after normalisation: `..` segments must not climb out.
    if (absolute !== dir && !absolute.startsWith(dir + path.sep)) return null;
    return absolute;
  }
  return null;
}

async function readVariant(variant: Variant): Promise<SourceFile | null> {
  const absolute = resolveInRoot(variant.file);
  if (absolute === null) return null;

  let raw: string;
  try {
    raw = await readFile(absolute, "utf8");
  } catch {
    // Source file not dropped in yet — the preview spine still works.
    return null;
  }

  const lang = variant.lang === "ts" ? "tsx" : "jsx";
  return {
    file: variant.file,
    label: variant.label ?? (variant.file.split("/").pop() ?? variant.file),
    role: variant.role ?? "component",
    html: await highlightToHtml(raw, lang),
    raw,
    lang,
  };
}

// The Pro gate lives here: the canonical source bytes are read server-side and
// returned only when the caller is entitled. For a locked Pro component nothing
// but a `locked` marker crosses to the client. One gate per entry — a peer hook
// is part of the same purchase, not separately gated.
async function readSource(entry: ComponentEntry): Promise<SourceResult> {
  if (entry.tier === "pro") {
    const { pro } = await getEntitlement();
    if (!pro) return { status: "locked" };
  }

  const files: SourceFile[] = [];
  for (const variant of entry.variants) {
    const file = await readVariant(variant);
    if (file) files.push(file);
  }

  // The component itself is variants[0]; without it there is nothing to show,
  // even if a peer hook resolved.
  if (files.length === 0 || files[0]?.role !== "component") {
    return { status: "pending" };
  }

  return { status: "ok", files };
}

// Request-scoped memo. The Code panel and the AI prompt both need the same bytes
// on the same page, and Shiki highlighting is the expensive half — without this
// every component page pays for it twice. Keyed on the entry reference, which is
// stable: `registry` is a module singleton, so getEntry(slug) hands both callers
// the same object.
export const getSource = cache(readSource);
