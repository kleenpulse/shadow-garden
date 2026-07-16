import type { ComponentEntry } from "./types";

export type PkgManager = "bun" | "npm" | "pnpm" | "yarn";

export const PKG_MANAGERS: PkgManager[] = ["bun", "npm", "pnpm", "yarn"];

const ADD: Record<PkgManager, string> = {
  bun: "bun add",
  npm: "npm install",
  pnpm: "pnpm add",
  yarn: "yarn add",
};

/** Build the dependency-install command for a package manager. Pure + client-safe;
 *  gating of whether Pro install blocks are shown happens at the render layer. */
export function installCommand(pm: PkgManager, entry: ComponentEntry): string {
  const deps = entry.dependencies ?? [];
  if (deps.length === 0) return `# ${entry.name} needs no extra dependencies`;
  return `${ADD[pm]} ${deps.join(" ")}`;
}
