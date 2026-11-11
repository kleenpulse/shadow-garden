/**
 * Shared by setup.ts and score.ts: the task battery, where runs live, and the
 * fixture project every task starts from.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PropValue } from "../../lib/registry/types";

export const REPO_ROOT = process.cwd();

// Runs live OUTSIDE the repo on purpose. An agent working inside the repo could
// read the real component files and the registry instead of the brief, which
// would measure the repo, not the brief.
export const OUT_ROOT =
  process.env.VIBE_OUT ?? path.join(os.tmpdir(), "motion-garden-vibe");

export interface Task {
  id: string;
  /** Registry slug of the component under test. */
  slug: string;
  /** What makes this task different from the others. For the report only. */
  shape: string;
  /** The request, in a customer's words. The ONLY task text the agent sees. */
  prompt: string;
  /** Prop values the prompt asks for. Scoring only — never shown to the agent. */
  expect: Array<{ prop: string; equals: PropValue }>;
}

export function loadTasks(): Task[] {
  const file = path.join(REPO_ROOT, "scripts", "vibe", "tasks.json");
  return JSON.parse(readFileSync(file, "utf8")) as Task[];
}

/** The newest run under OUT_ROOT, or the directory passed on the command line. */
export function resolveRun(arg: string | undefined): string {
  if (arg) return path.resolve(arg);
  const runs = readdirSync(OUT_ROOT)
    .map((name) => path.join(OUT_ROOT, name))
    .filter((dir) => statSync(dir).isDirectory())
    .sort();
  const latest = runs.at(-1);
  if (!latest) throw new Error(`No runs in ${OUT_ROOT}. Run vibe:setup first.`);
  return latest;
}

export const FIXTURE_PAGE = `export default function Page() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <section id="hero" className="relative">
        <h1 className="text-4xl font-semibold">Northwind Analytics</h1>
        <p className="mt-3 text-neutral-500">
          Dashboards your finance team will actually open.
        </p>
      </section>

      <section id="pricing" className="mt-24">
        <h2 className="text-2xl font-semibold">Pricing</h2>
        <p className="mt-2 text-neutral-500">From $29 a month.</p>
      </section>

      <footer id="footer" className="mt-24 text-sm text-neutral-500">
        © Northwind Analytics
      </footer>
    </main>
  );
}
`;

const FIXTURE_LAYOUT = `import type { ReactNode } from "react";
import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;

const FIXTURE_TSCONFIG = {
  compilerOptions: {
    target: "ES2017",
    lib: ["dom", "dom.iterable", "esnext"],
    skipLibCheck: true,
    strict: true,
    noEmit: true,
    esModuleInterop: true,
    module: "esnext",
    moduleResolution: "bundler",
    resolveJsonModule: true,
    isolatedModules: true,
    jsx: "react-jsx",
    paths: { "@/*": ["./*"] },
  },
  include: ["**/*.ts", "**/*.tsx"],
  exclude: ["node_modules"],
};

/** Packages a fresh Next + Tailwind project already has. Versions come from the
    repo so the fixture never claims a version the junctioned node_modules lacks. */
const FIXTURE_DEPS = ["next", "react", "react-dom"];
const FIXTURE_DEV_DEPS = [
  "typescript",
  "tailwindcss",
  "@tailwindcss/postcss",
  "@types/node",
  "@types/react",
  "@types/react-dom",
];

export function fixtureFiles(): Record<string, string> {
  const repo = JSON.parse(
    readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const versions = { ...repo.devDependencies, ...repo.dependencies };
  const pick = (names: string[]) =>
    Object.fromEntries(
      names.filter((name) => versions[name]).map((name) => [name, versions[name]]),
    );

  return {
    "package.json": `${JSON.stringify(
      {
        name: "northwind-site",
        private: true,
        dependencies: pick(FIXTURE_DEPS),
        devDependencies: pick(FIXTURE_DEV_DEPS),
      },
      null,
      2,
    )}\n`,
    "tsconfig.json": `${JSON.stringify(FIXTURE_TSCONFIG, null, 2)}\n`,
    "app/globals.css": `@import "tailwindcss";\n`,
    "app/layout.tsx": FIXTURE_LAYOUT,
    "app/page.tsx": FIXTURE_PAGE,
  };
}

/** What every task's TASK.md says around the prompt. Identical for all tasks. */
export function taskFile(prompt: string): string {
  return [
    "# Task",
    "",
    prompt,
    "",
    "The integration brief I copied from the component's page is in `BRIEF.md`.",
    "",
    "## Limits",
    "",
    "- Work only inside this folder.",
    "- You cannot install packages or run commands here. If the project needs a",
    "  new package, add it to `package.json` and I will install it.",
    "",
  ].join("\n");
}
