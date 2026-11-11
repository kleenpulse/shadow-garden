/**
 * Vibe test, step 1 of 3: lay out one fixture project per task.
 *
 *   bun run vibe:setup                 # all tasks
 *   bun run vibe:setup bg-waves micro-dial
 *
 * Each task folder holds a small Next + Tailwind project, TASK.md (the request)
 * and BRIEF.md — the exact text the "Copy for Agent" button produces, built by
 * the same getPrompt() the site calls. Step 2 is an agent working in each
 * folder; step 3 is score.ts. See README.md for the rules that keep it honest.
 *
 * Needs `--conditions=react-server` (the package script sets it): prompt.ts and
 * source.ts import `server-only` and React's `cache`.
 */
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getEntry } from "../../lib/registry/index";
import { getPrompt } from "../../lib/registry/prompt";
import { OUT_ROOT, REPO_ROOT, fixtureFiles, loadTasks, taskFile } from "./shared";

const only = process.argv.slice(2);
const all = loadTasks();
const unknown = only.filter((id) => !all.some((task) => task.id === id));
if (unknown.length > 0) {
  console.error(`Unknown task id: ${unknown.join(", ")}`);
  process.exit(1);
}
const tasks = only.length > 0 ? all.filter((task) => only.includes(task.id)) : all;

const run = path.join(
  OUT_ROOT,
  new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19),
);
mkdirSync(run, { recursive: true });

// Packages resolve by walking up from the task folder, so one junction at the
// run root stands in for an install. A junction, not a symlink: Windows creates
// one without admin rights, and other platforms ignore the type.
symlinkSync(
  path.join(REPO_ROOT, "node_modules"),
  path.join(run, "node_modules"),
  "junction",
);

for (const task of tasks) {
  const entry = getEntry(task.slug);
  if (!entry) throw new Error(`${task.id}: no registry entry "${task.slug}"`);

  const brief = await getPrompt(entry);
  if (brief.status !== "ok") {
    throw new Error(`${task.id}: brief for "${task.slug}" is ${brief.status}`);
  }

  const dir = path.join(run, task.id);
  const files = {
    ...fixtureFiles(),
    "TASK.md": taskFile(task.prompt),
    "BRIEF.md": brief.text,
  };
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(dir, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

writeFileSync(
  path.join(run, "run.json"),
  `${JSON.stringify({ tasks: tasks.map((task) => task.id) }, null, 2)}\n`,
);

console.log(`Run: ${run}`);
for (const task of tasks) console.log(`  ${path.join(run, task.id)}`);
console.log("\nNext: one agent per folder (see scripts/vibe/README.md), then vibe:score.");
