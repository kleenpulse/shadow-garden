import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registry } from "../../lib/registry/index";
import type { CheckContext, PreviewReads } from "./check";
import { parsePreviewRegistrations, parseValueReads } from "./read-keys";

// The one place the check touches disk. Everything the rules need arrives here so
// the rules themselves stay pure. lib/registry/index.ts and categories/*.ts are
// pure data with relative imports and no framework edges, which is what makes
// this runnable under plain `bun` — the same seam scripts/gen-readme.ts uses.

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function buildContext(): CheckContext {
  const registryDir = path.join(ROOT, "components", "registry");

  const dirs = new Set(
    readdirSync(registryDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name),
  );

  const pkg = JSON.parse(
    readFileSync(path.join(ROOT, "package.json"), "utf8"),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const packageDeps = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]);

  // previews.ts can't be imported — it is "use client" and calls next/dynamic —
  // so the registrations are read statically. The specifier doubles as the path
  // to the preview module, which is where the `values.*` reads live.
  const registrations = parsePreviewRegistrations(
    readFileSync(path.join(registryDir, "previews.ts"), "utf8"),
  );

  const readsCache = new Map<string, PreviewReads>();

  function previewReads(slug: string): PreviewReads {
    const cached = readsCache.get(slug);
    if (cached) return cached;

    const empty = { keys: new Set<string>(), dynamicAccess: false };
    const specifier = registrations.get(slug);
    let result: PreviewReads;

    if (specifier === undefined) {
      result = { registered: false, found: false, ...empty };
    } else {
      const file = resolvePreview(registryDir, specifier);
      result =
        file === null
          ? { registered: true, found: false, ...empty }
          : {
              registered: true,
              found: true,
              ...parseValueReads(file, readFileSync(file, "utf8")),
            };
    }

    readsCache.set(slug, result);
    return result;
  }

  return {
    registry,
    dirs,
    // Registry paths are always forward-slashed; split so this works on Windows.
    fileExists: (relative) =>
      existsSync(path.join(ROOT, ...relative.split(/[\\/]/))),
    packageDeps,
    previewKeys: new Set(registrations.keys()),
    previewReads,
  };
}

/** `./threads/ThreadsPreview` → the .tsx (or .ts) file it resolves to. */
function resolvePreview(registryDir: string, specifier: string): string | null {
  const base = path.join(registryDir, ...specifier.replace(/^\.\//, "").split("/"));
  for (const ext of [".tsx", ".ts"]) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
}
