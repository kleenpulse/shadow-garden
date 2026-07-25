import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registry } from "../../lib/registry/index";
import type { CheckContext } from "./check";

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

  return {
    registry,
    dirs,
    // Registry paths are always forward-slashed; split so this works on Windows.
    fileExists: (relative) =>
      existsSync(path.join(ROOT, ...relative.split(/[\\/]/))),
    packageDeps,
  };
}
