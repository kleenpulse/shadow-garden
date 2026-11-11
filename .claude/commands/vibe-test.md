---
description: Run the vibe test — do agents build correctly from the "Copy for Agent" brief?
argument-hint: "[task-id ...]"
---

Run the vibe test described in `scripts/vibe/README.md`. Read that file first;
its "Rules that keep it honest" bind every step here.

1. Run `bun run vibe:setup $ARGUMENTS` and note the run folder and the task
   folders it prints.
2. Start one subagent per task folder, all in one message so they run together.
   Give each exactly this prompt, with only the folder changed:

   ```text
   You are a coding agent working in the project at <folder>

   Read TASK.md in that folder and do what it asks. Do not read or write anything
   outside that folder. When you are done, reply with a short summary of what you did.
   ```

   Add nothing to it. Do not name the component, the props, or this repository.
3. When every subagent has finished, run `bun run vibe:score`.
4. Report the table. For each failure, open the task folder and say which of
   the three causes in the README it is — brief, agent, or check — with the
   line that shows it. Do not fix anything unless asked.
