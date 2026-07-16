import type { MDXComponents } from "mdx/types";

// Required at the project root for @next/mdx with the App Router — MDX will not
// compile without this file. Prose styling for long-form docs is layered in here
// (and via `prose` classes in the docs layout) as content lands.
const components: MDXComponents = {};

export function useMDXComponents(): MDXComponents {
  return components;
}
