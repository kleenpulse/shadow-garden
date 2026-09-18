import type { ComponentType } from "react";

// slug → the template's page component. The landing-page analogue of previews.ts,
// and deliberately NOT part of it: previews are "use client" + `ssr: false`,
// because a WebGL canvas has nothing to prerender. A template is a page — it must
// render on the server or the bench iframe shows a blank document while 40 files
// of client JS parse.
//
// Server-side dynamic import, so only the template being viewed is bundled. The
// literal specifiers are what let Turbopack trace each one; a computed path would
// resolve at runtime and ship nothing.

type TemplateRoot = () => Promise<{ default: ComponentType }>;

const TEMPLATE_ROOTS: Record<string, TemplateRoot> = {
  vellum: () => import("./vellum/page"),
  imago: () => import("./imago/page"),
  voltline: () => import("./voltline/page"),
  jinlong: () => import("./jinlong/page"),
  noctis: () => import("./noctis/page"),
  "ember-oak": () => import("./ember-oak/page"),
  signal: () => import("./signal/page"),
  obscura: () => import("./obscura/page"),
  aphelion: () => import("./aphelion/page"),
};

export function hasTemplateRoot(slug: string): boolean {
  return slug in TEMPLATE_ROOTS;
}

/** The template's root component, or null when the slug has no registration yet. */
export async function loadTemplateRoot(
  slug: string,
): Promise<ComponentType | null> {
  const load = TEMPLATE_ROOTS[slug];
  if (!load) return null;
  return (await load()).default;
}
