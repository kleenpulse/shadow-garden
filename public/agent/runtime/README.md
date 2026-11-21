# Browser runtime

This folder runs the agent network in the visitor's browser. Copy it into each
agentified site, and do not change it there.

It is a copy of the [nsdeploy](https://github.com/cognizant-ai-lab/nsdeploy) browser
runtime (Apache 2.0, see `LICENSE.txt`) at nsdeploy commit `53a787c` (2026-11-11), with
the edits listed below.

Why it is edited. A site's page has its own functions, called actions, like a room
search. nsdeploy's runtime does not let an agent use them as tools. The agent can only
offer a button or form. The visitor must click it and, by default, confirm the action.
The agent cannot answer until the visitor writes again.

Without editing the runtime, a site can plug in its own confirmation dialog, but not
tools that run the page's functions: the runtime builds the tool list in its own code. So
the runtime is edited. nsdeploy has no issue or pull request for this, so the edits live
here.

With the edits, each action the site's settings file (`agent-manifest.json`) lists under
`agentTools` becomes a `website_<name>` tool. Look-ups and undoable changes, such as
filling in the booking form, run without asking. Only actions the site marks
`irreversible`, like a booking, wait for the visitor to confirm. The AI model cannot
change these marks.

Linked sites need one more edit. When this site calls a partner site's network, that
network runs in this visitor's browser and on their key. In nsdeploy's runtime, the
partner network chooses the model and how many steps it takes, so it chooses what the
visitor pays for. With the edit, it runs on the visitor's model or, if they picked none,
this site's model, within this site's step limit.

Edited files. Each one has a line near its top saying that it was changed:

- `runner.js` offers each local-only action listed in the manifest's `actions.agentTools`
  as a `website_<name>` tool and runs it through the site's action registry. Actions with
  the `irreversible` effect ask the visitor first. A partner network never gets this
  site's actions. It gets only the actions its own bridge shares with this site that its
  own `actions.agentTools` lists (`websiteToolRefusal`). Reads run in a frame on the
  partner's origin. Writes run in the partner's own window, where the visitor confirms
  them, so this page does not ask as well. A partner that shares none gets no note
  telling it to report a missing integration. It also adds a `render_cruse` tool for forms and tables
  in the chat. It stops a partner agent at the step limit `engine.js` passes.
- `engine.js` passes the page's confirmation dialog to `runner.js`. It also runs a partner
  network on the visitor's model or, when the visitor picked none, on this site's
  front-agent model, and passes this site's step limit, so a partner network cannot choose
  what the visitor pays for.
- `cruse.js` accepts CRUSE replies without code fences and merges forms from several
  agents into one. It also tells agents about the `render_cruse` tool.
- `ui.js` shows a time picker for `format: "time"` fields and option labels from
  `x-ui.enumLabels`. It groups radio buttons under a legend and links each field to its
  description for screen readers. The ⚙ AI model settings panel lists hosted Otari first,
  the template's default router, and fills in its settings for a key that starts with
  `otk_`. A key that starts with `otk_v1_eu_` gets the EU gateway,
  `https://eu.api.otari.ai/api/v1`, because the default gateway refuses it with HTTP 421.
  The Google AI Studio model is `models/gemini-3.8-flash`, the name Google's model
  list uses, so the panel's model check accepts it. The panel also has a Connect with
  OpenRouter button and recognizes OpenRouter keys, which start with `sk-or-`. Where the
  button cannot work, OpenRouter is listed with the other providers instead. For an
  OpenRouter key it links to the key's page on OpenRouter. The panel's first line says
  which provider, model and key the chat uses. When a partner's action needs the
  partner's own window, the chat asks in a message with an Open button that names the
  partner. "Agents working for you" shows each partner's address with its path, such as
  `localhost:8081/marrow_point_harbor_tours`, not only its host. Before the first call it
  names the partner from `link_labels`, as the consent card does.
- `action-transport.js` opens the confirmation dialog with focus on its heading, so a
  stray Enter cannot confirm an action. Closing the dialog puts focus back where it was.
  It lets the chat ask before a partner's window opens (`setActionWindowPrompt`). An
  action marked `confirmsInWindow` shows its own confirmation in that window, so the
  bridge skips its generic dialog.
- `actions.js` keeps an action's `confirmsInWindow` mark.
- `index.js` tells visitors that only actions that cannot be undone ask first, when the
  site offers `website_*` tools. Opening its "website actions connected" line lists the
  page's actions by name and marks the ones that ask first. It also finishes an
  OpenRouter sign-in before it reads the saved setup.
- `llm.js` keeps Gemini's thought signature (`extra_content`) on each streamed tool call,
  so it goes back to the model on the next step. Gemini 3 refuses that step without it.
  Gemini also streams each tool call whole and without an `index`, so a new call id
  starts a new call instead of joining the one before it.

Added files:

- `openrouter-connect.js` runs the Connect with OpenRouter sign-in (OAuth with PKCE). It
  sends the visitor to OpenRouter, checks the reply, swaps the one-time code for a key on
  the visitor's own account, and saves the key like a pasted one. Sites need no app
  registration.
- `in-use-line.js` builds the "In use" line of ⚙ AI model settings: the provider, the
  model and the last four characters of the key the chat uses.

Protocol name: `nsdeploy`. Use it for `<protocol_name>` in `agent-manifest.json`. It
names the discovery files, such as `.well-known/nsdeploy.json`, that nsdeploy's tools read.

Do not edit or replace these files for one site. This copy is for use until nsdeploy's
own runtime offers these tools and partner limits.

nsdeploy plans to move to a runtime built on the neuro-san TS package (nsdeploy PR #10).
That runtime has no `website_*` tools yet. Before a site switches to it, move the edits
above to it and check that it offers those tools and runs a partner network on the
caller's model and step limit.
