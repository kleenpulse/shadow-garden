// Catalog reads shared by the page's actions (site-actions.js) and the bridge
// that other agent sites call (bridge/bridge-actions.js). Both run on Motion
// Garden's own origin, so the API answers same-origin. The ranking, schemas and
// briefs live in the Next app (app/api/agent/*), never copied here.
//
// Each component's documents (describe, brief, source) are static files, built
// once per deploy, so reading one costs the site no function call. A static file
// cannot answer to a query, so the two choices a chat needs are made here: leave
// out a brief that is too long (briefAnswer), and take one part of one file
// (fileAnswer). Only search runs on the server.

/** The catalog's categories, as the search endpoint accepts them. */
export const CATEGORIES = [
  "Backgrounds",
  "Text Animations",
  "Micro-interactions",
  "Power-User Systems",
  "Hero Templates",
];

const SLUG_MAX = 80;

// A tool result is capped at 64 KB by the runtime, and the visitor's model pays
// for every byte. A longer brief is left out and its files are listed instead.
export const BRIEF_MAX = 30_000;

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

// A component's documents do not change while the page is open, and a long file
// is read part by part from the same source document. Each is fetched once.
const documents = new Map();

/**
 * Read one of a component's static documents, once per page. A refusal or a
 * failure is not kept, so the next call asks again.
 */
function readDocument(path) {
  if (!documents.has(path)) {
    const reading = readJson(path).then(
      (body) => {
        if (!body || body.ok !== true) documents.delete(path);
        return body;
      },
      (error) => {
        documents.delete(path);
        throw error;
      },
    );
    documents.set(path, reading);
  }
  return documents.get(path);
}

export class GardenData {
  /**
   * What get_component_code answers from a component's brief document
   * (/api/agent/component/<slug>/brief). A brief over the limit is left out, and
   * the answer lists the files, the install commands and the Markdown link.
   *
   * :param doc: The brief document, or the site's refusal (ok false).
   * :param max: The longest brief, in characters, a chat tool result may carry.
   * :return: The tool result.
   */
  static briefAnswer(doc, max) {
    if (!doc || doc.ok !== true) {
      return doc;
    }
    const shadcn = doc.shadcn ? { shadcn: doc.shadcn } : {};
    const head = { ok: true, slug: doc.slug, name: doc.name, page: doc.page, markdown: doc.markdown };
    if (doc.brief.length > max) {
      const size = doc.brief.length.toLocaleString("en-US");
      return {
        ...head,
        install: doc.install,
        ...shadcn,
        files: doc.files,
        briefIncluded: false,
        reason: `The integration brief is ${size} characters, over the ${max.toLocaleString("en-US")} a chat can carry. The whole brief is at the markdown link, and the page's "Copy for Agent" button copies the same text. Each file can also be read on its own.`,
      };
    }
    return { ...head, ...shadcn, briefIncluded: true, brief: doc.brief };
  }

  /**
   * What get_component_file answers from a component's source document
   * (/api/agent/component/<slug>/source): one part of one file, or a refusal
   * that names the files or the parts there are.
   *
   * :param doc: The source document, or the site's refusal (ok false).
   * :param file: The file's path, as the files list gives it.
   * :param part: Which part of the file, from 1. Missing means 1.
   * :return: The tool result.
   */
  static fileAnswer(doc, file, part) {
    if (!doc || doc.ok !== true) {
      return doc;
    }
    const found = doc.files.find((candidate) => candidate.file === file);
    if (!found) {
      return {
        ok: false,
        reason: `"${file}" is not one of this component's files. Its files are: ${doc.files.map((f) => f.file).join(", ")}.`,
        field: "file",
      };
    }
    const wanted = part === undefined || part === null ? 1 : Number(part);
    const parts = found.parts.length;
    if (!Number.isInteger(wanted) || wanted < 1 || wanted > parts) {
      return {
        ok: false,
        reason: parts === 1 ? "This file has 1 part." : `This file has ${parts} parts: send a part from 1 to ${parts}.`,
        field: "part",
      };
    }
    return {
      ok: true,
      slug: doc.slug,
      file: found.file,
      role: found.role,
      lang: found.lang,
      chars: found.chars,
      part: wanted,
      parts: parts,
      code: found.parts[wanted - 1],
    };
  }

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
        "Read one component's controls (name, kind, default, range or options), npm dependencies, install commands, the one-line shadcn install, shipped files and page link. Changes nothing. Call it with a slug from website_search_components before saying how a component is tuned or installed.",
      effect: "read",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["slug"],
        properties: {
          slug: { type: "string", minLength: 1, maxLength: SLUG_MAX, description: "A slug from website_search_components." },
        },
      },
      execute: (args) => readDocument(`/api/agent/component/${encodeURIComponent(args.slug)}`),
      ...extra,
    };
  }

  static codeAction(extra) {
    return {
      name: "get_component_code",
      description:
        "Get a component's full integration brief: every source file with comments stripped, the install command, the props table, usage and integration rules. It is the same text as the page's Copy for Agent button, and it is long, so call it only when the visitor asks for the code or how to add the component to their project. When briefIncluded is false the brief is too large for a chat: give the install command, the list of files and the markdown link, which the visitor's coding agent can read the whole brief from, and offer to show any one file with website_get_component_file.",
      effect: "read",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["slug"],
        properties: {
          slug: { type: "string", minLength: 1, maxLength: SLUG_MAX, description: "A slug from website_search_components." },
        },
      },
      execute: async (args) =>
        GardenData.briefAnswer(await readDocument(`/api/agent/component/${encodeURIComponent(args.slug)}/brief`), BRIEF_MAX),
      ...extra,
    };
  }

  static fileAction(extra) {
    return {
      name: "get_component_file",
      description:
        "Read one source file of a component, comments stripped, exactly as its page's Code tab shows it. Changes nothing. Call it when the visitor asks to see or asks about one file, or after website_get_component_code answers briefIncluded false. Take the path from the files list of website_describe_component or website_get_component_code, and never guess one. A long file comes in parts: the result gives part and parts, so call again with the next part number for the rest.",
      effect: "read",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["slug", "file"],
        properties: {
          slug: { type: "string", minLength: 1, maxLength: SLUG_MAX, description: "A slug from website_search_components." },
          file: { type: "string", minLength: 1, maxLength: 200, description: "The file's path, exactly as the files list gives it." },
          part: { type: "integer", minimum: 1, maximum: 20, description: "Which part of a long file, default 1." },
        },
      },
      execute: async (args) =>
        GardenData.fileAnswer(
          await readDocument(`/api/agent/component/${encodeURIComponent(args.slug)}/source`),
          args.file,
          args.part,
        ),
      ...extra,
    };
  }
}
