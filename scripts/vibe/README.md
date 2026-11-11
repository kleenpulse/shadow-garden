# Vibe test

Measures whether the "Copy for Agent" brief works: an agent gets a small
project, a one-line request and the brief, and the result is scored
mechanically. The idea comes from the vibe tests in Meta's Astryx design
system; this is a much smaller version of it.

`check:registry` proves the registry is consistent. This proves something the
checks cannot see: that an agent following the brief ends up with working code.

## Run it

```bash
bun run vibe:setup                    # all ten tasks
bun run vibe:setup bg-waves micro-dial   # or only some
```

Setup prints one folder per task, under your temp directory (set `VIBE_OUT` to
move it). Then give each folder to its own agent, with this prompt and nothing
else:

```text
You are a coding agent working in the project at <folder>

Read TASK.md in that folder and do what it asks. Do not read or write anything
outside that folder. When you are done, reply with a short summary of what you did.
```

In Claude Code, `/vibe-test` does this step for you. When every agent has
finished:

```bash
bun run vibe:score                    # newest run
bun run vibe:score <run-folder>
```

## What is scored

| Check    | Passes when                                                                                   |
| -------- | --------------------------------------------------------------------------------------------- |
| `copied` | Every shipped file exists somewhere in the project, unchanged (whitespace, quotes and import paths may differ). |
| `types`  | `tsc --noEmit` passes on the project.                                                         |
| `wired`  | The component is rendered, and `app/page.tsx` was changed.                                    |
| `props`  | Literal prop values are inside the schema's range or options, and the values the request asked for are passed. |
| `deps`   | Every package the project imports is listed in `package.json`.                                |
| `motion` | When the brief carries the reduced-motion rule, `reducedMotion` is passed and is not a hardcoded literal. Otherwise `-`. |
| `tokens` | When the source uses bench theme tokens (`text-ink`, `bg-panel`, …) or the custom scrollbar utilities, the project's CSS defines every one. Otherwise `-`. |

Not scored, because only a real build or a browser can see it: whether the
wrapper has a height, and whether a hook ended up in a Server Component.

## Rules that keep it honest

1. **The brief is the real one.** `setup.ts` calls the same `getPrompt()` the
   site calls. Never hand-write or tidy a `BRIEF.md`.
2. **Never leak the answer.** `expect` in `tasks.json` is for scoring only. The
   agent sees the `prompt` text and nothing else from the task.
3. **Same prompt for every agent.** No hints about a component, no extra rules
   for a hard task. If the agent needs a hint, the brief needs the fix.
4. **Agents work outside the repo.** Inside it they could read the real
   component files instead of the brief.
5. **No model grades a model.** Every check is code. If a check needs
   judgment, leave it out and say so above.

## When a task fails

Read the failure before changing anything. It is one of three things:

- The **brief** is wrong or unclear. Fix `lib/registry/prompt.ts` or the
  registry entry, then rerun. This is the result the test exists to find.
- The **agent** made a mistake the brief could not have prevented. Leave it. One
  run is one sample; rerun before believing a single failure.
- The **check** is wrong. Fix `score.ts`, and score the old run again to see
  that only that verdict moved.

## Add a task

Add an object to `tasks.json`. Pick a component whose shape no other task
covers, write the request the way a customer would, and name exact prop values
in it so `expect` can check them. Free entries only: a Pro entry's brief can
lock.
