---
"motion-garden": minor
---

Motion Garden is now an open agentic website, and there are three new ways to get a component out of it.

- **Ask the Garden**: an assistant on every catalog page. Tell it what you are building and it finds a component, tunes the live preview for you and hands over the code. You get two free questions a day, paid for by Motion Garden, on a free AI model; connect your own AI model in its settings for more. It runs in your browser, and other agentic websites can call the same network to search the catalog and fetch component code.
- **shadcn registry**: every component now installs with the shadcn CLI, for example `bunx shadcn@latest add https://motion-garden.netlify.app/r/waves.json`. Or name the registry once in your `components.json` and install as `@motion-garden/waves`. It puts the files under your own aliases, adds the npm packages and the theme tokens the component needs, and keeps your `lib/utils.ts`. The catalog is at `/r/registry.json`, which the shadcn MCP server reads too.
- **Briefs as Markdown**: add `.md` to any component URL (`/components/waves.md`) to get its whole integration brief as Markdown, at any size. Coding agents can fetch it directly.
- **Endpoints for agents**: `/llms.txt` now lists JSON endpoints that search the catalog, describe a component and return its brief and source, and `robots.txt` lets agents reach them.
