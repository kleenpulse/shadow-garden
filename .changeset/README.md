# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets); the files in it declare pending release notes.

If your PR changes something user-facing (a component, the shell, the registry model), add a changeset alongside it:

```bash
bunx changeset
```

Pick the bump (`patch` for fixes, `minor` for features, `major` for breaking changes to the registry model or component APIs) and write a sentence or two aimed at someone reading the changelog — what changed and why they'd care.

On merge to `main`, the Release workflow collects pending changesets into a "Version Packages" PR. Merging that PR bumps `package.json`, rewrites `CHANGELOG.md`, tags `shadow-garden@x.y.z`, and publishes a GitHub Release. Nothing is published to npm — the tag and the release notes are the artifact.
