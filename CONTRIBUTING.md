# Contributing to Shadow Garden

Thanks for your interest in contributing. This guide covers how the project is laid out, how to add a component, and what has to pass before a PR merges. For the design tokens, guardrails, and animation footguns, see [CONVENTIONS.md](CONVENTIONS.md).

## Prerequisites

- [Bun](https://bun.sh) 1.2+ (package manager and script runner)
- Node.js 20+ (used by `verify:loop`)

## Getting started

```bash
bun install
bun dev
```

The dev server runs on [http://localhost:3000](http://localhost:3000). Leave it running while you work — but note that `bun run build` and `bun install` both fight the dev server over the `.next` directory, so stop the dev server before running either (see [CONVENTIONS.md](CONVENTIONS.md#build--install)).

## Project structure

| Path | Purpose |
| --- | --- |
| `app/` | Next.js App Router routes, layouts, and the docs shell pages. |
| `components/registry/<slug>/` | The shipped component source plus its `<slug>-preview.tsx` wrapper. |
| `components/registry/previews.ts` | Barrel that lazy-loads every preview (`dynamic`, `ssr:false`). |
| `components/shell/` | The two-pane docs bench chrome (sidebar, workspace, tabs). Not shipped to customers. |
| `components/ui/` | Vendored + restyled shadcn/Radix primitives on bench tokens. |
| `components/icons/` | In-repo SVG icons (brand marks and animated glyphs). |
| `lib/registry/` | The registry: `categories/` holds per-category data, `index.ts` is the barrel, `types.ts` the types. |
| `lib/registry/kinds.ts` | Everything that varies by prop kind (type label, printed default, validation). |
| `hooks/` | Shared hooks, including `use-animation-loop.ts` for animation components. |
| `scripts/` | Build/verify tooling — `gen-readme.ts`, `check-registry.ts`, `registry/`, `verify-loop.mjs`. |

## The registry model

Everything in the catalog is driven by one registry entry per component. Each prop is a single `PropSchema` that drives **both** the Controls panel and the Props API table — you never hand-write props docs twice. Control kinds are `number`, `enum`, `boolean`, and `color`. Array or `ReactNode` props are given tasteful demo values in the Preview wrapper instead of a control.

Registry data is split by category under `lib/registry/categories/` (`backgrounds`, `text-animations`, `micro-interactions`, `power-user-systems`). `index.ts` concatenates them into `registry` and exports the helpers (`getEntry`, `getAllSlugs`, `groupByCategory`, `defaultsFromSchema`). Always import from `@/lib/registry`.

## Adding a component

There is one pattern — don't fork it. To add a component with slug `my-thing`:

1. **Registry entry** — add an entry to the matching `lib/registry/categories/<category>.ts`. Define each tunable prop as a `PropSchema`.
2. **Component** — `components/registry/my-thing/my-thing.tsx` (file names are kebab-case; the exported symbol stays PascalCase, `MyThing`). This is the file that ships to users, so it carries no coupling to the shell (see CONVENTIONS.md).
3. **Preview** — `components/registry/my-thing/my-thing-preview.tsx`, the wrapper the bench renders.
4. **Register the preview** — add it to `components/registry/previews.ts` with `dynamic(..., { ssr: false })`.

No new page or template is needed — the shell renders every entry from the registry.

Additional rules for specific component types:

- **Animation components** (anything with a render loop) drive the loop through `hooks/use-animation-loop.ts` and ship it as a second variant with `role: "hook"`. Raw `requestAnimationFrame` / `new ResizeObserver` inside `components/registry/` fails `check:registry`.
- **Dependencies** — an entry's `dependencies` array is the transitive import closure of every declared variant, and it is customer-facing install instructions. Only `lucide-react` is permitted as an icon dependency. See CONVENTIONS.md for the full rule.

## The check gate

Before opening a PR, run:

```bash
bun run check        # tsc --noEmit + check:registry + check:strip
```

That aggregate runs the three gates a PR must pass:

- `tsc --noEmit` — TypeScript, strict.
- `bun run check:registry` — registry invariants `tsc` can't reach: slug/dir/preview identity, variant files on disk, defaults inside their domain, declared dependencies, and more. If you add a rule, add a matching case to `scripts/registry/selftest.ts` too (`bun run check:registry:selftest`).
- `bun run check:strip` — proves the comment-stripper produces byte-identical tokens for all shipped files.

For an animation component, also run:

```bash
bun run verify:loop <slug>   # counts draw calls over 2s; needs the dev server up
```

And confirm the production build stays PPR-clean (stop the dev server first):

```bash
bun run build
```

## Commit and PR conventions

- **Conventional Commits.** The repo uses `feat(scope): …`, `fix(scope): …`, `refactor(scope): …`, `docs: …`, etc.
- Keep PRs focused. One component or one concern per PR where possible.
- Fill out the PR checklist in the template.

## Releases

Versioning runs on [changesets](https://github.com/changesets/changesets). If your PR changes something user-facing — a component, the shell, the registry model — add a changeset with it:

```bash
bunx changeset
```

Pick the bump (`patch` for fixes, `minor` for features, `major` for breaking changes) and write a sentence aimed at the changelog reader. Pure chores (CI, internal tooling, typos) don't need one.

On merge to `main`, the Release workflow gathers pending changesets into a "Version Packages" PR. Merging that PR bumps the version, updates `CHANGELOG.md`, tags `shadow-garden@x.y.z`, and cuts a GitHub Release. Maintainers merge the version PR; contributors only ever add changesets.

## Asking for help

Open an issue using the bug or component-request template, or start a discussion. Please include your OS, browser, and Bun/Node versions when reporting a bug.
