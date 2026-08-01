import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registry } from "../../lib/registry/index";
import type { CheckContext, EntryImports, PreviewReads } from "./check";
import { parsePreviewRegistrations, parseValueReads } from "./read-keys";
import { parseSourceDefaults, type SourceDefault } from "./source-defaults";
import { parseLoopUsage, type LoopUsage } from "./loop-usage";
import { parseImports, type Specifier } from "./imports";

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

    const empty = {
      keys: new Set<string>(),
      dynamicAccess: false,
      usesPaused: false,
    };
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

  const defaultsCache = new Map<string, Map<string, SourceDefault> | null>();

  function sourceDefaults(slug: string): Map<string, SourceDefault> | null {
    if (defaultsCache.has(slug)) return defaultsCache.get(slug) ?? null;

    const entry = registry.find((e) => e.slug === slug);
    const file = entry?.variants[0]?.file;
    let result: Map<string, SourceDefault> | null = null;

    if (file) {
      const abs = path.join(ROOT, ...file.split(/[\\/]/));
      if (existsSync(abs)) {
        result = parseSourceDefaults(abs, readFileSync(abs, "utf8"));
      }
    }

    defaultsCache.set(slug, result);
    return result;
  }

  const usageCache = new Map<string, LoopUsage | null>();

  function loopUsage(slug: string): LoopUsage | null {
    if (usageCache.has(slug)) return usageCache.get(slug) ?? null;

    const entry = registry.find((e) => e.slug === slug);
    // Only the component itself — the peer hook variant is the host, and it
    // legitimately owns both primitives.
    const variant = entry?.variants.find((v) => (v.role ?? "component") === "component");
    let result: LoopUsage | null = null;

    if (variant) {
      const abs = path.join(ROOT, ...variant.file.split(/[\\/]/));
      if (existsSync(abs)) {
        result = parseLoopUsage(abs, readFileSync(abs, "utf8"));
      }
    }

    usageCache.set(slug, result);
    return result;
  }

  // Parsed once per FILE, not once per entry that reaches it: lib/utils.ts is in
  // 37 closures and the animation host in 24, so without this the same two files
  // are re-parsed sixty-odd times per run.
  const fileImportsCache = new Map<string, Specifier[]>();

  function fileImports(abs: string): Specifier[] {
    const cached = fileImportsCache.get(abs);
    if (cached) return cached;
    const parsed = parseImports(abs, readFileSync(abs, "utf8"));
    fileImportsCache.set(abs, parsed);
    return parsed;
  }

  const importsCache = new Map<string, EntryImports | null>();

  function entryImports(slug: string): EntryImports | null {
    if (importsCache.has(slug)) return importsCache.get(slug) ?? null;

    const entry = registry.find((e) => e.slug === slug);
    const seeds = (entry?.variants ?? [])
      .map((v) => toRelative(v.file))
      .filter((rel) => existsSync(abs(rel)));

    let result: EntryImports | null = null;

    if (seeds.length > 0) {
      const packages = new Set<string>();
      const files = new Set<string>();
      const via = new Map<string, string>();
      const unresolved: EntryImports["unresolved"] = [];

      // BFS from every variant, not just variants[0] — a peer file is shipped
      // too, so whatever it imports is equally the customer's problem.
      const seen = new Set(seeds);
      const queue = [...seeds];

      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const spec of fileImports(abs(current))) {
          if (spec.kind === "package") {
            packages.add(spec.name);
            continue;
          }

          const target = resolveImport(current, spec);
          if (target === null) {
            unresolved.push({ raw: spec.raw, from: current });
            continue;
          }
          if (seen.has(target)) continue;

          seen.add(target);
          via.set(target, current);
          // Seeds are the declared variants; everything else is a file the entry
          // reaches but has not necessarily declared.
          files.add(target);
          queue.push(target);
        }
      }

      result = { packages, files, via, unresolved };
    }

    importsCache.set(slug, result);
    return result;
  }

  // Optional directory — a repo with no overlays authored yet is perfectly valid.
  const promptsDir = path.join(ROOT, "prompts");
  const promptOverlays = new Set(
    existsSync(promptsDir)
      ? readdirSync(promptsDir)
          .filter((name) => name.endsWith(".md"))
          .map((name) => name.slice(0, -".md".length))
      : [],
  );

  return {
    registry,
    dirs,
    // Registry paths are always forward-slashed; split so this works on Windows.
    fileExists: (relative) =>
      existsSync(path.join(ROOT, ...relative.split(/[\\/]/))),
    packageDeps,
    previewKeys: new Set(registrations.keys()),
    previewReads,
    sourceDefaults,
    loopUsage,
    entryImports,
    promptOverlays,
  };
}

/** Registry paths are forward-slashed; disk paths are not, on Windows. */
function abs(relative: string): string {
  return path.join(ROOT, ...relative.split("/"));
}

/** Whatever a registry entry wrote → the canonical forward-slashed repo-relative form. */
function toRelative(file: string): string {
  return file.split(/[\\/]/).join("/");
}

/**
 * The extension ladder Next and tsconfig's `"@/*": ["./*"]` resolve through.
 * Order matters — a directory holding both `index.tsx` and a sibling `index.ts`
 * would otherwise resolve differently here than in the real build.
 */
const EXTENSIONS = ["", ".tsx", ".ts", "/index.tsx", "/index.ts"];

/**
 * Resolve one specifier against the file that imported it, returning a
 * repo-relative path or `null` if nothing on disk matches. `@/x` maps to `x`
 * from the repo root, which is what the tsconfig alias does.
 */
function resolveImport(from: string, spec: Specifier): string | null {
  const base =
    spec.kind === "alias"
      ? spec.raw.slice(2)
      : path.posix.join(path.posix.dirname(from), spec.raw);

  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    const target = abs(candidate);
    // `existsSync` is true for directories too — a bare `./store` must not
    // resolve to the directory itself, only to its index file.
    if (existsSync(target) && statSync(target).isFile()) return candidate;
  }
  return null;
}

/** `./threads/ThreadsPreview` → the .tsx (or .ts) file it resolves to. */
function resolvePreview(registryDir: string, specifier: string): string | null {
  const base = path.join(registryDir, ...specifier.replace(/^\.\//, "").split("/"));
  for (const ext of [".tsx", ".ts"]) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
}
