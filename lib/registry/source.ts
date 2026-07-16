import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { highlightToHtml } from "@/lib/shiki";
import { getEntitlement } from "./entitlement";
import type { ComponentEntry } from "./types";

// Static base dir so Turbopack scopes its file trace to the registry sources
// (which must ship for runtime Pro reads) instead of the whole project.
const REGISTRY_ROOT = path.join(process.cwd(), "components", "registry");

export type SourceResult =
  | { status: "ok"; html: string; raw: string; lang: string }
  | { status: "locked" }
  | { status: "pending" };

// The Pro gate lives here: the canonical source file's bytes are read server-side
// and returned only when the caller is entitled. For a locked Pro component the
// raw source is never serialized to the client — only a `locked` marker crosses.
export async function getSource(entry: ComponentEntry): Promise<SourceResult> {
  if (entry.tier === "pro") {
    const { pro } = await getEntitlement();
    if (!pro) return { status: "locked" };
  }

  const variant = entry.variants[0];
  if (!variant) return { status: "pending" };

  const relative = variant.file.replace(/^components[\\/]registry[\\/]/, "");
  let raw: string;
  try {
    raw = await readFile(path.join(REGISTRY_ROOT, relative), "utf8");
  } catch {
    // Source file not dropped in yet — the preview spine still works.
    return { status: "pending" };
  }

  const lang = variant.lang === "ts" ? "tsx" : "jsx";
  const html = await highlightToHtml(raw, lang);
  return { status: "ok", html, raw, lang };
}
