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
  // "no npm packages", not "no extra dependencies": an entry with zero packages
  // can still ship peer files, and InstallBlock renders that manifest directly
  // below this line. The broader claim would contradict it (§B15).
  if (deps.length === 0) return `# ${entry.name} needs no npm packages`;
  return `${ADD[pm]} ${deps.join(" ")}`;
}
