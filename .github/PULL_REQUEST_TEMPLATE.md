<!-- Thanks for contributing! Keep the description short and to the point. -->

## What & why

<!-- What does this PR change, and why? Link any related issue (Fixes #123). -->

## Checklist

- [ ] `bun run check` passes (`tsc --noEmit`, `check:registry`, `check:strip`)
- [ ] For a new/changed component: registry entry, component file, preview, and `previews.ts` registration are all in place
- [ ] For an animation component: it drives its loop through `hooks/use-animation-loop.ts` and passes `bun run verify:loop <slug>`
- [ ] Commits follow Conventional Commits (`feat(scope): …`)
- [ ] No hardcoded `bench-950`/white/black on themed surfaces; used semantic tokens

See [CONTRIBUTING.md](../CONTRIBUTING.md) and [CONVENTIONS.md](../CONVENTIONS.md) for details.
