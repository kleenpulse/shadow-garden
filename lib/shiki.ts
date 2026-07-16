import "server-only";
import { createHighlighter, type Highlighter } from "shiki";

// Server-side syntax highlighting. Under Cache Components, free-tier pages
// prerender statically, so this runs at build time and ships zero client
// highlighter JS. A module-level singleton keeps the WASM highlighter warm.
let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["vesper"],
      langs: ["tsx", "jsx", "ts", "js", "bash", "css", "json"],
    });
  }
  return highlighterPromise;
}

export async function highlightToHtml(code: string, lang: string): Promise<string> {
  const highlighter = await getHighlighter();
  return highlighter.codeToHtml(code, {
    lang,
    theme: "vesper",
  });
}
