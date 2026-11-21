// Catalog reads shared by the page's actions (site-actions.js) and the bridge
// that other agent sites call (bridge/bridge-actions.js). Both run on Motion
// Garden's own origin, so the API answers same-origin. The ranking, schemas and
// briefs live in the Next app (app/api/agent/*), never copied here.

/** The catalog's categories, as the search endpoint accepts them. */
export const CATEGORIES = [
  "Backgrounds",
  "Text Animations",
  "Micro-interactions",
  "Power-User Systems",
  "Hero Templates",
];

const SLUG_MAX = 80;

/**
 * Read one endpoint. A refusal from the site (a JSON body with ok false) comes
 * back as data, so the agent gets the site's reason. Anything else that fails
 * throws, which the runtime reports as "unknown".
 */
async function readJson(path, params) {
  const url = new URL(path, import.meta.url);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  let body = null;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Motion Garden answered ${response.status} without JSON.`);
  }
  if (!response.ok && !(body && body.ok === false)) {
    throw new Error(`Motion Garden answered ${response.status}.`);
  }
  return body;
}

export class GardenData {
  static searchAction(extra) {
    return {
      name: "search_components",
      description:
        "Search the Motion Garden catalog for what the visitor describes, such as \"purple waves background\" or \"magnetic button\". Returns up to 8 matches with slug, name, category, a one-line summary and how many controls each has, or an empty list. Changes nothing. Call it before naming, opening or describing any component, and never guess a slug.",
      effect: "read",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: { type: "string", minLength: 1, maxLength: 200, description: "What the visitor is looking for, in a few words." },
          category: { type: "string", enum: CATEGORIES, description: "Only when the visitor names a kind of component." },
          limit: { type: "integer", minimum: 1, maximum: 8, description: "How many matches, default 6." },
        },
      },
      execute: (args) => readJson("/api/agent/search", { q: args.query, category: args.category, limit: args.limit }),
      ...extra,
    };
  }

  static describeAction(extra) {
    return {
      name: "describe_component",
      description:
        "Read one component's controls (name, kind, default, range or options), npm dependencies, install commands, shipped files and page link. Changes nothing. Call it with a slug from website_search_components before saying how a component is tuned or installed.",
      effect: "read",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["slug"],
        properties: {
          slug: { type: "string", minLength: 1, maxLength: SLUG_MAX, description: "A slug from website_search_components." },
        },
      },
      execute: (args) => readJson(`/api/agent/component/${encodeURIComponent(args.slug)}`),
      ...extra,
    };
  }

  static codeAction(extra) {
    return {
      name: "get_component_code",
      description:
        "Get a component's full integration brief: every source file with comments stripped, the install command, the props table, usage and integration rules. It is the same text as the page's Copy for Agent button, and it is long, so call it only when the visitor asks for the code or how to add the component to their project. When briefIncluded is false, give the reason and the page link instead.",
      effect: "read",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["slug"],
        properties: {
          slug: { type: "string", minLength: 1, maxLength: SLUG_MAX, description: "A slug from website_search_components." },
        },
      },
      execute: (args) => readJson(`/api/agent/component/${encodeURIComponent(args.slug)}`, { brief: 1 }),
      ...extra,
    };
  }
}
